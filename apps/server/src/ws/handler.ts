import type { WebSocket } from 'ws'
import type { ClientCommand, StateUpdate, CommandResponse } from '@mpd-web/shared'
import { getMpdClient } from '../services/mpd.js'
import { addClient, broadcast } from './broadcaster.js'
import { createDebouncedBroadcaster } from './debounce.js'

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

async function handleCommand(
  ws: WebSocket,
  msg: ClientCommand,
): Promise<void> {
  const mpd = getMpdClient()
  const response: CommandResponse = {
    type: 'response',
    id: msg.id,
    ok: true,
  }

  try {
    const args = msg.args || {}
    switch (msg.command) {
      case 'play':
        await mpd.play(args.pos as number | undefined)
        break
      case 'playId':
        await mpd.playId(args.id as number)
        break
      case 'pause':
        await mpd.pause(args.state as boolean | undefined)
        break
      case 'stop':
        await mpd.stop()
        break
      case 'next':
        await mpd.next()
        break
      case 'previous':
        await mpd.previous()
        break
      case 'seekCur':
        await mpd.seekCur(args.time as number)
        break
      case 'setVolume':
        await mpd.setVolume(args.volume as number)
        break
      case 'setRepeat':
        await mpd.setRepeat(args.state as boolean)
        break
      case 'setRandom':
        await mpd.setRandom(args.state as boolean)
        break
      case 'setSingle':
        await mpd.setSingle(args.state as boolean | 'oneshot')
        break
      case 'setConsume':
        await mpd.setConsume(args.state as boolean | 'oneshot')
        break
      case 'add':
        await mpd.add(args.uri as string)
        break
      case 'addMultiple':
        await mpd.addMultiple(args.uris as string[])
        break
      case 'addId':
        response.data = await mpd.addId(
          args.uri as string,
          args.position as number | undefined,
        )
        break
      case 'deleteId':
        await mpd.deleteId(args.id as number)
        break
      case 'deleteMultipleIds':
        await mpd.deleteMultipleIds(args.ids as number[])
        break
      case 'move':
        await mpd.move(args.from as number, args.to as number)
        break
      case 'clear':
        await mpd.clear()
        break
      case 'shuffle':
        await mpd.shuffle()
        break
      case 'loadPlaylist':
        await mpd.loadPlaylist(args.name as string)
        break
      case 'savePlaylist':
        await mpd.savePlaylist(args.name as string)
        break
      case 'deletePlaylist':
        await mpd.deletePlaylist(args.name as string)
        break
      case 'enableOutput':
        await mpd.enableOutput(args.id as number)
        break
      case 'disableOutput':
        await mpd.disableOutput(args.id as number)
        break
      case 'toggleOutput':
        await mpd.toggleOutput(args.id as number)
        break
      default:
        response.ok = false
        response.error = `Unknown command: ${msg.command}`
    }
  } catch (err: unknown) {
    response.ok = false
    response.error = err instanceof Error ? err.message : String(err)
  }

  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(response))
  }
}

const PING_INTERVAL = 30_000

export function setupWebSocketHandler(ws: WebSocket): void {
  addClient(ws)

  // Send full state on connect
  getFullState()
    .then((state) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(state))
      }
    })
    .catch((err) => {
      console.error('Failed to send initial state:', err)
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'MPD not connected' }))
      }
    })

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const msg: ClientCommand = JSON.parse(raw.toString())
      if (msg.id && msg.command) {
        handleCommand(ws, msg).catch((err) => {
          console.error('Unhandled error in command handler:', err)
        })
      }
    } catch {
      // Ignore malformed messages
    }
  })

  // Heartbeat: ping every 30s, close if no pong within 10s
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
  }, PING_INTERVAL)

  ws.on('close', () => clearInterval(pingInterval))
}

/**
 * Set up MPD idle event listeners that broadcast updates to all WS clients.
 */
export function setupMpdEventBroadcasting(): void {
  const mpd = getMpdClient()
  const debounced = createDebouncedBroadcaster(150)

  mpd.on('player', () => {
    debounced('player', async () => {
      const [status, currentSong] = await Promise.all([
        mpd.status(),
        mpd.currentSong(),
      ])
      broadcast({ type: 'player', status, currentSong })
    })
  })

  mpd.on('mixer', () => {
    debounced('mixer', async () => {
      const status = await mpd.status()
      broadcast({ type: 'mixer', volume: status.volume })
    })
  })

  mpd.on('playlist', () => {
    debounced('playlist', async () => {
      const queue = await mpd.playlistInfo()
      broadcast({ type: 'queue', queue })
    })
  })

  mpd.on('options', () => {
    debounced('options', async () => {
      const status = await mpd.status()
      broadcast({
        type: 'options',
        repeat: status.repeat,
        random: status.random,
        single: status.single,
        consume: status.consume,
      })
    })
  })

  mpd.on('output', () => {
    debounced('output', async () => {
      const outputs = await mpd.outputs()
      broadcast({ type: 'outputs', outputs })
    })
  })
}
