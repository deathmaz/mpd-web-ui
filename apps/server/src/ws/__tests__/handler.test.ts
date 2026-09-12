import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { setupWebSocketHandler } from '../handler.js'

vi.mock('../../services/mpd.js', () => ({
  getMpdClient: () => ({
    status: vi.fn().mockResolvedValue({ state: 'pause' }),
    currentSong: vi.fn().mockResolvedValue(null),
    playlistInfo: vi.fn().mockResolvedValue([]),
    outputs: vi.fn().mockResolvedValue([]),
  }),
}))

const PING_INTERVAL = 30_000

function createMockWs() {
  const ws = new EventEmitter() as EventEmitter & {
    readyState: number
    OPEN: number
    send: ReturnType<typeof vi.fn>
    ping: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  ws.readyState = 1
  ws.OPEN = 1
  ws.send = vi.fn()
  ws.ping = vi.fn()
  ws.terminate = vi.fn()
  ws.close = vi.fn()
  return ws
}

function jsonPings(ws: ReturnType<typeof createMockWs>): number {
  return ws.send.mock.calls.filter(([payload]) => {
    try {
      return JSON.parse(payload as string).type === 'ping'
    } catch {
      return false
    }
  }).length
}

describe('setupWebSocketHandler heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends a JSON ping alongside the control-frame ping every interval', async () => {
    const ws = createMockWs()
    setupWebSocketHandler(ws as any)
    await vi.advanceTimersByTimeAsync(0) // flush initial state send

    expect(jsonPings(ws)).toBe(0)

    await vi.advanceTimersByTimeAsync(PING_INTERVAL)
    expect(ws.ping).toHaveBeenCalledTimes(1)
    expect(jsonPings(ws)).toBe(1)
    expect(ws.terminate).not.toHaveBeenCalled()

    // pong keeps the socket alive, next tick pings again
    ws.emit('pong')
    await vi.advanceTimersByTimeAsync(PING_INTERVAL)
    expect(ws.ping).toHaveBeenCalledTimes(2)
    expect(jsonPings(ws)).toBe(2)
    expect(ws.terminate).not.toHaveBeenCalled()

    ws.emit('close') // remove from broadcaster's client set
  })

  it('terminates the socket when no pong arrives before the next tick', async () => {
    const ws = createMockWs()
    setupWebSocketHandler(ws as any)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(PING_INTERVAL)
    expect(ws.ping).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(PING_INTERVAL)
    expect(ws.terminate).toHaveBeenCalledTimes(1)
    // no further pings after termination
    expect(ws.ping).toHaveBeenCalledTimes(1)
    expect(jsonPings(ws)).toBe(1)

    ws.emit('close')
  })

  it('does not send a JSON ping when the socket is not open', async () => {
    const ws = createMockWs()
    setupWebSocketHandler(ws as any)
    await vi.advanceTimersByTimeAsync(0)

    ws.readyState = 3 // CLOSED
    await vi.advanceTimersByTimeAsync(PING_INTERVAL)
    expect(ws.ping).toHaveBeenCalledTimes(1)
    expect(jsonPings(ws)).toBe(0)

    ws.emit('close')
  })
})
