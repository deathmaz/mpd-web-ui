import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyCors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { config } from './config.js'
import { connectMpd } from './services/mpd.js'
import { setupWebSocketHandler, setupMpdEventBroadcasting } from './ws/handler.js'
import { streamRoutes } from './routes/stream.js'
import { artRoutes } from './routes/art.js'
import { libraryRoutes } from './routes/library.js'
import { searchRoutes } from './routes/search.js'
import { playlistRoutes } from './routes/playlists.js'
import { outputRoutes } from './routes/outputs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const fastify = Fastify({ logger: true })

  // Plugins
  await fastify.register(fastifyCors, { origin: true })
  await fastify.register(fastifyWebsocket)

  // WebSocket endpoint
  fastify.register(async (app) => {
    app.get('/ws', { websocket: true }, (socket) => {
      setupWebSocketHandler(socket)
    })
  })

  // REST routes
  await fastify.register(streamRoutes)
  await fastify.register(artRoutes)
  await fastify.register(libraryRoutes)
  await fastify.register(searchRoutes)
  await fastify.register(playlistRoutes)
  await fastify.register(outputRoutes)

  // Serve Vue SPA in production
  const clientDist = resolve(__dirname, '..', config.clientDistPath)
  if (existsSync(clientDist)) {
    await fastify.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      wildcard: false,
    })

    // SPA fallback: serve index.html for non-API routes
    fastify.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith('/api/') ||
        request.url.startsWith('/ws')
      ) {
        reply.status(404).send({ error: 'Not found' })
      } else {
        reply.sendFile('index.html')
      }
    })
  }

  // Connect to MPD then start server
  try {
    await connectMpd()
    setupMpdEventBroadcasting()
  } catch (err) {
    fastify.log.error('Failed to connect to MPD: %s', err)
    fastify.log.info('Server starting without MPD connection, will retry...')
  }

  await fastify.listen({ host: config.host, port: config.port })
  console.log(`Server listening on http://${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
