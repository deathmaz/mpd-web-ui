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
})
