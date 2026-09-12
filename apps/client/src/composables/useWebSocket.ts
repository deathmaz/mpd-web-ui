import { ref } from 'vue'
import type {
  ServerMessage,
  ClientCommand,
  CommandName,
  CommandArgs,
  CommandResult,
} from '@mpd-web/shared'
import { usePlayerStore } from '@/stores/player'
import { useQueueStore } from '@/stores/queue'

const HEARTBEAT_TIMEOUT = 45_000
// Longer than the server's 10s MPD command timeout so its failure response
// still reaches us instead of racing our own timer.
const COMMAND_TIMEOUT = 15_000

const connected = ref(false)
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
let lastMessageAt = 0
let wakeListenersInstalled = false
const pendingCommands = new Map<
  string,
  { resolve: (data: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
>()
let commandId = 0

function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

function handleMessage(event: MessageEvent): void {
  let msg: ServerMessage
  try {
    msg = JSON.parse(event.data)
  } catch {
    return
  }

  const playerStore = usePlayerStore()
  const queueStore = useQueueStore()

  switch (msg.type) {
    case 'state':
      playerStore.mpdConnected = true
      playerStore.updateStatus(msg.status)
      playerStore.updateCurrentSong(msg.currentSong)
      queueStore.updateQueue(msg.queue)
      playerStore.updateOutputs(msg.outputs)
      break
    case 'player':
      playerStore.updateStatus(msg.status)
      playerStore.updateCurrentSong(msg.currentSong)
      break
    case 'queue':
      queueStore.updateQueue(msg.queue)
      break
    case 'outputs':
      playerStore.updateOutputs(msg.outputs)
      break
    case 'response': {
      const pending = pendingCommands.get(msg.id)
      if (pending) {
        clearTimeout(pending.timer)
        pendingCommands.delete(msg.id)
        if (msg.ok) {
          pending.resolve(msg.data)
        } else {
          pending.reject(new Error(msg.error || 'Command failed'))
        }
      }
      break
    }
    case 'error':
      console.error('Server error:', msg.message)
      break
    case 'ping':
      // Server keepalive; ws.onmessage already reset the heartbeat
      break
    case 'mpd':
      playerStore.mpdConnected = msg.connected
      break
  }
}

function resetHeartbeat(): void {
  clearHeartbeat()
  heartbeatTimer = setTimeout(() => {
    // No message for 45s. The server sends a JSON ping every 30s, so silence
    // means the socket is dead: force reconnect
    console.warn('WebSocket heartbeat timeout, reconnecting')
    reconnect()
  }, HEARTBEAT_TIMEOUT)
}

function clearHeartbeat(): void {
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer)
    heartbeatTimer = null
  }
}

function rejectPendingCommands(): void {
  for (const [, pending] of pendingCommands) {
    clearTimeout(pending.timer)
    pending.reject(new Error('Connection closed'))
  }
  pendingCommands.clear()
}

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  ws = new WebSocket(getWsUrl())

  ws.onopen = () => {
    connected.value = true
    lastMessageAt = Date.now()
    reconnectDelay = 1000
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    resetHeartbeat()
  }

  ws.onmessage = (event: MessageEvent) => {
    lastMessageAt = Date.now()
    resetHeartbeat()
    handleMessage(event)
  }

  ws.onclose = () => {
    connected.value = false
    clearHeartbeat()
    rejectPendingCommands()

    // Reconnect
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
        reconnectDelay = Math.min(reconnectDelay * 2, 15000)
      }, reconnectDelay)
    }
  }

  ws.onerror = () => {
    // onclose will fire after this
  }
}

// Commands whose args are all optional (or none) may omit the args parameter
type ArgsParam<K extends CommandName> =
  Record<string, never> extends CommandArgs<K> ? [args?: CommandArgs<K>] : [args: CommandArgs<K>]

export function sendCommand<K extends CommandName>(
  command: K,
  ...[args]: ArgsParam<K>
): Promise<CommandResult<K>> {
  return new Promise<CommandResult<K>>((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'))
      return
    }

    const id = String(++commandId)
    const timer = setTimeout(() => {
      if (pendingCommands.has(id)) {
        pendingCommands.delete(id)
        reject(new Error('Command timeout'))
      }
    }, COMMAND_TIMEOUT)
    pendingCommands.set(id, {
      resolve: resolve as (data: unknown) => void,
      reject,
      timer,
    })

    const msg: ClientCommand<K> = { id, command, args }
    ws.send(JSON.stringify(msg))
  })
}

/**
 * Decide whether coming back to the foreground (or regaining network) should
 * force a reconnect. Background tabs get their timers throttled to about
 * once a minute, so the heartbeat cannot be trusted to have noticed a socket
 * that died while the tab was hidden; anything not open, or open but silent
 * for longer than the heartbeat window, is reconnected right away instead
 * of waiting out the backoff timer.
 */
export function shouldReconnectOnWake(state: {
  open: boolean
  lastMessageAt: number
  now: number
}): boolean {
  if (!state.open) return true
  return state.now - state.lastMessageAt > HEARTBEAT_TIMEOUT
}

function onWake(): void {
  if (document.visibilityState !== 'visible') return
  const open = ws !== null && ws.readyState === WebSocket.OPEN
  if (shouldReconnectOnWake({ open, lastMessageAt, now: Date.now() })) {
    console.info('WebSocket: tab woke up with a stale or closed socket, reconnecting')
    reconnect()
  }
}

function installWakeListeners(): void {
  if (wakeListenersInstalled) return
  wakeListenersInstalled = true
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('online', onWake)
}

export function reconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  rejectPendingCommands()
  if (ws) {
    ws.onclose = null // prevent auto-reconnect from onclose
    ws.close()
    ws = null
  }
  connected.value = false
  reconnectDelay = 1000
  connect()
}

export function useWebSocket() {
  installWakeListeners()
  connect()
  return { connected, sendCommand, reconnect }
}
