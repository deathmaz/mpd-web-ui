import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { log } from '../logger.js'
import { isOriginAllowed } from './origin.js'
import { setupWebSocketHandler } from './handler.js'

/** GET /ws with the Origin check applied before the upgrade completes. */
export async function websocketRoute(app: FastifyInstance): Promise<void> {
  app.get(
    '/ws',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const origin = request.headers.origin
        if (!isOriginAllowed(origin, request.headers.host, config.allowedOrigins)) {
          log.warn('Rejected WebSocket upgrade from origin %s (host %s)', origin, request.headers.host)
          await reply.code(403).send({ error: 'Origin not allowed' })
        }
      },
    },
    (socket) => {
      setupWebSocketHandler(socket)
    },
  )
}
