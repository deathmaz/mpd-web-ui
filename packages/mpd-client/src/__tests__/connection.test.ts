import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { MpdConnection } from '../connection.js'
import { MpdError } from '../protocol.js'

/**
 * Create a MpdConnection connected to a fake socket.
 * Returns the connection and a `feed` function to simulate incoming data.
 */
function createTestConnection() {
  const conn = new MpdConnection()

  // Access private fields to set up a connected state
  const socket = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    setNoDelay: ReturnType<typeof vi.fn>
  }
  socket.write = vi.fn()
  socket.destroy = vi.fn(() => { socket.emit('close') })
  socket.connect = vi.fn()
  socket.setNoDelay = vi.fn()

  // Manually wire up the connection by simulating the connect flow
  // We'll directly set internal state to skip the TCP handshake
  ;(conn as any).socket = socket
  ;(conn as any)._connected = true
  ;(conn as any).protocolVersion = '0.23.5'

  // Wire the socket's data event to the connection's onData handler
  socket.on('data', (chunk: Buffer) => {
    ;(conn as any).onData(chunk)
  })

  // Wire close handler (normally set up in connect())
  socket.on('close', () => {
    ;(conn as any)._connected = false
    conn.emit('close')
    const pending = (conn as any).pendingCommand
    if (pending) {
      ;(conn as any).pendingCommand = null
      pending.reject(new Error('Connection closed'))
    }
    const pendingBin = (conn as any).pendingBinary
    if (pendingBin) {
      ;(conn as any).pendingBinary = null
      pendingBin.reject(new Error('Connection closed'))
    }
    const pendingList = (conn as any).pendingCommandList
    if (pendingList) {
      ;(conn as any).pendingCommandList = null
      ;(conn as any).commandListBuffers = []
      ;(conn as any).commandListCurrent = ''
      pendingList.reject(new Error('Connection closed'))
    }
    for (const cmd of (conn as any).commandQueue) {
      cmd.reject(new Error('Connection closed'))
    }
    ;(conn as any).commandQueue = []
    ;(conn as any).processing = false
  })

  function feed(data: string | Buffer) {
    const buf = typeof data === 'string' ? Buffer.from(data) : data
    socket.emit('data', buf)
  }

  return { conn, socket, feed }
}

describe('MpdConnection', () => {
  describe('text commands', () => {
    it('resolves a simple command response', async () => {
      const { conn, socket, feed } = createTestConnection()

      const promise = conn.sendCommand('status')
      expect(socket.write).toHaveBeenCalledWith('status\n')

      feed('volume: 80\nrepeat: 0\nOK\n')

      const result = await promise
      expect(result).toBe('volume: 80\nrepeat: 0\n')
    })

    it('resolves an empty OK response', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendCommand('play')
      feed('OK\n')

      const result = await promise
      expect(result).toBe('')
    })

    it('rejects on ACK error', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendCommand('play 999')
      feed('ACK [50@0] {play} No such song\n')

      await expect(promise).rejects.toBeInstanceOf(MpdError)
      await expect(promise).rejects.toMatchObject({
        errorCode: 50,
        currentCommand: 'play',
        message: 'No such song',
      })
    })

    it('handles chunked text data', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendCommand('status')

      // Data arrives in pieces
      feed('vol')
      feed('ume: 50\n')
      feed('repeat: 1\nOK\n')

      const result = await promise
      expect(result).toBe('volume: 50\nrepeat: 1\n')
    })

    it('queues multiple commands and processes them in order', async () => {
      const { conn, socket, feed } = createTestConnection()

      const p1 = conn.sendCommand('status')
      const p2 = conn.sendCommand('currentsong')

      // Only first command should be written immediately
      expect(socket.write).toHaveBeenCalledTimes(1)
      expect(socket.write).toHaveBeenCalledWith('status\n')

      // Respond to first
      feed('volume: 50\nOK\n')
      const r1 = await p1
      expect(r1).toBe('volume: 50\n')

      // Second should now be sent
      expect(socket.write).toHaveBeenCalledTimes(2)
      expect(socket.write).toHaveBeenCalledWith('currentsong\n')

      feed('file: song.mp3\nTitle: Test\nOK\n')
      const r2 = await p2
      expect(r2).toBe('file: song.mp3\nTitle: Test\n')
    })
  })

  describe('binary commands', () => {
    it('reads binary data (album art)', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendBinaryCommand('readpicture "song.mp3" 0')

      // Send headers + binary data + OK
      const binaryData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
      const response = Buffer.concat([
        Buffer.from(`size: 6\ntype: image/jpeg\nbinary: 6\n`),
        binaryData,
        Buffer.from('\nOK\n'),
      ])

      feed(response)

      const result = await promise
      expect(result.headers.get('size')).toBe('6')
      expect(result.headers.get('type')).toBe('image/jpeg')
      expect(result.data).toEqual(binaryData)
      expect(result.data.length).toBe(6)
    })

    it('handles binary data split across chunks', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendBinaryCommand('albumart "song.mp3" 0')

      const binaryData = Buffer.alloc(100)
      for (let i = 0; i < 100; i++) binaryData[i] = i

      // Send headers in one chunk
      feed(`size: 100\nbinary: 100\n`)

      // Send binary data in small chunks
      feed(binaryData.subarray(0, 30))
      feed(binaryData.subarray(30, 70))
      feed(binaryData.subarray(70, 100))

      // Send trailing newline + OK
      feed('\nOK\n')

      const result = await promise
      expect(result.data).toEqual(binaryData)
      expect(result.data.length).toBe(100)
    })

    it('preserves non-UTF-8 bytes in binary data', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendBinaryCommand('readpicture "song.mp3" 0')

      // Create binary data with bytes that would be corrupted by UTF-8 conversion
      const binaryData = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, // JPEG magic
        0x80, 0x81, 0x82, 0x83, // Invalid UTF-8 sequences
        0xfe, 0xff, 0xc0, 0xc1, // More problematic bytes
      ])

      const response = Buffer.concat([
        Buffer.from(`size: ${binaryData.length}\ntype: image/jpeg\nbinary: ${binaryData.length}\n`),
        binaryData,
        Buffer.from('\nOK\n'),
      ])

      feed(response)

      const result = await promise
      // Every byte must match exactly — no UTF-8 corruption
      expect(Buffer.compare(result.data, binaryData)).toBe(0)
    })

    it('rejects binary command on ACK', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendBinaryCommand('readpicture "missing.mp3" 0')
      feed('ACK [50@0] {readpicture} No file exists\n')

      await expect(promise).rejects.toBeInstanceOf(MpdError)
    })
  })

  describe('command timeout', () => {
    it('disconnects when a command does not receive a response within 10s', async () => {
      vi.useFakeTimers()
      const { conn, socket } = createTestConnection()

      const promise = conn.sendCommand('status')

      vi.advanceTimersByTime(10_000)

      await expect(promise).rejects.toThrow('Connection closed')
      expect(socket.destroy).toHaveBeenCalled()
      expect(conn.connected).toBe(false)
      vi.useRealTimers()
    })

    it('rejects all queued commands on timeout disconnect', async () => {
      vi.useFakeTimers()
      const { conn, socket } = createTestConnection()

      const p1 = conn.sendCommand('status')
      const p2 = conn.sendCommand('currentsong')

      vi.advanceTimersByTime(10_000)

      await expect(p1).rejects.toThrow('Connection closed')
      await expect(p2).rejects.toThrow('Connection closed')
      vi.useRealTimers()
    })

    it('does not time out the idle command', async () => {
      vi.useFakeTimers()
      const { conn } = createTestConnection()

      const promise = conn.sendCommand('idle')

      // Advance well past the timeout
      vi.advanceTimersByTime(60_000)

      // Promise should still be pending (not rejected)
      const settled = await Promise.race([
        promise.then(() => 'resolved').catch(() => 'rejected'),
        Promise.resolve('pending'),
      ])
      expect(settled).toBe('pending')
      vi.useRealTimers()
    })

    it('clears timeout when command succeeds', async () => {
      vi.useFakeTimers()
      const { conn, feed } = createTestConnection()

      const promise = conn.sendCommand('status')
      feed('volume: 80\nOK\n')
      await promise

      // Advancing past timeout should not cause issues
      vi.advanceTimersByTime(10_000)

      // No unhandled rejection — timer was cleared
      vi.useRealTimers()
    })
  })

  describe('connection lifecycle', () => {
    it('reports connected state', () => {
      const { conn } = createTestConnection()
      expect(conn.connected).toBe(true)
    })

    it('rejects pending commands on disconnect', async () => {
      const { conn, socket } = createTestConnection()

      const promise = conn.sendCommand('status')
      socket.emit('close')

      await expect(promise).rejects.toThrow('Connection closed')
      expect(conn.connected).toBe(false)
    })

    it('rejects queued commands on disconnect', async () => {
      const { conn, socket } = createTestConnection()

      const p1 = conn.sendCommand('status')
      const p2 = conn.sendCommand('currentsong')

      socket.emit('close')

      await expect(p1).rejects.toThrow('Connection closed')
      await expect(p2).rejects.toThrow('Connection closed')
    })

    it('rejects sendCommand immediately when not connected', async () => {
      const { conn } = createTestConnection()
      ;(conn as any)._connected = false

      await expect(conn.sendCommand('status')).rejects.toThrow('Not connected')
    })

    it('rejects sendBinaryCommand immediately when not connected', async () => {
      const { conn } = createTestConnection()
      ;(conn as any)._connected = false

      await expect(conn.sendBinaryCommand('albumart "f" 0')).rejects.toThrow('Not connected')
    })

    it('does not crash processQueue when socket is null', async () => {
      const { conn } = createTestConnection()
      ;(conn as any).socket = null
      ;(conn as any)._connected = true // connected but socket gone (race condition)

      // Should reject with Not connected, not crash with null.write
      const promise = conn.sendCommand('status')
      await expect(promise).rejects.toThrow('Not connected')
    })
  })

  describe('command list (command_list_ok_begin)', () => {
    it('sends correct wire format', async () => {
      const { conn, socket, feed } = createTestConnection()

      const promise = conn.sendCommandList(['find Album "A"', 'find Album "B"'])

      expect(socket.write).toHaveBeenCalledWith(
        'command_list_ok_begin\nfind Album "A"\nfind Album "B"\ncommand_list_end\n',
      )

      feed('file: a.mp3\nTitle: A\nlist_OK\nfile: b.mp3\nTitle: B\nlist_OK\nOK\n')

      const result = await promise
      expect(result).toHaveLength(3) // 2 commands + trailing empty after last list_OK
      expect(result[0]).toBe('file: a.mp3\nTitle: A\n')
      expect(result[1]).toBe('file: b.mp3\nTitle: B\n')
      expect(result[2]).toBe('') // trailing segment between last list_OK and OK
    })

    it('handles empty responses per command', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendCommandList(['add "a.mp3"', 'add "b.mp3"'])

      feed('list_OK\nlist_OK\nOK\n')

      const result = await promise
      expect(result).toHaveLength(3)
      expect(result[0]).toBe('')
      expect(result[1]).toBe('')
      expect(result[2]).toBe('')
    })

    it('rejects on ACK error', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendCommandList(['play 999'])

      feed('ACK [50@0] {play} No such song\n')

      await expect(promise).rejects.toBeInstanceOf(MpdError)
    })

    it('handles chunked data across TCP packets', async () => {
      const { conn, feed } = createTestConnection()

      const promise = conn.sendCommandList(['status', 'currentsong'])

      feed('volume: 80\nrep')
      feed('eat: 0\nlist_OK\nfile: s')
      feed('ong.mp3\nlist_OK\nOK\n')

      const result = await promise
      expect(result[0]).toBe('volume: 80\nrepeat: 0\n')
      expect(result[1]).toBe('file: song.mp3\n')
    })

    it('processes next queued command after command list completes', async () => {
      const { conn, socket, feed } = createTestConnection()

      const p1 = conn.sendCommandList(['find Album "A"'])
      const p2 = conn.sendCommand('status')

      expect(socket.write).toHaveBeenCalledTimes(1)

      feed('file: a.mp3\nlist_OK\nOK\n')
      await p1

      expect(socket.write).toHaveBeenCalledTimes(2)
      expect(socket.write).toHaveBeenLastCalledWith('status\n')

      feed('volume: 50\nOK\n')
      const r2 = await p2
      expect(r2).toBe('volume: 50\n')
    })

    it('rejects on disconnect', async () => {
      const { conn, socket } = createTestConnection()

      const promise = conn.sendCommandList(['status'])
      socket.emit('close')

      await expect(promise).rejects.toThrow('Connection closed')
    })

    it('rejects when not connected', async () => {
      const { conn } = createTestConnection()
      ;(conn as any)._connected = false

      await expect(conn.sendCommandList(['status'])).rejects.toThrow('Not connected')
    })

    it('applies 10s timeout to command lists', async () => {
      vi.useFakeTimers()
      const { conn, socket } = createTestConnection()

      const promise = conn.sendCommandList(['find Album "A"'])

      vi.advanceTimersByTime(10_000)

      await expect(promise).rejects.toThrow('Connection closed')
      expect(socket.destroy).toHaveBeenCalled()
      vi.useRealTimers()
    })
  })
})
