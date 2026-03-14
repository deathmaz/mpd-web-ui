/** Audio decoders for Snapcast PCM and FLAC streams. */

import { SampleFormat } from './protocol'

/** Decoded PCM chunk with timestamp and sample data. */
export interface PcmData {
  samples: Float32Array[]
  sampleFormat: SampleFormat
}

export interface Decoder {
  setHeader(buffer: ArrayBuffer): SampleFormat | null
  decode(payload: ArrayBuffer): PcmData | null
}

/** PCM decoder — extracts format from WAV header, passes through raw samples. */
export class PcmDecoder implements Decoder {
  private sampleFormat = new SampleFormat()
  private invNormalize = 1 / (2 ** 15)

  setHeader(buffer: ArrayBuffer): SampleFormat | null {
    if (buffer.byteLength < 36) return null
    const view = new DataView(buffer)
    this.sampleFormat = new SampleFormat(
      view.getUint32(24, true), // sample rate
      view.getUint16(34, true), // bits per sample
      view.getUint16(22, true), // channels
    )
    this.invNormalize = 1 / (2 ** (this.sampleFormat.bits - 1))
    return this.sampleFormat
  }

  decode(payload: ArrayBuffer): PcmData | null {
    const sf = this.sampleFormat
    const frameSize = sf.frameSize()
    const frameCount = Math.floor(payload.byteLength / frameSize)
    if (frameCount === 0) return null

    const channels: Float32Array[] = []
    for (let c = 0; c < sf.channels; c++) {
      channels.push(new Float32Array(frameCount))
    }

    const inv = this.invNormalize
    let samples: Int16Array | Int32Array
    if (sf.bits >= 24) {
      samples = new Int32Array(payload)
    } else {
      samples = new Int16Array(payload)
    }

    const ch = sf.channels
    for (let i = 0; i < frameCount; i++) {
      for (let c = 0; c < ch; c++) {
        channels[c][i] = samples[i * ch + c] * inv
      }
    }

    return { samples: channels, sampleFormat: sf }
  }
}

// ── libflacjs types (subset we need) ──

interface FlacLib {
  create_libflac_decoder(isVerify: boolean): number
  init_decoder_stream(
    decoder: number,
    readFn: (n: number) => { buffer: Uint8Array; readDataLength: number; error: boolean },
    writeFn: (data: Uint8Array[], frameInfo: { blocksize: number; channels: number }) => void,
    errorFn: (code: number, desc: string) => void,
    metadataFn: (meta: { sampleRate?: number; channels?: number; bitsPerSample?: number }) => void,
    oggSerial: boolean,
  ): number
  FLAC__stream_decoder_process_until_end_of_metadata(decoder: number): boolean
  FLAC__stream_decoder_process_single(decoder: number): boolean
}

/**
 * FLAC decoder using libflacjs — same approach as Snapweb.
 * Synchronous streaming decoder with callbacks.
 */
export class FlacDecoder implements Decoder {
  private Flac: FlacLib | null = null
  private decoder = 0
  private sampleFormat = new SampleFormat()
  private header: ArrayBuffer | null = null
  private flacChunk: ArrayBuffer = new ArrayBuffer(0)
  private flacChunkOffset = 0
  private decodedPcm: ArrayBuffer[] = []

  setFlac(flac: FlacLib): void {
    this.Flac = flac
  }

  setHeader(buffer: ArrayBuffer): SampleFormat | null {
    if (!this.Flac) {
      console.error('Snapcast: libflacjs not available')
      return null
    }

    this.decoder = this.Flac.create_libflac_decoder(true)
    if (!this.decoder) {
      console.error('Snapcast: Failed to create FLAC decoder')
      return null
    }

    const initStatus = this.Flac.init_decoder_stream(
      this.decoder,
      this.readCallback.bind(this),
      this.writeCallback.bind(this),
      this.errorCallback.bind(this),
      this.metadataCallback.bind(this),
      false,
    )

    if (initStatus !== 0) {
      console.error('Snapcast: FLAC decoder init failed, status:', initStatus)
      return null
    }

    this.header = buffer.slice(0)
    this.Flac.FLAC__stream_decoder_process_until_end_of_metadata(this.decoder)

    if (this.sampleFormat.rate === 0) {
      console.error('Snapcast: Failed to parse FLAC metadata')
      return null
    }

    return this.sampleFormat
  }

  decode(payload: ArrayBuffer): PcmData | null {
    if (!this.decoder || !this.Flac) return null

    this.flacChunk = payload
    this.flacChunkOffset = 0
    this.decodedPcm = []

    while (this.flacChunkOffset < this.flacChunk.byteLength) {
      if (!this.Flac.FLAC__stream_decoder_process_single(this.decoder)) {
        break
      }
    }

    if (this.decodedPcm.length === 0) return null

    // Combine decoded PCM and convert to float channels
    const sf = this.sampleFormat
    let totalFrames = 0
    for (const buf of this.decodedPcm) {
      totalFrames += buf.byteLength / sf.frameSize()
    }

    const channels: Float32Array[] = []
    for (let c = 0; c < sf.channels; c++) {
      channels.push(new Float32Array(totalFrames))
    }

    // Normalize using 2^bits (matching Snapweb)
    const inv = 1 / (2 ** sf.bits)
    let pos = 0
    for (const buf of this.decodedPcm) {
      const frameCount = buf.byteLength / sf.frameSize()
      let samples: Int16Array | Int32Array
      if (sf.bits >= 24) {
        samples = new Int32Array(buf)
      } else {
        samples = new Int16Array(buf)
      }
      for (let i = 0; i < frameCount; i++) {
        for (let c = 0; c < sf.channels; c++) {
          channels[c][pos] = samples[i * sf.channels + c] * inv
        }
        pos++
      }
    }

    return { samples: channels, sampleFormat: sf }
  }

  private readCallback(numberOfBytes: number): { buffer: Uint8Array; readDataLength: number; error: boolean } {
    if (this.header) {
      const data = new Uint8Array(this.header)
      this.header = null
      return { buffer: data, readDataLength: data.byteLength, error: false }
    }

    const remaining = this.flacChunk.byteLength - this.flacChunkOffset
    if (remaining > 0) {
      const len = Math.min(numberOfBytes, remaining)
      const data = new Uint8Array(this.flacChunk, this.flacChunkOffset, len)
      this.flacChunkOffset += len
      return { buffer: data, readDataLength: len, error: false }
    }

    return { buffer: new Uint8Array(0), readDataLength: 0, error: false }
  }

  private writeCallback(data: Uint8Array[], frameInfo: { blocksize: number; channels: number }): void {
    const sf = this.sampleFormat
    const sampleSize = sf.sampleSize()
    const payload = new ArrayBuffer(sf.frameSize() * frameInfo.blocksize)
    const view = new DataView(payload)

    for (let channel = 0; channel < frameInfo.channels; channel++) {
      const channelView = new DataView(data[channel].buffer, 0, data[channel].buffer.byteLength)
      for (let i = 0; i < frameInfo.blocksize; i++) {
        const writeIdx = sampleSize * (frameInfo.channels * i + channel)
        const readIdx = sampleSize * i
        if (sampleSize === 4) {
          view.setInt32(writeIdx, channelView.getInt32(readIdx, true), true)
        } else {
          view.setInt16(writeIdx, channelView.getInt16(readIdx, true), true)
        }
      }
    }

    this.decodedPcm.push(payload)
  }

  private errorCallback(errorCode: number, errorDescription: string): void {
    console.warn('Snapcast FLAC error:', errorCode, errorDescription)
  }

  private metadataCallback(metadata: { sampleRate?: number; channels?: number; bitsPerSample?: number }): void {
    if (metadata.sampleRate) {
      this.sampleFormat = new SampleFormat(
        metadata.sampleRate,
        metadata.bitsPerSample ?? 16,
        metadata.channels ?? 2,
      )
    }
  }
}

// ── Library loading ──

let flacLib: FlacLib | null = null
let flacLoadPromise: Promise<FlacLib | null> | null = null

export function loadFlacLibrary(): Promise<FlacLib | null> {
  if (flacLib) return Promise.resolve(flacLib)
  if (flacLoadPromise) return flacLoadPromise

  flacLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = '/libflac.js'
    script.onload = () => {
      flacLib = (globalThis as any).Flac as FlacLib
        resolve(flacLib)
    }
    script.onerror = () => {
      console.warn('Snapcast: Failed to load libflacjs')
      resolve(null)
    }
    document.head.appendChild(script)
  })

  return flacLoadPromise
}

export function createDecoder(codecName: string): Decoder {
  switch (codecName.toLowerCase()) {
    case 'pcm':
      return new PcmDecoder()
    case 'flac': {
      const decoder = new FlacDecoder()
      if (flacLib) {
        decoder.setFlac(flacLib)
      }
      return decoder
    }
    default:
      throw new Error(`Unsupported codec: ${codecName}`)
  }
}
