import type { WebSocket } from 'ws'
import type { ServerMessage } from '@mpd-web/shared'

const clients = new Set<WebSocket>()

const MAX_BUFFERED_AMOUNT = 1 * 1024 * 1024 // 1 MB
const MAX_CONSECUTIVE_DROPS = 10

const dropCounts = new WeakMap<WebSocket, number>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
  dropCounts.set(ws, 0)
  ws.on('close', () => clients.delete(ws))
}

export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message)
  for (const ws of clients) {
    if (ws.readyState !== ws.OPEN) continue

    try {
      if (ws.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        const drops = (dropCounts.get(ws) || 0) + 1
        dropCounts.set(ws, drops)

        if (drops >= MAX_CONSECUTIVE_DROPS) {
          console.warn('Disconnecting slow WebSocket client (too many dropped messages)')
          clients.delete(ws)
          ws.close(1008, 'Too slow')
        }
        continue
      }

      dropCounts.set(ws, 0)
      ws.send(data)
    } catch {
      clients.delete(ws)
      try { ws.close() } catch { /* already closing */ }
    }
  }
}
