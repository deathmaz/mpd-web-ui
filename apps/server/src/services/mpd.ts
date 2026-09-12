import { MpdClient } from '@mpd-web/mpd-client'
import { config } from '../config.js'
import { log, errorMessage } from '../logger.js'

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
      log.error('MPD error: %s', errorMessage(err))
    })

    client.on('connect', () => {
      log.info('Connected to MPD at %s:%d', config.mpdHost, config.mpdPort)
    })

    client.on('disconnect', () => {
      log.warn('MPD disconnected, will attempt to reconnect...')
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
