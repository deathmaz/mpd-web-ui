/** Snapcast streaming client — connects to snapserver /stream WebSocket. */

import {
  CodecHeaderMessage,
  HelloMessage,
  MSG_TYPE_CODEC,
  MSG_TYPE_SERVER_SETTINGS,
  MSG_TYPE_TIME,
  MSG_TYPE_WIRE_CHUNK,
  ServerSettingsMessage,
  TimeMessage,
  WireChunkMessage,
  parseMessage,
} from './protocol'
import type { SampleFormat } from './protocol'
import { TimeProvider } from './timeProvider'
import { AudioStream } from './audioStream'
import { createDecoder } from './decoder'
import type { Decoder } from './decoder'

import type { ConnectionState } from './types'

const SYNC_INTERVAL_MS = 1000
const LOCALSTORAGE_CLIENT_ID = 'snapcast.clientId'

export interface SnapcastClientEvents {
  onStateChange?: (state: ConnectionState) => void
  onServerSettings?: (settings: { volume: number; muted: boolean; bufferMs: number }) => void
  onCodec?: (codec: string) => void
  onError?: (error: string) => void
}

export class SnapcastClient {
  private ws: WebSocket | null = null
  private syncHandle: ReturnType<typeof setInterval> | null = null
  private timeProvider = new TimeProvider()
  private audioStream = new AudioStream(this.timeProvider)
  private decoder: Decoder | null = null
  private sampleFormat: SampleFormat | null = null
  private bufferMs = 1000
  private latencyMs = 0
  private _state: ConnectionState = 'disconnected'
  private events: SnapcastClientEvents = {}

  get state(): ConnectionState {
    return this._state
  }

  setEvents(events: SnapcastClientEvents): void {
    this.events = events
  }

  connect(baseUrl: string): void {
    if (this.ws) this.disconnect()

    this._state = 'connecting'
    this.events.onStateChange?.('connecting')

    const streamUrl = baseUrl.replace(/\/$/, '') + '/stream'
    this.ws = new WebSocket(streamUrl)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => {
      this.sendHello()
      this.syncHandle = setInterval(() => this.syncTime(), SYNC_INTERVAL_MS)
      this._state = 'connected'
      this.events.onStateChange?.('connected')
    }

    this.ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleMessage(event.data)
      }
    }

    this.ws.onclose = () => {
      this.cleanup()
      this.events.onStateChange?.('disconnected')
    }

    this.ws.onerror = () => {
      this.events.onError?.('Connection failed')
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
    if (this.syncHandle) {
      clearInterval(this.syncHandle)
      this.syncHandle = null
    }
    this.audioStream.stop()
    this.timeProvider.reset()
    this.decoder = null
    this.sampleFormat = null
  }

  private sendHello(): void {
    const hello = new HelloMessage()
    hello.uniqueId = this.getClientId()
    hello.os = navigator?.platform || 'unknown'
    this.sendMessage(hello.serialize())
  }

  private syncTime(): void {
    const t = new TimeMessage()
    t.latency.setMilliseconds(this.timeProvider.now())
    this.sendMessage(t.serialize())
  }

  private sendMessage(buffer: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buffer)
    }
  }

  private handleMessage(buffer: ArrayBuffer): void {
    const msg = parseMessage(buffer)

    switch (msg.type) {
      case MSG_TYPE_SERVER_SETTINGS: {
        const settings = msg as ServerSettingsMessage
        this.bufferMs = settings.bufferMs
        this.latencyMs = settings.latency
        this.audioStream.setVolume(settings.volumePercent, settings.muted)
        this.events.onServerSettings?.({
          volume: settings.volumePercent,
          muted: settings.muted,
          bufferMs: settings.bufferMs,
        })
        break
      }

      case MSG_TYPE_CODEC: {
        const codec = msg as CodecHeaderMessage
        this.decoder = createDecoder(codec.codec)
        this.sampleFormat = this.decoder.setHeader(codec.payload)
        this.events.onCodec?.(codec.codec)

        if (this.sampleFormat) {
          this.audioStream.start(this.sampleFormat, this.bufferMs, this.latencyMs)
        }
        break
      }

      case MSG_TYPE_WIRE_CHUNK: {
        if (!this.decoder) break
        const chunk = msg as WireChunkMessage
        const pcmData = this.decoder.decode(chunk.payload)
        if (pcmData) {
          this.audioStream.addChunk(pcmData, chunk.timestamp)
        }
        break
      }

      case MSG_TYPE_TIME: {
        const time = msg as TimeMessage
        // time.latency contains our original local time when we sent the request
        // time.received contains server time when it received our request
        // time.sent contains server time when it sent the response
        const now = this.timeProvider.now()
        const sentMs = time.latency.getMilliseconds()
        const recvMs = time.received.getMilliseconds()
        const sendMs = time.sent.getMilliseconds()

        // c2s: client-to-server time diff (how far ahead server clock is from our perspective)
        const c2s = recvMs - sentMs
        // s2c: server-to-client time diff
        const s2c = now - sendMs

        this.timeProvider.setDiff(c2s, s2c)
        break
      }
    }
  }

  getClientId(): string {
    let id = localStorage.getItem(LOCALSTORAGE_CLIENT_ID)
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'))
      id = `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
      localStorage.setItem(LOCALSTORAGE_CLIENT_ID, id)
    }
    return id
  }
}
