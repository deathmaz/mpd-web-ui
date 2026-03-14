import { describe, expect, it } from 'vitest'
import {
  BaseMessage,
  CodecHeaderMessage,
  HelloMessage,
  MSG_TYPE_CODEC,
  MSG_TYPE_HELLO,
  MSG_TYPE_TIME,
  MSG_TYPE_WIRE_CHUNK,
  SampleFormat,
  ServerSettingsMessage,
  TimeMessage,
  Tv,
  WireChunkMessage,
  parseMessage,
} from '../protocol'

describe('Tv', () => {
  it('converts to milliseconds', () => {
    const tv = new Tv(1, 500000)
    expect(tv.getMilliseconds()).toBe(1500)
  })

  it('converts zero', () => {
    const tv = new Tv(0, 0)
    expect(tv.getMilliseconds()).toBe(0)
  })

  it('sets from milliseconds', () => {
    const tv = new Tv()
    tv.setMilliseconds(2500)
    expect(tv.sec).toBe(2)
    expect(tv.usec).toBe(500000)
  })

  it('sets fractional milliseconds', () => {
    const tv = new Tv()
    tv.setMilliseconds(1234)
    expect(tv.sec).toBe(1)
    expect(tv.usec).toBe(234000)
  })

  it('round-trips through milliseconds', () => {
    const tv = new Tv()
    tv.setMilliseconds(3750)
    expect(tv.getMilliseconds()).toBe(3750)
  })
})

describe('SampleFormat', () => {
  it('calculates frame size for 16-bit stereo', () => {
    const sf = new SampleFormat(44100, 16, 2)
    expect(sf.frameSize()).toBe(4) // 2 channels * 2 bytes
  })

  it('calculates frame size for 24-bit stereo', () => {
    const sf = new SampleFormat(48000, 24, 2)
    expect(sf.sampleSize()).toBe(4) // 24-bit stored as int32
    expect(sf.frameSize()).toBe(8)
  })

  it('calculates ms rate', () => {
    const sf = new SampleFormat(48000, 16, 2)
    expect(sf.msRate()).toBe(48)
  })
})

describe('BaseMessage', () => {
  it('serializes and deserializes header', () => {
    const msg = new BaseMessage()
    msg.type = 4
    msg.id = 42
    msg.refersTo = 10
    msg.received = new Tv(100, 200)
    msg.sent = new Tv(300, 400)
    msg.size = 0

    const buffer = msg.serialize()
    expect(buffer.byteLength).toBe(26)

    const parsed = new BaseMessage()
    parsed.deserialize(buffer)
    expect(parsed.type).toBe(4)
    expect(parsed.id).toBe(42)
    expect(parsed.refersTo).toBe(10)
    expect(parsed.received.sec).toBe(100)
    expect(parsed.received.usec).toBe(200)
    expect(parsed.sent.sec).toBe(300)
    expect(parsed.sent.usec).toBe(400)
    expect(parsed.size).toBe(0)
  })
})

describe('TimeMessage', () => {
  it('round-trips through serialize/deserialize', () => {
    const msg = new TimeMessage()
    msg.id = 7
    msg.latency = new Tv(5, 123456)

    const buffer = msg.serialize()
    expect(buffer.byteLength).toBe(26 + 8)

    const parsed = new TimeMessage()
    parsed.deserialize(buffer)
    expect(parsed.type).toBe(MSG_TYPE_TIME)
    expect(parsed.latency.sec).toBe(5)
    expect(parsed.latency.usec).toBe(123456)
  })
})

describe('HelloMessage', () => {
  it('serializes with correct JSON payload', () => {
    const msg = new HelloMessage()
    msg.uniqueId = 'test-uuid-1234'
    msg.os = 'Linux'

    const buffer = msg.serialize()
    expect(buffer.byteLength).toBeGreaterThan(26)

    // Verify type
    const view = new DataView(buffer)
    expect(view.getUint16(0, true)).toBe(MSG_TYPE_HELLO)

    // Verify JSON payload
    const jsonSize = view.getUint32(26, true)
    const decoder = new TextDecoder()
    const jsonStr = decoder.decode(buffer.slice(30, 30 + jsonSize))
    const json = JSON.parse(jsonStr)
    expect(json.ID).toBe('test-uuid-1234')
    expect(json.OS).toBe('Linux')
    expect(json.Arch).toBe('web')
    expect(json.MAC).toBe('00:00:00:00:00:00')
    expect(json.SnapStreamProtocolVersion).toBe(2)
  })
})

describe('ServerSettingsMessage', () => {
  it('deserializes JSON fields', () => {
    // Build a valid server settings buffer
    const json = JSON.stringify({ bufferMs: 1000, latency: 50, volume: 80, muted: false })
    const encoder = new TextEncoder()
    const jsonBytes = encoder.encode(json)
    const buffer = new ArrayBuffer(26 + 4 + jsonBytes.length)
    const view = new DataView(buffer)
    view.setUint16(0, 3, true) // type = SERVER_SETTINGS
    view.setUint32(22, 4 + jsonBytes.length, true) // size
    view.setUint32(26, jsonBytes.length, true) // json size
    new Uint8Array(buffer, 30).set(jsonBytes)

    const msg = new ServerSettingsMessage()
    msg.deserialize(buffer)
    expect(msg.bufferMs).toBe(1000)
    expect(msg.latency).toBe(50)
    expect(msg.volumePercent).toBe(80)
    expect(msg.muted).toBe(false)
  })
})

describe('CodecHeaderMessage', () => {
  it('deserializes codec name and payload', () => {
    const codecName = 'pcm'
    const codecBytes = new TextEncoder().encode(codecName)
    const payloadData = new Uint8Array([1, 2, 3, 4])
    const totalPayloadSize = 4 + codecBytes.length + 4 + payloadData.length
    const buffer = new ArrayBuffer(26 + totalPayloadSize)
    const view = new DataView(buffer)
    view.setUint16(0, MSG_TYPE_CODEC, true)
    view.setUint32(22, totalPayloadSize, true)
    // codec name size + codec name
    view.setInt32(26, codecBytes.length, true)
    new Uint8Array(buffer, 30).set(codecBytes)
    // payload size + payload
    const payloadOffset = 30 + codecBytes.length
    view.setInt32(payloadOffset, payloadData.length, true)
    new Uint8Array(buffer, payloadOffset + 4).set(payloadData)

    const msg = new CodecHeaderMessage()
    msg.deserialize(buffer)
    expect(msg.codec).toBe('pcm')
    expect(new Uint8Array(msg.payload)).toEqual(payloadData)
  })
})

describe('WireChunkMessage', () => {
  it('deserializes timestamp and payload', () => {
    const audioData = new Uint8Array([10, 20, 30, 40, 50, 60])
    const buffer = new ArrayBuffer(26 + 12 + audioData.length)
    const view = new DataView(buffer)
    view.setUint16(0, MSG_TYPE_WIRE_CHUNK, true)
    view.setUint32(22, 12 + audioData.length, true)
    // timestamp
    view.setInt32(26, 42, true)      // sec
    view.setInt32(30, 500000, true)  // usec
    // payload (no explicit size field — rest of buffer)
    new Uint8Array(buffer, 38).set(audioData)

    const msg = new WireChunkMessage()
    msg.deserialize(buffer)
    expect(msg.timestamp.sec).toBe(42)
    expect(msg.timestamp.usec).toBe(500000)
    expect(msg.timestamp.getMilliseconds()).toBe(42500)
    expect(new Uint8Array(msg.payload)).toEqual(audioData)
  })
})

describe('parseMessage', () => {
  it('dispatches to correct message type', () => {
    const timeMsg = new TimeMessage()
    timeMsg.latency = new Tv(1, 0)
    const buffer = timeMsg.serialize()

    const parsed = parseMessage(buffer)
    expect(parsed).toBeInstanceOf(TimeMessage)
    expect((parsed as TimeMessage).latency.sec).toBe(1)
  })

  it('returns BaseMessage for unknown types', () => {
    const buffer = new ArrayBuffer(26)
    const view = new DataView(buffer)
    view.setUint16(0, 99, true) // unknown type

    const parsed = parseMessage(buffer)
    expect(parsed).toBeInstanceOf(BaseMessage)
    expect(parsed.type).toBe(99)
  })
})
