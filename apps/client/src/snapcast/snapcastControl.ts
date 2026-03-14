/** Snapcast JSON-RPC 2.0 control client — connects to snapserver /jsonrpc WebSocket. */

export interface SnapcastGroup {
  id: string
  name: string
  stream_id: string
  muted: boolean
  clients: SnapcastGroupClient[]
}

export interface SnapcastGroupClient {
  id: string
  connected: boolean
  config: {
    name: string
    volume: { percent: number; muted: boolean }
    instance: number
  }
  host: { name: string; os: string; arch: string }
}

export interface SnapcastServerStatus {
  groups: SnapcastGroup[]
  streams: Array<{ id: string; status: string; uri: { raw: string } }>
}

import type { ConnectionState } from './types'

type PendingRequest = {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
}

export interface SnapcastControlEvents {
  onStateChange?: (state: ConnectionState) => void
  onServerUpdate?: (status: SnapcastServerStatus) => void
  onVolumeChange?: (clientId: string, volume: { percent: number; muted: boolean }) => void
  onError?: (error: string) => void
}

export class SnapcastControl {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private _state: ConnectionState = 'disconnected'
  private events: SnapcastControlEvents = {}

  get state(): ConnectionState {
    return this._state
  }

  setEvents(events: SnapcastControlEvents): void {
    this.events = events
  }

  connect(baseUrl: string): void {
    if (this.ws) this.disconnect()

    this._state = 'connecting'
    this.events.onStateChange?.('connecting')

    const rpcUrl = baseUrl.replace(/\/$/, '') + '/jsonrpc'
    this.ws = new WebSocket(rpcUrl)

    this.ws.onopen = () => {
      this._state = 'connected'
      this.events.onStateChange?.('connected')
      this.getServerStatus().catch(() => {})
    }

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data)
    }

    this.ws.onclose = () => {
      this.cleanup()
      this.events.onStateChange?.('disconnected')
    }

    this.ws.onerror = () => {
      this.events.onError?.('Control connection failed')
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
    }
    this.cleanup()
    this.events.onStateChange?.('disconnected')
  }

  private cleanup(): void {
    this.ws = null
    this._state = 'disconnected'
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Connection closed'))
    }
    this.pending.clear()
  }

  async getServerStatus(): Promise<SnapcastServerStatus> {
    const result = await this.sendRequest('Server.GetStatus')
    const status = (result as { server: { groups: SnapcastGroup[]; streams: unknown[] } }).server
    this.events.onServerUpdate?.(status as SnapcastServerStatus)
    return status as SnapcastServerStatus
  }

  async setClientVolume(clientId: string, percent: number, muted: boolean): Promise<void> {
    await this.sendRequest('Client.SetVolume', {
      id: clientId,
      volume: { percent, muted },
    })
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'))
        return
      }

      const id = this.nextId++
      this.pending.set(id, { resolve, reject })

      const msg: Record<string, unknown> = {
        jsonrpc: '2.0',
        id,
        method,
      }
      if (params) msg.params = params

      this.ws.send(JSON.stringify(msg))
    })
  }

  private handleMessage(data: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }

    // JSON-RPC response
    if ('id' in msg && msg.id !== null) {
      const id = msg.id as number
      const pending = this.pending.get(id)
      if (pending) {
        this.pending.delete(id)
        if ('error' in msg) {
          pending.reject(new Error((msg.error as { message: string }).message))
        } else {
          pending.resolve(msg.result)
        }
      }
      return
    }

    // JSON-RPC notification
    if ('method' in msg) {
      this.handleNotification(msg.method as string, msg.params as Record<string, unknown>)
    }
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case 'Client.OnVolumeChanged': {
        const clientId = params.id as string
        const volume = params.volume as { percent: number; muted: boolean }
        this.events.onVolumeChange?.(clientId, volume)
        break
      }
      case 'Server.OnUpdate':
      case 'Client.OnConnect':
      case 'Client.OnDisconnect':
      case 'Group.OnStreamChanged':
        // Refresh full status on any structural change
        this.getServerStatus().catch(() => {})
        break
    }
  }
}
