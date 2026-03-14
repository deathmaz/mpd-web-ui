/** Snapcast binary protocol message types and serialization. */

const BASE_HEADER_SIZE = 26
const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

export const MSG_TYPE_CODEC = 1
export const MSG_TYPE_WIRE_CHUNK = 2
export const MSG_TYPE_SERVER_SETTINGS = 3
export const MSG_TYPE_TIME = 4
export const MSG_TYPE_HELLO = 5

/** Timestamp value: seconds + microseconds. */
export class Tv {
  constructor(
    public sec: number = 0,
    public usec: number = 0,
  ) {}

  getMilliseconds(): number {
    return this.sec * 1000 + this.usec / 1000
  }

  setMilliseconds(ms: number): void {
    this.sec = Math.floor(ms / 1000)
    this.usec = Math.floor(ms * 1000) % 1000000
  }
}

/** Audio sample format descriptor. */
export class SampleFormat {
  constructor(
    public rate: number = 48000,
    public bits: number = 16,
    public channels: number = 2,
  ) {}

  frameSize(): number {
    return this.channels * this.sampleSize()
  }

  sampleSize(): number {
    // 24-bit samples are stored in 4-byte int32
    if (this.bits === 24) return 4
    return this.bits / 8
  }

  msRate(): number {
    return this.rate / 1000
  }
}

/** Base message with 26-byte header shared by all message types. */
export class BaseMessage {
  type: number = 0
  id: number = 0
  refersTo: number = 0
  received = new Tv()
  sent = new Tv()
  size: number = 0

  deserialize(buffer: ArrayBuffer): void {
    const view = new DataView(buffer)
    this.type = view.getUint16(0, true)
    this.id = view.getUint16(2, true)
    this.refersTo = view.getUint16(4, true)
    this.received = new Tv(view.getInt32(6, true), view.getInt32(10, true))
    this.sent = new Tv(view.getInt32(14, true), view.getInt32(18, true))
    this.size = view.getUint32(22, true)
  }

  serialize(): ArrayBuffer {
    const buffer = new ArrayBuffer(BASE_HEADER_SIZE + this.size)
    const view = new DataView(buffer)
    view.setUint16(0, this.type, true)
    view.setUint16(2, this.id, true)
    view.setUint16(4, this.refersTo, true)
    view.setInt32(6, this.received.sec, true)
    view.setInt32(10, this.received.usec, true)
    view.setInt32(14, this.sent.sec, true)
    view.setInt32(18, this.sent.usec, true)
    view.setUint32(22, this.size, true)
    return buffer
  }
}

/** JSON-based message: 4-byte length prefix + UTF-8 JSON payload. */
class JsonMessage extends BaseMessage {
  json: Record<string, unknown> = {}

  deserialize(buffer: ArrayBuffer): void {
    super.deserialize(buffer)
    const view = new DataView(buffer)
    const jsonSize = view.getUint32(BASE_HEADER_SIZE, true)
    const jsonStr = textDecoder.decode(buffer.slice(BASE_HEADER_SIZE + 4, BASE_HEADER_SIZE + 4 + jsonSize))
    this.json = JSON.parse(jsonStr)
  }

  serialize(): ArrayBuffer {
    const jsonStr = JSON.stringify(this.json)
    const jsonBytes = textEncoder.encode(jsonStr)
    this.size = 4 + jsonBytes.length
    const buffer = super.serialize()
    const view = new DataView(buffer)
    view.setUint32(BASE_HEADER_SIZE, jsonBytes.length, true)
    new Uint8Array(buffer, BASE_HEADER_SIZE + 4).set(jsonBytes)
    return buffer
  }
}

/** Client → server hello message (type 5). */
export class HelloMessage extends JsonMessage {
  mac = '00:00:00:00:00:00'
  hostname = 'Snapweb client'
  version = '0.1.0'
  clientName = 'mpd-web-ui'
  os = 'unknown'
  arch = 'web'
  instance = 1
  uniqueId = ''
  snapStreamProtocolVersion = 2

  constructor() {
    super()
    this.type = MSG_TYPE_HELLO
  }

  serialize(): ArrayBuffer {
    this.json = {
      MAC: this.mac,
      HostName: this.hostname,
      Version: this.version,
      ClientName: this.clientName,
      OS: this.os,
      Arch: this.arch,
      Instance: this.instance,
      ID: this.uniqueId,
      SnapStreamProtocolVersion: this.snapStreamProtocolVersion,
    }
    return super.serialize()
  }
}

/** Server → client settings message (type 3). */
export class ServerSettingsMessage extends JsonMessage {
  bufferMs = 0
  latency = 0
  volumePercent = 100
  muted = false

  constructor() {
    super()
    this.type = MSG_TYPE_SERVER_SETTINGS
  }

  deserialize(buffer: ArrayBuffer): void {
    super.deserialize(buffer)
    this.bufferMs = this.json['bufferMs'] as number
    this.latency = this.json['latency'] as number
    this.volumePercent = this.json['volume'] as number
    this.muted = this.json['muted'] as boolean
  }
}

/** Server → client codec header message (type 1). */
export class CodecHeaderMessage extends BaseMessage {
  codec = ''
  payload: ArrayBuffer = new ArrayBuffer(0)

  constructor() {
    super()
    this.type = MSG_TYPE_CODEC
  }

  deserialize(buffer: ArrayBuffer): void {
    super.deserialize(buffer)
    const view = new DataView(buffer)
    const codecSize = view.getInt32(BASE_HEADER_SIZE, true)
    this.codec = textDecoder.decode(buffer.slice(BASE_HEADER_SIZE + 4, BASE_HEADER_SIZE + 4 + codecSize))
    const payloadOffset = BASE_HEADER_SIZE + 4 + codecSize
    const payloadSize = view.getInt32(payloadOffset, true)
    this.payload = buffer.slice(payloadOffset + 4, payloadOffset + 4 + payloadSize)
  }
}

/** Server → client audio chunk message (type 2). */
export class WireChunkMessage extends BaseMessage {
  timestamp!: Tv
  payload!: ArrayBuffer

  constructor() {
    super()
    this.type = MSG_TYPE_WIRE_CHUNK
  }

  deserialize(buffer: ArrayBuffer): void {
    super.deserialize(buffer)
    const view = new DataView(buffer)
    this.timestamp = new Tv(
      view.getInt32(BASE_HEADER_SIZE, true),
      view.getInt32(BASE_HEADER_SIZE + 4, true),
    )
    this.payload = buffer.slice(BASE_HEADER_SIZE + 12)
  }
}

/** Bidirectional time sync message (type 4). */
export class TimeMessage extends BaseMessage {
  latency = new Tv()

  constructor() {
    super()
    this.type = MSG_TYPE_TIME
    this.size = 8
  }

  deserialize(buffer: ArrayBuffer): void {
    super.deserialize(buffer)
    const view = new DataView(buffer)
    this.latency = new Tv(
      view.getInt32(BASE_HEADER_SIZE, true),
      view.getInt32(BASE_HEADER_SIZE + 4, true),
    )
  }

  serialize(): ArrayBuffer {
    const buffer = super.serialize()
    const view = new DataView(buffer)
    view.setInt32(BASE_HEADER_SIZE, this.latency.sec, true)
    view.setInt32(BASE_HEADER_SIZE + 4, this.latency.usec, true)
    return buffer
  }
}

/** Parse a raw ArrayBuffer into the appropriate message type. */
export function parseMessage(buffer: ArrayBuffer): BaseMessage {
  const view = new DataView(buffer)
  const type = view.getUint16(0, true)

  let msg: BaseMessage
  switch (type) {
    case MSG_TYPE_CODEC:
      msg = new CodecHeaderMessage()
      break
    case MSG_TYPE_WIRE_CHUNK:
      msg = new WireChunkMessage()
      break
    case MSG_TYPE_SERVER_SETTINGS:
      msg = new ServerSettingsMessage()
      break
    case MSG_TYPE_TIME:
      msg = new TimeMessage()
      break
    case MSG_TYPE_HELLO:
      msg = new HelloMessage()
      break
    default:
      msg = new BaseMessage()
  }
  msg.deserialize(buffer)
  return msg
}
