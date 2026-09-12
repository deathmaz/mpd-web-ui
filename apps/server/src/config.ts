export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '3000'),
  mpdHost: process.env.MPD_HOST || 'localhost',
  mpdPort: parseInt(process.env.MPD_PORT || '6600'),
  mpdPassword: process.env.MPD_PASSWORD || undefined,
  mpdStreamPort: parseInt(process.env.MPD_STREAM_PORT || '8000'),
  clientDistPath: process.env.CLIENT_DIST_PATH || '../client/dist',
  // Extra WebSocket origins beyond "same host as the request" (comma-separated
  // full origins, e.g. https://music.example.com). Unset = same-host only.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
}
