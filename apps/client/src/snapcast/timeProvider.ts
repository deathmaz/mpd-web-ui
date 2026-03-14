/** Clock synchronization between browser and snapserver. */

const MAX_SAMPLES = 100

export class TimeProvider {
  private diffBuffer: number[] = []
  private _diff = 0
  private ctx: AudioContext | null = null

  setAudioContext(ctx: AudioContext): void {
    this.ctx = ctx
  }

  /** Current local time in milliseconds, using AudioContext when available. */
  now(): number {
    if (!this.ctx) return performance.now()
    const timestamp = this.ctx.getOutputTimestamp?.()
    const contextTime = timestamp?.contextTime ?? this.ctx.currentTime
    return contextTime * 1000
  }

  /** Convert local time to server time. */
  serverTime(localTimeMs: number): number {
    return localTimeMs + this._diff
  }

  /** Current server time. */
  serverNow(): number {
    return this.serverTime(this.now())
  }

  /** Add a time diff sample. c2s and s2c are millisecond offsets. */
  setDiff(c2s: number, s2c: number): void {
    const offset = (c2s - s2c) / 2
    this.diffBuffer.push(offset)
    if (this.diffBuffer.length > MAX_SAMPLES) {
      this.diffBuffer.shift()
    }
    const sorted = [...this.diffBuffer].sort((a, b) => a - b)
    this._diff = sorted[Math.floor(sorted.length / 2)]
  }

  /** Current computed diff (median of samples). */
  get diff(): number {
    return this._diff
  }

  reset(): void {
    this.diffBuffer = []
    this._diff = 0
  }
}
