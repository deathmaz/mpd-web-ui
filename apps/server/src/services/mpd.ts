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
