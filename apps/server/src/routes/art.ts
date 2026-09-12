import type { FastifyInstance } from 'fastify'
import { getArt } from '../services/art.js'

const FOUND_CACHE_CONTROL = 'public, max-age=86400'
// Missing art is cached briefly too, so the browser stops re-requesting it on
// every render of a list that shows the same art-less tracks.
const MISSING_CACHE_CONTROL = 'public, max-age=3600'

export async function artRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { '*': string } }>(
    '/api/art/*',
    async (request, reply) => {
      const uri = request.params['*']
      if (!uri) {
        return reply.status(400).send({ error: 'URI required' })
      }

      // Errors propagate to the global errorHandler (503 when MPD is down)
      const art = await getArt(uri)
      if (!art) {
        return reply
          .status(404)
          .header('Cache-Control', MISSING_CACHE_CONTROL)
          .send({ error: 'No album art found' })
      }
      return reply
        .header('Content-Type', art.type)
        .header('Cache-Control', FOUND_CACHE_CONTROL)
        .send(art.data)
    },
  )
}
