/** Web Audio API playback with chunk buffering. */

import type { PcmData } from './decoder'
import type { SampleFormat } from './protocol'
import { Tv } from './protocol'
import type { TimeProvider } from './timeProvider'

interface PendingChunk {
  data: PcmData
  readOffset: number
}

const BUFFER_DURATION_MS = 80
const BUFFER_COUNT = 3
const MAX_PENDING_CHUNKS = 300
const MIN_CHUNKS_BEFORE_START = 8

export class AudioStream {
  private ctx: AudioContext | null = null
  private gainNode: GainNode | null = null
  private streamDest: MediaStreamAudioDestinationNode | null = null
  private audioEl: HTMLAudioElement | null = null
  private timeProvider: TimeProvider
  private sampleFormat: SampleFormat | null = null
  private chunks: PendingChunk[] = []
  private bufferFrameCount = 0
  private playing = false
  private started = false
  private playTime = 0
  private scheduledCount = 0

  constructor(timeProvider: TimeProvider) {
    this.timeProvider = timeProvider
  }

  start(sampleFormat: SampleFormat, _bufferMs: number, _latencyMs: number): AudioContext {
    this.sampleFormat = sampleFormat
    this.bufferFrameCount = Math.ceil((BUFFER_DURATION_MS / 1000) * sampleFormat.rate)

    this.ctx = new AudioContext({ sampleRate: sampleFormat.rate })
    this.timeProvider.setAudioContext(this.ctx)
    this.gainNode = this.ctx.createGain()

    // Route through <audio> element so iOS keeps playback alive during sleep
    this.streamDest = this.ctx.createMediaStreamDestination()
    this.gainNode.connect(this.streamDest)
    this.audioEl = new Audio()
    this.audioEl.srcObject = this.streamDest.stream
    this.audioEl.play().catch(() => {})

    this.playing = true
    this.started = false
    this.scheduledCount = 0

    this.ctx.resume().catch(() => {})

    return this.ctx
  }

  stop(): void {
    this.playing = false
    this.started = false
    this.chunks = []
    this.scheduledCount = 0
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.srcObject = null
      this.audioEl = null
    }
    this.streamDest = null
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
    this.gainNode = null
  }

  setVolume(percent: number, muted: boolean): void {
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : percent / 100
    }
  }

  addChunk(data: PcmData, _timestamp: Tv): void {
    if (this.chunks.length >= MAX_PENDING_CHUNKS) {
      this.chunks.shift()
    }
    this.chunks.push({ data, readOffset: 0 })

    // Start once we have enough buffered
    if (!this.started && this.chunks.length >= MIN_CHUNKS_BEFORE_START && this.ctx?.state === 'running') {
      this.started = true
      this.playTime = this.ctx.currentTime + 0.05
      this.pumpBuffers()
    }

    // Top up scheduled buffers if running low
    if (this.started && this.scheduledCount < BUFFER_COUNT) {
      this.pumpBuffers()
    }
  }

  /** Keep BUFFER_COUNT buffers scheduled ahead at all times. */
  private pumpBuffers(): void {
    while (this.scheduledCount < BUFFER_COUNT && this.playing && this.ctx && this.gainNode && this.sampleFormat) {
      this.scheduleBuffer()
    }
  }

  private scheduleBuffer(): void {
    if (!this.ctx || !this.gainNode || !this.sampleFormat) return

    const sf = this.sampleFormat
    const buffer = this.ctx.createBuffer(sf.channels, this.bufferFrameCount, sf.rate)
    this.fillBuffer(buffer)

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.gainNode)
    source.onended = () => {
      this.scheduledCount--
      this.pumpBuffers()
    }
    source.start(this.playTime)
    this.scheduledCount++
    this.playTime += this.bufferFrameCount / sf.rate
  }

  private fillBuffer(buffer: AudioBuffer): void {
    const sf = this.sampleFormat!
    const channelData: Float32Array[] = []
    for (let c = 0; c < sf.channels; c++) {
      channelData.push(buffer.getChannelData(c))
    }

    let written = 0
    const needed = this.bufferFrameCount

    while (written < needed && this.chunks.length > 0) {
      const chunk = this.chunks[0]
      const chunkSamples = chunk.data.samples
      const chunkFrames = chunkSamples[0].length
      const available = chunkFrames - chunk.readOffset

      if (available <= 0) {
        this.chunks.shift()
        continue
      }

      const toCopy = Math.min(available, needed - written)
      for (let c = 0; c < sf.channels; c++) {
        channelData[c].set(
          chunkSamples[c].subarray(chunk.readOffset, chunk.readOffset + toCopy),
          written,
        )
      }
      written += toCopy
      chunk.readOffset += toCopy

      if (chunk.readOffset >= chunkFrames) {
        this.chunks.shift()
      }
    }

    // Fill remaining with silence
    if (written < needed) {
      for (let c = 0; c < sf.channels; c++) {
        channelData[c].fill(0, written, needed)
      }
    }
  }
}
