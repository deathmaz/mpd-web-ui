export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '3000'),
  mpdHost: process.env.MPD_HOST || 'localhost',
  mpdPort: parseInt(process.env.MPD_PORT || '6600'),
  mpdPassword: process.env.MPD_PASSWORD || undefined,
  mpdStreamPort: parseInt(process.env.MPD_STREAM_PORT || '8000'),
  clientDistPath: process.env.CLIENT_DIST_PATH || '../client/dist',
}
