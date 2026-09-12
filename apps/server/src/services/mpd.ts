import { MpdClient } from '@mpd-web/mpd-client'
import { config } from '../config.js'

let client: MpdClient | null = null

export function getMpdClient(): MpdClient {
  if (!client) {
    client = new MpdClient({
      host: config.mpdHost,
      port: config.mpdPort,
      password: config.mpdPassword,
    })

    // Permanent error handler — prevents unhandled 'error' events from crashing
    client.on('error', (err) => {
      console.error('MPD error:', err instanceof Error ? err.message : err)
    })

    client.on('connect', () => {
      console.log(`Connected to MPD at ${config.mpdHost}:${config.mpdPort}`)
    })

    client.on('disconnect', () => {
      console.warn('MPD disconnected, will attempt to reconnect...')
    })
  }
  return client
}

/**
 * Start the MPD client. Never throws: if MPD is unreachable the client keeps
 * retrying with backoff and emits 'connect' once it gets through.
 */
export function startMpd(): MpdClient {
  const mpd = getMpdClient()
  if (!mpd.connected) {
    mpd.connectWithRetry()
  }
  return mpd
}
