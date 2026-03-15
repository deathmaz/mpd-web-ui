import { ref } from 'vue'
import type { ServerMessage, ClientCommand } from '@mpd-web/shared'
import { usePlayerStore } from '@/stores/player'
import { useQueueStore } from '@/stores/queue'

const HEARTBEAT_TIMEOUT = 45_000

const connected = ref(false)
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
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
      playerStore.updateStatus(msg.status)
      playerStore.updateCurrentSong(msg.currentSong)
      queueStore.updateQueue(msg.queue)
      playerStore.updateOutputs(msg.outputs)
      break
    case 'player':
      playerStore.updateStatus(msg.status)
      playerStore.updateCurrentSong(msg.currentSong)
      break
    case 'mixer':
      playerStore.volume = msg.volume
      break
    case 'queue':
      queueStore.updateQueue(msg.queue)
      break
    case 'options':
      playerStore.repeat = msg.repeat
      playerStore.random = msg.random
      playerStore.single = msg.single
      playerStore.consume = msg.consume
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
  }
}

function resetHeartbeat(): void {
  clearHeartbeat()
  heartbeatTimer = setTimeout(() => {
    // No message received for 45s — connection is dead, force reconnect
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
    reconnectDelay = 1000
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    resetHeartbeat()
  }

  ws.onmessage = (event: MessageEvent) => {
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

export function sendCommand(
  command: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
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
    }, 10000)
    pendingCommands.set(id, { resolve, reject, timer })

    const msg: ClientCommand = { id, command, args }
    ws.send(JSON.stringify(msg))
  })
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
  connect()
  return { connected, sendCommand, reconnect }
}
