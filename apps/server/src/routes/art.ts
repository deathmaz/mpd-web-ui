import type { FastifyInstance } from 'fastify'
import { getMpdClient } from '../services/mpd.js'
import { artCache } from '../services/art-cache.js'

export async function artRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { '*': string } }>(
    '/api/art/*',
    async (request, reply) => {
      const uri = request.params['*']
      if (!uri) {
        return reply.status(400).send({ error: 'URI required' })
      }

      // Check cache
      const cached = artCache.get(uri)
      if (cached) {
        return reply
          .header('Content-Type', cached.type)
          .header('Cache-Control', 'public, max-age=86400')
          .send(cached.data)
      }

      try {
        const mpd = getMpdClient()
        const art = await mpd.getFullAlbumArt(uri)
        if (!art) {
          return reply.status(404).send({ error: 'No album art found' })
        }

        // Cache it
        artCache.set(uri, art)

        return reply
          .header('Content-Type', art.type)
          .header('Cache-Control', 'public, max-age=86400')
          .send(art.data)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return reply
          .status(500)
          .send({ error: 'Failed to fetch album art', detail: message })
      }
    },
  )
}
