import { Socket } from 'net'
import { EventEmitter } from 'events'
import { parseAck } from './protocol.js'

interface PendingCommand {
  resolve: (data: string) => void
  reject: (err: Error) => void
}

interface PendingBinaryCommand {
  resolve: (data: { headers: Map<string, string>; data: Buffer }) => void
  reject: (err: Error) => void
}

const NEWLINE = 0x0a // '\n'

/**
 * A single TCP connection to MPD.
 * Handles connecting, authentication, sending commands,
 * and parsing responses (text and binary).
 *
 * All data is handled as raw Buffers to avoid corrupting
 * binary content (album art) through UTF-8 conversion.
 */
export class MpdConnection extends EventEmitter {
  private socket: Socket | null = null
  private buffer = ''
  private rawBuffer: Buffer = Buffer.alloc(0)
  private binaryBuffer: Buffer | null = null
  private binaryRemaining = 0
  private binaryHeaders: Map<string, string> = new Map()
  private pendingCommand: PendingCommand | null = null
  private pendingBinary: PendingBinaryCommand | null = null
  private commandQueue: Array<{
    command: string
    binary: boolean
    resolve: (v: any) => void
    reject: (e: Error) => void
  }> = []
  private processing = false
  private commandTimer: ReturnType<typeof setTimeout> | null = null
  private _connected = false
  private protocolVersion = ''

  get connected(): boolean {
    return this._connected
  }

  async connect(host: string, port: number, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.socket = new Socket()
      this.buffer = ''
      this.rawBuffer = Buffer.alloc(0)
      this.binaryBuffer = null
      this.binaryRemaining = 0

      this.socket.setNoDelay(true)
      this.socket.setKeepAlive(true, 15_000) // detect dead connections after suspend
      // No setEncoding - always receive raw Buffers

      let greeted = false

      const onData = (chunk: Buffer) => {
        if (!greeted) {
          // First data is the greeting: "OK MPD x.y.z\n"
          this.rawBuffer = this.rawBuffer.length > 0
            ? Buffer.concat([this.rawBuffer, chunk])
            : chunk
          const nlIdx = this.rawBuffer.indexOf(NEWLINE)
          if (nlIdx !== -1) {
            const greeting = this.rawBuffer.subarray(0, nlIdx).toString('utf-8')
            const rest = this.rawBuffer.subarray(nlIdx + 1)
            this.rawBuffer = Buffer.alloc(0)
            if (greeting.startsWith('OK MPD')) {
              this.protocolVersion = greeting.substring(7)
              greeted = true
              this._connected = true
              this.socket!.removeListener('data', onData)
              this.socket!.on('data', (data: Buffer) => this.onData(data))
              // Process any remaining data
              if (rest.length > 0) {
                this.onData(rest)
              }
              resolve(this.protocolVersion)
            } else {
              reject(new Error(`Unexpected MPD greeting: ${greeting}`))
            }
          }
          return
        }
      }

      this.socket.on('data', onData)
      this.socket.on('error', (err) => {
        this._connected = false
        this.emit('error', err)
        if (!greeted) reject(err)
      })
      this.socket.on('close', () => {
        this._connected = false
        this.clearCommandTimer()
        this.emit('close')
        if (this.pendingCommand) {
          this.pendingCommand.reject(new Error('Connection closed'))
          this.pendingCommand = null
        }
        if (this.pendingBinary) {
          this.pendingBinary.reject(new Error('Connection closed'))
          this.pendingBinary = null
        }
        for (const cmd of this.commandQueue) {
          cmd.reject(new Error('Connection closed'))
        }
        this.commandQueue = []
        this.processing = false
      })

      this.socket.connect(port, host)
    }).then(async (version) => {
      if (password) {
        await this.sendCommand(`password ${password}`)
      }
      return version as string
    })
  }

  disconnect(): void {
    this.clearCommandTimer()
    this.processing = false
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
      this._connected = false
    }
  }

  sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ command, binary: false, resolve, reject })
      this.processQueue()
    })
  }

  sendBinaryCommand(
    command: string,
  ): Promise<{ headers: Map<string, string>; data: Buffer }> {
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ command, binary: true, resolve, reject })
      this.processQueue()
    })
  }

  private clearCommandTimer(): void {
    if (this.commandTimer) {
      clearTimeout(this.commandTimer)
      this.commandTimer = null
    }
  }

  private processQueue(): void {
    if (this.processing || this.commandQueue.length === 0) return
    this.processing = true

    const next = this.commandQueue.shift()!
    if (next.binary) {
      this.pendingBinary = { resolve: next.resolve, reject: next.reject }
    } else {
      this.pendingCommand = { resolve: next.resolve, reject: next.reject }
    }

    // Skip timeout for `idle` which blocks intentionally until MPD has changes
    if (!next.command.startsWith('idle')) {
      this.commandTimer = setTimeout(() => {
        this.commandTimer = null
        // Destroy the connection — the TCP stream is in an unknown state
        // and any remaining response data would corrupt subsequent commands.
        // The MpdClient's reconnect logic will establish a fresh connection.
        this.disconnect()
      }, 10_000)
    }

    this.socket!.write(next.command + '\n')
  }

  private onData(chunk: Buffer): void {
    // If we're reading binary data, handle it without string conversion
    if (this.binaryRemaining > 0) {
      const needed = this.binaryRemaining
      const available = chunk.length

      if (available >= needed) {
        this.binaryBuffer = this.binaryBuffer
          ? Buffer.concat([this.binaryBuffer, chunk.subarray(0, needed)])
          : Buffer.from(chunk.subarray(0, needed))
        this.binaryRemaining = 0

        // After binary data, remaining is text (\nOK\n)
        const rest = chunk.subarray(needed)
        if (rest.length > 0) {
          this.rawBuffer = this.rawBuffer.length > 0
            ? Buffer.concat([this.rawBuffer, rest])
            : Buffer.from(rest)
          this.processRawBuffer()
        }
      } else {
        this.binaryBuffer = this.binaryBuffer
          ? Buffer.concat([this.binaryBuffer, chunk])
          : Buffer.from(chunk)
        this.binaryRemaining -= available
      }
      return
    }

    // Text mode: accumulate as raw buffer, process line by line
    this.rawBuffer = this.rawBuffer.length > 0
      ? Buffer.concat([this.rawBuffer, chunk])
      : Buffer.from(chunk)
    this.processRawBuffer()
  }

  private processRawBuffer(): void {
    while (true) {
      const nlIdx = this.rawBuffer.indexOf(NEWLINE)
      if (nlIdx === -1) break

      const lineBytes = this.rawBuffer.subarray(0, nlIdx)
      const rest = this.rawBuffer.subarray(nlIdx + 1)

      // Check for binary header BEFORE converting to string
      // "binary: " is 8 bytes: 62 69 6e 61 72 79 3a 20
      if (
        lineBytes.length > 8 &&
        lineBytes[0] === 0x62 && // b
        lineBytes[1] === 0x69 && // i
        lineBytes[2] === 0x6e && // n
        lineBytes[3] === 0x61 && // a
        lineBytes[4] === 0x72 && // r
        lineBytes[5] === 0x79 && // y
        lineBytes[6] === 0x3a && // :
        lineBytes[7] === 0x20    // space
      ) {
        const sizeStr = lineBytes.subarray(8).toString('utf-8')
        this.binaryRemaining = parseInt(sizeStr)
        this.binaryBuffer = null
        // Remaining raw data is binary content - feed it back through onData
        this.rawBuffer = Buffer.alloc(0)
        if (rest.length > 0) {
          this.onData(rest)
        }
        return
      }

      // Safe to convert to string for text lines
      const line = lineBytes.toString('utf-8')
      this.rawBuffer = rest

      if (line === 'OK') {
        this.clearCommandTimer()
        if (this.pendingBinary) {
          const pending = this.pendingBinary
          this.pendingBinary = null
          pending.resolve({
            headers: this.binaryHeaders,
            data: this.binaryBuffer || Buffer.alloc(0),
          })
          this.binaryHeaders = new Map()
          this.binaryBuffer = null
        } else if (this.pendingCommand) {
          const pending = this.pendingCommand
          this.pendingCommand = null
          pending.resolve(this.buffer)
          this.buffer = ''
        }
        this.processing = false
        this.processQueue()
        continue
      }

      const ack = parseAck(line)
      if (ack) {
        this.clearCommandTimer()
        if (this.pendingBinary) {
          const pending = this.pendingBinary
          this.pendingBinary = null
          pending.reject(ack)
          this.binaryHeaders = new Map()
          this.binaryBuffer = null
        } else if (this.pendingCommand) {
          const pending = this.pendingCommand
          this.pendingCommand = null
          pending.reject(ack)
          this.buffer = ''
        }
        this.processing = false
        this.processQueue()
        continue
      }

      // Accumulate key-value lines
      if (this.pendingBinary) {
        const colonIdx = line.indexOf(': ')
        if (colonIdx !== -1) {
          this.binaryHeaders.set(
            line.substring(0, colonIdx),
            line.substring(colonIdx + 2),
          )
        }
      } else {
        this.buffer += line + '\n'
      }
    }
  }
}
