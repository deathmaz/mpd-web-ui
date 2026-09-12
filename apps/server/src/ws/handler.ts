import type { WebSocket } from 'ws'
import type {
  ClientCommand,
  CommandName,
  CommandResult,
  StateUpdate,
  CommandResponse,
  ServerPing,
  MpdConnectionUpdate,
} from '@mpd-web/shared'
import { getMpdClient } from '../services/mpd.js'
import { addClient, broadcast } from './broadcaster.js'
import { createDebouncedBroadcaster } from './debounce.js'
import { log, errorMessage } from '../logger.js'

async function getFullState(): Promise<StateUpdate> {
  const mpd = getMpdClient()
  const [status, currentSong, queue, outputs] = await Promise.all([
    mpd.status(),
    mpd.currentSong(),
    mpd.playlistInfo(),
    mpd.outputs(),
  ])
  return { type: 'state', status, currentSong, queue, outputs }
}

class InvalidArgument extends Error {
  constructor(name: string, expected: string) {
    super(`Invalid argument "${name}": expected ${expected}`)
    this.name = 'InvalidArgument'
  }
}

// Wire args are untrusted JSON; every handler pulls its arguments through
// one of these so a bad payload turns into an `ok: false` response instead
// of a malformed MPD command.
function int(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new InvalidArgument(name, 'non-negative integer')
  }
  return v
}

function optInt(v: unknown, name: string): number | undefined {
  return v === undefined ? undefined : int(v, name)
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new InvalidArgument(name, 'non-negative number')
  }
  return v
}

function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw new InvalidArgument(name, 'boolean')
  return v
}

function optBool(v: unknown, name: string): boolean | undefined {
  return v === undefined ? undefined : bool(v, name)
}

function boolOrOneshot(v: unknown, name: string): boolean | 'oneshot' {
  if (v === 'oneshot') return v
  if (typeof v !== 'boolean') throw new InvalidArgument(name, "boolean or 'oneshot'")
  return v
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new InvalidArgument(name, 'string')
  return v
}

function nonEmptyStr(v: unknown, name: string): string {
  const value = str(v, name)
  if (value.length === 0) throw new InvalidArgument(name, 'non-empty string')
  return value
}

// Upper bound for list arguments; keeps one frame well inside the WS
// maxPayload and one MPD command list inside its default 2 MiB limit.
export const MAX_LIST_ITEMS = 20_000

function list(v: unknown, name: string, expected: string): unknown[] {
  if (!Array.isArray(v)) throw new InvalidArgument(name, expected)
  if (v.length > MAX_LIST_ITEMS) {
    throw new InvalidArgument(name, `at most ${MAX_LIST_ITEMS} items`)
  }
  return v
}

function strArray(v: unknown, name: string): string[] {
  return list(v, name, 'array of strings').map((item, i) => str(item, `${name}[${i}]`))
}

function intArray(v: unknown, name: string): number[] {
  return list(v, name, 'array of integers').map((item, i) => int(item, `${name}[${i}]`))
}

type Args = Record<string, unknown>
type Mpd = ReturnType<typeof getMpdClient>
type CommandHandlers = {
  [K in CommandName]: (mpd: Mpd, args: Args) => Promise<CommandResult<K>>
}

const commands: CommandHandlers = {
  play: (mpd, a) => mpd.play(optInt(a.pos, 'pos')),
  playId: (mpd, a) => mpd.playId(int(a.id, 'id')),
  pause: (mpd, a) => mpd.pause(optBool(a.state, 'state')),
  stop: (mpd) => mpd.stop(),
  next: (mpd) => mpd.next(),
  previous: (mpd) => mpd.previous(),
  seekCur: (mpd, a) => mpd.seekCur(num(a.time, 'time')),
  setVolume: (mpd, a) => mpd.setVolume(int(a.volume, 'volume')),
  setRepeat: (mpd, a) => mpd.setRepeat(bool(a.state, 'state')),
  setRandom: (mpd, a) => mpd.setRandom(bool(a.state, 'state')),
  setSingle: (mpd, a) => mpd.setSingle(boolOrOneshot(a.state, 'state')),
  setConsume: (mpd, a) => mpd.setConsume(boolOrOneshot(a.state, 'state')),
  add: (mpd, a) => mpd.add(str(a.uri, 'uri')),
  addMultiple: (mpd, a) => mpd.addMultiple(strArray(a.uris, 'uris')),
  addId: (mpd, a) => mpd.addId(str(a.uri, 'uri'), optInt(a.position, 'position')),
  deleteId: (mpd, a) => mpd.deleteId(int(a.id, 'id')),
  deleteMultipleIds: (mpd, a) => mpd.deleteMultipleIds(intArray(a.ids, 'ids')),
  move: (mpd, a) => mpd.move(int(a.from, 'from'), int(a.to, 'to')),
  clear: (mpd) => mpd.clear(),
  shuffle: (mpd) => mpd.shuffle(),
  loadPlaylist: (mpd, a) => mpd.loadPlaylist(nonEmptyStr(a.name, 'name')),
  savePlaylist: (mpd, a) => mpd.savePlaylist(nonEmptyStr(a.name, 'name')),
  deletePlaylist: (mpd, a) => mpd.deletePlaylist(nonEmptyStr(a.name, 'name')),
  enableOutput: (mpd, a) => mpd.enableOutput(int(a.id, 'id')),
  disableOutput: (mpd, a) => mpd.disableOutput(int(a.id, 'id')),
  toggleOutput: (mpd, a) => mpd.toggleOutput(int(a.id, 'id')),
}

function isCommandName(name: string): name is CommandName {
  // hasOwn, not `in`: keeps prototype keys like "constructor" out
  return Object.hasOwn(commands, name)
}

async function handleCommand(ws: WebSocket, msg: ClientCommand): Promise<void> {
  const response: CommandResponse = { type: 'response', id: msg.id, ok: true }

  if (!isCommandName(msg.command)) {
    response.ok = false
    response.error = `Unknown command: ${msg.command}`
  } else {
    try {
      const data = await commands[msg.command](getMpdClient(), msg.args ?? {})
      if (data !== undefined) response.data = data
    } catch (err: unknown) {
      response.ok = false
      response.error = err instanceof Error ? err.message : String(err)
    }
  }

  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(response))
  }
}

const PING_INTERVAL = 30_000

function isClientCommand(msg: unknown): msg is ClientCommand {
  if (typeof msg !== 'object' || msg === null) return false
  const m = msg as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.command === 'string' &&
    (m.args === undefined || (typeof m.args === 'object' && m.args !== null && !Array.isArray(m.args)))
  )
}

function mpdStatusMessage(connected: boolean): MpdConnectionUpdate {
  return { type: 'mpd', connected }
}

export function setupWebSocketHandler(ws: WebSocket): void {
  addClient(ws)

  const mpd = getMpdClient()
  ws.send(JSON.stringify(mpdStatusMessage(mpd.connected)))

  // Send full state on connect. When MPD is down the client already knows
  // from the message above and will get a state broadcast once MPD is back.
  if (mpd.connected) {
    getFullState()
      .then((state) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(state))
        }
      })
      .catch((err) => {
        log.error('Failed to send initial state: %s', errorMessage(err))
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to load MPD state' }))
        }
      })
  }

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    let msg: unknown
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return // Ignore malformed messages
    }
    if (!isClientCommand(msg)) return
    handleCommand(ws, msg).catch((err) => {
      log.error('Unhandled error in command handler: %s', errorMessage(err))
    })
  })

  // Heartbeat, two halves:
  // - WS ping control frame: detects a dead socket server-side (terminate if
  //   no pong before the next tick).
  // - JSON { type: 'ping' }: browsers never expose ping/pong frames to
  //   JavaScript, so this is what resets the client's 45s heartbeat while
  //   MPD is idle and no other messages flow.
  let alive = true
  ws.on('pong', () => { alive = true })

  const pingInterval = setInterval(() => {
    if (!alive) {
      clearInterval(pingInterval)
      ws.terminate()
      return
    }
    alive = false
    ws.ping()
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' } satisfies ServerPing))
    }
  }, PING_INTERVAL)

  ws.on('close', () => clearInterval(pingInterval))
}

/**
 * Set up MPD idle event listeners that broadcast updates to all WS clients.
 */
export function setupMpdEventBroadcasting(): void {
  const mpd = getMpdClient()
  const debounced = createDebouncedBroadcaster(150)

  // MPD availability. After (re)connecting, push a full state so clients that
  // sat through the outage are resynced instead of waiting for the next event.
  mpd.on('connect', () => {
    broadcast(mpdStatusMessage(true))
    getFullState()
      .then((state) => broadcast(state))
      .catch((err) => log.error('Failed to broadcast state after MPD connect: %s', errorMessage(err)))
  })
  mpd.on('disconnect', () => {
    broadcast(mpdStatusMessage(false))
  })

  // player, mixer and options all live in `status`, so they share one
  // debounced broadcast: an idle response listing several of them costs one
  // status + currentsong round trip and one message instead of three.
  const broadcastPlayerState = () => {
    debounced('player', async () => {
      const [status, currentSong] = await Promise.all([
        mpd.status(),
        mpd.currentSong(),
      ])
      broadcast({ type: 'player', status, currentSong })
    })
  }
  mpd.on('player', broadcastPlayerState)
  mpd.on('mixer', broadcastPlayerState)
  mpd.on('options', broadcastPlayerState)

  mpd.on('playlist', () => {
    debounced('playlist', async () => {
      const queue = await mpd.playlistInfo()
      broadcast({ type: 'queue', queue })
    })
  })

  mpd.on('output', () => {
    debounced('output', async () => {
      const outputs = await mpd.outputs()
      broadcast({ type: 'outputs', outputs })
    })
  })
}
