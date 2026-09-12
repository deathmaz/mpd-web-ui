type LogFn = (msg: string, ...args: unknown[]) => void

export interface Logger {
  info: LogFn
  warn: LogFn
  error: LogFn
}

// Console until Fastify is up, then Fastify's pino instance, so every line
// (MPD reconnects, WS drops, request logs) goes through one logger with one
// format. printf-style `%s` placeholders work with both.
let current: Logger = console

export function setLogger(logger: Logger): void {
  current = logger
}

export const log: Logger = {
  info: (msg, ...args) => current.info(msg, ...args),
  warn: (msg, ...args) => current.warn(msg, ...args),
  error: (msg, ...args) => current.error(msg, ...args),
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
