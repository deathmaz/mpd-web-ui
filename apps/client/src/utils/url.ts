/** Normalize a Snapcast server address to a full WebSocket URL. */
export function normalizeWsUrl(address: string, defaultPort = 1780): string {
  let url = address.trim()
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    url = 'ws://' + url
  }
  const urlWithoutProto = url.replace(/^wss?:\/\//, '')
  if (!urlWithoutProto.includes(':')) {
    url += ':' + defaultPort
  }
  return url
}
