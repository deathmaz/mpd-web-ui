import { describe, expect, it } from 'vitest'
import { PcmDecoder } from '../decoder'

/** Build a minimal WAV header with the given format parameters. */
function makeWavHeader(sampleRate: number, bitsPerSample: number, channels: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint16(34, bitsPerSample, true)
  return buffer
}

/** Build interleaved 16-bit PCM payload from channel arrays. */
function makePcm16(channels: number[][]): ArrayBuffer {
  const frameCount = channels[0].length
  const ch = channels.length
  const buffer = new ArrayBuffer(frameCount * ch * 2)
  const view = new Int16Array(buffer)
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < ch; c++) {
      view[i * ch + c] = channels[c][i]
    }
  }
  return buffer
}

describe('PcmDecoder', () => {
  describe('setHeader', () => {
    it('parses sample rate, bits, and channels from WAV header', () => {
      const decoder = new PcmDecoder()
      const sf = decoder.setHeader(makeWavHeader(44100, 16, 2))
      expect(sf).not.toBeNull()
      expect(sf!.rate).toBe(44100)
      expect(sf!.bits).toBe(16)
      expect(sf!.channels).toBe(2)
    })

    it('parses 48kHz mono', () => {
      const decoder = new PcmDecoder()
      const sf = decoder.setHeader(makeWavHeader(48000, 16, 1))
      expect(sf!.rate).toBe(48000)
      expect(sf!.channels).toBe(1)
    })

    it('returns null for header smaller than 36 bytes', () => {
      const decoder = new PcmDecoder()
      expect(decoder.setHeader(new ArrayBuffer(10))).toBeNull()
    })
  })

  describe('decode', () => {
    it('returns null for empty payload', () => {
      const decoder = new PcmDecoder()
      decoder.setHeader(makeWavHeader(48000, 16, 2))
      expect(decoder.decode(new ArrayBuffer(0))).toBeNull()
    })

    it('returns null for payload smaller than one frame', () => {
      const decoder = new PcmDecoder()
      decoder.setHeader(makeWavHeader(48000, 16, 2))
      // One stereo 16-bit frame = 4 bytes. Send only 3.
      expect(decoder.decode(new ArrayBuffer(3))).toBeNull()
    })

    it('decodes 16-bit stereo PCM with correct normalization', () => {
      const decoder = new PcmDecoder()
      decoder.setHeader(makeWavHeader(48000, 16, 2))

      // Full-scale positive: 32767 → ~1.0
      // Full-scale negative: -32768 → -1.0
      const payload = makePcm16([
        [32767, -32768, 0],   // left
        [16384, -16384, 0],   // right
      ])

      const result = decoder.decode(payload)
      expect(result).not.toBeNull()
      expect(result!.samples.length).toBe(2)
      expect(result!.samples[0].length).toBe(3)

      // 32767 / 32768 ≈ 0.99997
      expect(result!.samples[0][0]).toBeCloseTo(32767 / 32768, 4)
      // -32768 / 32768 = -1.0
      expect(result!.samples[0][1]).toBeCloseTo(-1.0, 4)
      // 0 / 32768 = 0
      expect(result!.samples[0][2]).toBe(0)

      // Right channel
      expect(result!.samples[1][0]).toBeCloseTo(16384 / 32768, 4)
      expect(result!.samples[1][1]).toBeCloseTo(-16384 / 32768, 4)
    })

    it('decodes mono audio into single channel', () => {
      const decoder = new PcmDecoder()
      decoder.setHeader(makeWavHeader(48000, 16, 1))

      const payload = makePcm16([[1000, -1000]])
      const result = decoder.decode(payload)

      expect(result!.samples.length).toBe(1)
      expect(result!.samples[0].length).toBe(2)
      expect(result!.samples[0][0]).toBeCloseTo(1000 / 32768, 4)
    })

    it('decodes 24-bit audio using Int32 path', () => {
      const decoder = new PcmDecoder()
      decoder.setHeader(makeWavHeader(48000, 24, 2))

      // 24-bit stored as Int32 (4 bytes per sample)
      const buffer = new ArrayBuffer(8) // 1 frame = 2 channels × 4 bytes
      const view = new Int32Array(buffer)
      view[0] = 4194304  // left: ~0.5 of 24-bit range (2^22)
      view[1] = -4194304 // right: ~-0.5

      const result = decoder.decode(buffer)
      expect(result).not.toBeNull()
      expect(result!.samples.length).toBe(2)
      // Normalization: 4194304 / 2^23 = 0.5
      expect(result!.samples[0][0]).toBeCloseTo(4194304 / (2 ** 23), 4)
      expect(result!.samples[1][0]).toBeCloseTo(-4194304 / (2 ** 23), 4)
    })

    it('returns correct sampleFormat in result', () => {
      const decoder = new PcmDecoder()
      decoder.setHeader(makeWavHeader(44100, 16, 2))

      const payload = makePcm16([[0], [0]])
      const result = decoder.decode(payload)

      expect(result!.sampleFormat.rate).toBe(44100)
      expect(result!.sampleFormat.bits).toBe(16)
      expect(result!.sampleFormat.channels).toBe(2)
    })
  })
})
