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
    addId: ReturnType<typeof vi.fn>
    playId: ReturnType<typeof vi.fn>
    play: ReturnType<typeof vi.fn>
    setSingle: ReturnType<typeof vi.fn>
    loadPlaylist: ReturnType<typeof vi.fn>
  }
  emitter.connected = true
  emitter.status = vi.fn()
  emitter.currentSong = vi.fn()
  emitter.playlistInfo = vi.fn()
  emitter.outputs = vi.fn()
  emitter.addId = vi.fn()
  emitter.playId = vi.fn()
  emitter.play = vi.fn()
  emitter.setSingle = vi.fn()
  emitter.loadPlaylist = vi.fn()
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
  mpd.addId.mockResolvedValue(42)
  mpd.playId.mockResolvedValue(undefined)
  mpd.play.mockResolvedValue(undefined)
  mpd.setSingle.mockResolvedValue(undefined)
  mpd.loadPlaylist.mockResolvedValue(undefined)
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

describe('setupWebSocketHandler commands', () => {
  async function openClient() {
    const ws = createMockWs()
    setupWebSocketHandler(ws as any)
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalledTimes(2))
    ws.send.mockClear()
    return ws
  }

  function send(ws: ReturnType<typeof createMockWs>, payload: unknown) {
    ws.emit('message', Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
  }

  async function response(ws: ReturnType<typeof createMockWs>) {
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalledTimes(1))
    return sentMessages(ws)[0]
  }

  it('dispatches a command and returns its result', async () => {
    const ws = await openClient()
    send(ws, { id: '1', command: 'addId', args: { uri: 'a.mp3', position: 3 } })

    expect(await response(ws)).toEqual({ type: 'response', id: '1', ok: true, data: 42 })
    expect(mpd.addId).toHaveBeenCalledWith('a.mp3', 3)
    ws.emit('close')
  })

  it('accepts omitted optional args and oneshot values', async () => {
    const ws = await openClient()
    send(ws, { id: '2', command: 'play' })
    expect(await response(ws)).toMatchObject({ id: '2', ok: true })
    expect(mpd.play).toHaveBeenCalledWith(undefined)
    ws.send.mockClear()

    send(ws, { id: '3', command: 'setSingle', args: { state: 'oneshot' } })
    expect(await response(ws)).toMatchObject({ id: '3', ok: true })
    expect(mpd.setSingle).toHaveBeenCalledWith('oneshot')
    ws.emit('close')
  })

  it('rejects wrongly typed arguments without touching MPD', async () => {
    const ws = await openClient()
    send(ws, { id: '4', command: 'playId', args: { id: '7; clear' } })

    expect(await response(ws)).toMatchObject({ id: '4', ok: false, error: expect.stringContaining('"id"') })
    expect(mpd.playId).not.toHaveBeenCalled()
    ws.send.mockClear()

    send(ws, { id: '5', command: 'loadPlaylist', args: { name: '' } })
    expect(await response(ws)).toMatchObject({ id: '5', ok: false, error: expect.stringContaining('non-empty') })
    expect(mpd.loadPlaylist).not.toHaveBeenCalled()
    ws.emit('close')
  })

  it('answers unknown commands and prototype keys with ok: false', async () => {
    const ws = await openClient()
    send(ws, { id: '6', command: 'nuke' })
    expect(await response(ws)).toEqual({ type: 'response', id: '6', ok: false, error: 'Unknown command: nuke' })
    ws.send.mockClear()

    send(ws, { id: '7', command: 'constructor' })
    expect(await response(ws)).toMatchObject({ id: '7', ok: false })
    ws.emit('close')
  })

  it('ignores malformed frames', async () => {
    const ws = await openClient()
    send(ws, 'not json')
    send(ws, { command: 'play' }) // no id
    send(ws, { id: 1, command: 'play' }) // numeric id
    send(ws, { id: '8', command: 'play', args: [1] }) // array args
    await new Promise((r) => setTimeout(r, 10))

    expect(ws.send).not.toHaveBeenCalled()
    expect(mpd.play).not.toHaveBeenCalled()
    ws.emit('close')
  })

  it('turns MPD failures into ok: false responses', async () => {
    const ws = await openClient()
    mpd.play.mockRejectedValue(new Error('Not connected'))
    send(ws, { id: '9', command: 'play', args: { pos: 0 } })

    expect(await response(ws)).toEqual({ type: 'response', id: '9', ok: false, error: 'Not connected' })
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
