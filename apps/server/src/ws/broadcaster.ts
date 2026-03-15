import type { WebSocket } from 'ws'
import type { ServerMessage } from '@mpd-web/shared'

const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
}

export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(data)
      } catch {
        clients.delete(ws)
        try { ws.close() } catch { /* already closing */ }
      }
    }
  }
}
