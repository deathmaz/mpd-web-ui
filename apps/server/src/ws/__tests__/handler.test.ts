import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { setupWebSocketHandler, setupMpdEventBroadcasting } from '../handler.js'

// One shared fake MpdClient: an EventEmitter (for connect/disconnect/idle
// events) with a mutable `connected` flag and resolved command stubs.
const mpd = await vi.hoisted(async () => {
  const { EventEmitter } = await import('events')
  const emitter = new EventEmitter() as InstanceType<typeof EventEmitter> & {
    connected: boolean
    status: ReturnType<typeof vi.fn>
    currentSong: ReturnType<typeof vi.fn>
    playlistInfo: ReturnType<typeof vi.fn>
    outputs: ReturnType<typeof vi.fn>
  }
  emitter.connected = true
  emitter.status = vi.fn()
  emitter.currentSong = vi.fn()
  emitter.playlistInfo = vi.fn()
  emitter.outputs = vi.fn()
  return emitter
})

vi.mock('../../services/mpd.js', () => ({
  getMpdClient: () => mpd,
}))

beforeEach(() => {
  mpd.connected = true
  mpd.status.mockResolvedValue({ state: 'pause' })
  mpd.currentSong.mockResolvedValue(null)
  mpd.playlistInfo.mockResolvedValue([])
  mpd.outputs.mockResolvedValue([])
})

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

function sentMessages(ws: ReturnType<typeof createMockWs>): Array<{ type: string; [k: string]: unknown }> {
  return ws.send.mock.calls.map(([payload]) => JSON.parse(payload as string))
}

function jsonPings(ws: ReturnType<typeof createMockWs>): number {
  return sentMessages(ws).filter((m) => m.type === 'ping').length
}

describe('setupWebSocketHandler initial messages', () => {
  it('sends mpd availability first, then the full state when MPD is connected', async () => {
    const ws = createMockWs()
    setupWebSocketHandler(ws as any)
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalledTimes(2))

    const [first, second] = sentMessages(ws)
    expect(first).toEqual({ type: 'mpd', connected: true })
    expect(second).toMatchObject({ type: 'state', status: { state: 'pause' }, queue: [], outputs: [] })

    ws.emit('close')
  })

  it('sends only mpd: false and no state when MPD is down', async () => {
    mpd.connected = false
    const ws = createMockWs()
    setupWebSocketHandler(ws as any)
    await new Promise((r) => setTimeout(r, 0))

    expect(sentMessages(ws)).toEqual([{ type: 'mpd', connected: false }])
    expect(mpd.status).not.toHaveBeenCalled()

    ws.emit('close')
  })
})

describe('setupMpdEventBroadcasting availability', () => {
  it('broadcasts mpd: true and a fresh state when MPD (re)connects, mpd: false when it drops', async () => {
    setupMpdEventBroadcasting()
    const ws = createMockWs()
    setupWebSocketHandler(ws as any)
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalledTimes(2))
    ws.send.mockClear()

    mpd.emit('disconnect')
    expect(sentMessages(ws)).toEqual([{ type: 'mpd', connected: false }])
    ws.send.mockClear()

    mpd.status.mockResolvedValue({ state: 'play' })
    mpd.emit('connect')
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalledTimes(2))
    const [availability, state] = sentMessages(ws)
    expect(availability).toEqual({ type: 'mpd', connected: true })
    expect(state).toMatchObject({ type: 'state', status: { state: 'play' } })

    ws.emit('close')
    mpd.removeAllListeners()
  })
})

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
