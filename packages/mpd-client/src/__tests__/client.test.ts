import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { MpdClient } from '../client.js'

/** Create an MpdClient with mock connections wired up. */
function createTestClient() {
  const client = new MpdClient({ host: 'localhost', port: 6600 })

  // Replace the real connections with mocks
  const cmdConn = new EventEmitter() as EventEmitter & {
    connected: boolean
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    sendCommand: ReturnType<typeof vi.fn>
    sendBinaryCommand: ReturnType<typeof vi.fn>
  }
  cmdConn.connected = false
  cmdConn.connect = vi.fn(async () => { cmdConn.connected = true })
  cmdConn.disconnect = vi.fn(() => { cmdConn.connected = false })
  cmdConn.sendCommand = vi.fn(async () => '')
  cmdConn.sendBinaryCommand = vi.fn(async () => ({ headers: new Map(), data: Buffer.alloc(0) }))

  const idleConn = new EventEmitter() as typeof cmdConn
  idleConn.connected = false
  idleConn.connect = vi.fn(async () => { idleConn.connected = true })
  idleConn.disconnect = vi.fn(() => { idleConn.connected = false })
  idleConn.sendCommand = vi.fn(async () => '')
  idleConn.sendBinaryCommand = vi.fn(async () => ({ headers: new Map(), data: Buffer.alloc(0) }))

  ;(client as any).cmdConn = cmdConn
  ;(client as any).idleConn = idleConn

  return { client, cmdConn, idleConn }
}

describe('MpdClient', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  describe('connect', () => {
    it('connects both connections and emits connect event', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      // Make idle hang so the loop doesn't spin
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))

      const connectHandler = vi.fn()
      client.on('connect', connectHandler)

      await client.connect()

      expect(cmdConn.connect).toHaveBeenCalledWith('localhost', 6600, undefined)
      expect(idleConn.connect).toHaveBeenCalledWith('localhost', 6600, undefined)
      expect(client.connected).toBe(true)
      expect(connectHandler).toHaveBeenCalledOnce()
    })

    it('raises binarylimit on the command connection and tolerates an ACK', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))

      await client.connect()
      expect(cmdConn.sendCommand).toHaveBeenCalledWith('binarylimit 1048576')

      const old = createTestClient()
      old.idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      old.cmdConn.sendCommand.mockRejectedValueOnce(new Error('ACK [5@0] {} unknown command "binarylimit"'))
      await expect(old.client.connect()).resolves.toBeUndefined()
      expect(old.client.connected).toBe(true)
    })

    it('fails connect() when a connection dies during the handshake instead of reporting half-connected', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      // cmdConn greets, then drops while binarylimit is pending
      cmdConn.sendCommand.mockImplementationOnce(async () => {
        cmdConn.connected = false
        cmdConn.emit('close')
        throw new Error('Connection closed')
      })
      const connectHandler = vi.fn()
      client.on('connect', connectHandler)

      await expect(client.connect()).rejects.toThrow('Connection lost during handshake')
      expect(client.connected).toBe(false)
      expect(connectHandler).not.toHaveBeenCalled()
      expect(idleConn.disconnect).toHaveBeenCalled()
    })

    it('starts idle loop after connecting', async () => {
      const { client, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))

      await client.connect()

      expect(idleConn.sendCommand).toHaveBeenCalledWith('idle')
    })
  })

  describe('disconnect', () => {
    it('disconnects both connections', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()

      client.disconnect()

      expect(cmdConn.disconnect).toHaveBeenCalled()
      expect(idleConn.disconnect).toHaveBeenCalled()
      expect(client.connected).toBe(false)
    })

    it('does not schedule auto-reconnect', async () => {
      const { client, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()

      client.disconnect()
      vi.advanceTimersByTime(60_000)

      expect((client as any).reconnectTimer).toBeNull()
    })
  })

  describe('handleDisconnect', () => {
    it('emits disconnect event when connection drops', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()

      const disconnectHandler = vi.fn()
      client.on('disconnect', disconnectHandler)

      cmdConn.emit('close')

      expect(disconnectHandler).toHaveBeenCalledOnce()
      expect(client.connected).toBe(false)
    })

    it('emits disconnect only once when both connections close', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()

      const disconnectHandler = vi.fn()
      client.on('disconnect', disconnectHandler)

      cmdConn.emit('close')
      idleConn.emit('close')

      expect(disconnectHandler).toHaveBeenCalledOnce()
    })
  })

  describe('scheduleReconnect', () => {
    it('reconnects after delay', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()

      cmdConn.emit('close')
      expect(client.connected).toBe(false)

      // The new connections created during reconnect also need mock setup
      // scheduleReconnect creates new MpdConnection instances, which are real
      // We can't easily intercept those, so just verify the timer was set
      expect((client as any).reconnectTimer).not.toBeNull()
    })
  })

  describe('idle loop', () => {
    it('emits subsystem events from idle responses', async () => {
      const { client, idleConn } = createTestClient()
      idleConn.sendCommand
        .mockResolvedValueOnce('changed: player\n')
        .mockReturnValue(new Promise(() => {}))

      const playerHandler = vi.fn()
      client.on('player', playerHandler)

      await client.connect()
      await vi.advanceTimersByTimeAsync(0)

      expect(playerHandler).toHaveBeenCalledOnce()
    })

    it('triggers disconnect when idle loop errors', async () => {
      const { client, idleConn } = createTestClient()
      idleConn.sendCommand.mockRejectedValueOnce(new Error('Connection lost'))

      const disconnectHandler = vi.fn()
      client.on('disconnect', disconnectHandler)
      // Suppress unhandled error event
      client.on('error', () => {})

      await client.connect()
      await vi.advanceTimersByTimeAsync(0)

      expect(disconnectHandler).toHaveBeenCalledOnce()
      expect(client.connected).toBe(false)
    })
  })

  describe('connectWithRetry', () => {
    it('emits error and schedules a retry when connect fails, without throwing', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      cmdConn.connect.mockRejectedValue(new Error('ECONNREFUSED'))
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))

      const errorHandler = vi.fn()
      client.on('error', errorHandler)

      client.connectWithRetry()
      await vi.advanceTimersByTimeAsync(0)

      expect(errorHandler).toHaveBeenCalledOnce()
      expect(errorHandler.mock.calls[0][0].message).toMatch(/Connect failed \(retry in 1s\)/)
      expect(client.connected).toBe(false)
      expect((client as any).reconnectTimer).not.toBeNull()
    })

    it('does not throw when connect fails and nobody listens for errors', async () => {
      const { client, cmdConn } = createTestClient()
      cmdConn.connect.mockRejectedValue(new Error('ECONNREFUSED'))

      client.connectWithRetry()
      await expect(vi.advanceTimersByTimeAsync(0)).resolves.toBeDefined()
      expect((client as any).reconnectTimer).not.toBeNull()
    })

    it('disconnect() cancels the pending retry', async () => {
      const { client, cmdConn } = createTestClient()
      cmdConn.connect.mockRejectedValue(new Error('ECONNREFUSED'))

      client.connectWithRetry()
      await vi.advanceTimersByTimeAsync(0)
      expect((client as any).reconnectTimer).not.toBeNull()

      client.disconnect()
      expect((client as any).reconnectTimer).toBeNull()
      await vi.advanceTimersByTimeAsync(60_000)
      expect((client as any).reconnectTimer).toBeNull()
    })
  })

  describe('connection errors', () => {
    it('forwards connection errors to the client error event', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()

      const errorHandler = vi.fn()
      client.on('error', errorHandler)
      const err = new Error('ECONNRESET')
      cmdConn.emit('error', err)

      expect(errorHandler).toHaveBeenCalledWith(err)
    })

    it('swallows connection errors when the client has no error listener', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()

      expect(() => cmdConn.emit('error', new Error('ECONNRESET'))).not.toThrow()
    })

    it('does not accumulate listeners when connect() runs twice on the same connections', async () => {
      const { client, cmdConn, idleConn } = createTestClient()
      idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await client.connect()
      await client.connect()

      expect(cmdConn.listenerCount('close')).toBe(1)
      expect(cmdConn.listenerCount('error')).toBe(1)
    })
  })

  describe('argument quoting', () => {
    async function connectedClient() {
      const t = createTestClient()
      t.idleConn.sendCommand.mockReturnValue(new Promise(() => {}))
      await t.client.connect()
      t.cmdConn.sendCommand.mockClear()
      return t
    }

    it('quotes and escapes URIs and names', async () => {
      const { client, cmdConn } = await connectedClient()

      await client.add('Dir "A"/song.mp3')
      expect(cmdConn.sendCommand).toHaveBeenLastCalledWith('add "Dir \\"A\\"/song.mp3"')

      await client.loadPlaylist('back\\slash')
      expect(cmdConn.sendCommand).toHaveBeenLastCalledWith('load "back\\\\slash"')

      await client.lsinfo('a b')
      expect(cmdConn.sendCommand).toHaveBeenLastCalledWith('lsinfo "a b"')

      await client.search('say "hi"', 'title')
      expect(cmdConn.sendCommand).toHaveBeenLastCalledWith('search title "say \\"hi\\""')

      await client.findAlbumSongs('Al"bum', 'Art"ist')
      expect(cmdConn.sendCommand).toHaveBeenLastCalledWith('find Album "Al\\"bum" AlbumArtist "Art\\"ist"')
    })

    it('quotes every URI in addMultiple', async () => {
      const { client, cmdConn } = await connectedClient()
      await client.addMultiple(['a"b.mp3', 'c.mp3'])
      expect(cmdConn.sendCommand).toHaveBeenLastCalledWith(
        'command_list_begin\nadd "a\\"b.mp3"\nadd "c.mp3"\ncommand_list_end',
      )
    })

    it('refuses arguments containing line breaks instead of sending a second command', async () => {
      const { client, cmdConn } = await connectedClient()
      await expect(client.add('x"\nclear')).rejects.toThrow('line breaks')
      await expect(client.savePlaylist('name\nrm "other"')).rejects.toThrow('line breaks')
      expect(cmdConn.sendCommand).not.toHaveBeenCalled()
    })

    it('rejects non-identifier search types', async () => {
      const { client, cmdConn } = await connectedClient()
      await expect(client.search('x', 'any "y"')).rejects.toThrow('Invalid search type')
      expect(cmdConn.sendCommand).not.toHaveBeenCalled()
    })
  })
})
