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

    client.on('disconnect', () => {
      console.warn('MPD disconnected, will attempt to reconnect...')
    })

    client.on('reconnect', () => {
      console.log(`Reconnected to MPD at ${config.mpdHost}:${config.mpdPort}`)
    })
  }
  return client
}

export async function connectMpd(): Promise<MpdClient> {
  const mpd = getMpdClient()
  if (!mpd.connected) {
    await mpd.connect()
    console.log(`Connected to MPD at ${config.mpdHost}:${config.mpdPort}`)
  }
  return mpd
}
