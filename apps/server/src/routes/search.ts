import type { FastifyInstance } from 'fastify'
import { getMpdClient } from '../services/mpd.js'

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { q: string; type?: string } }>(
    '/api/search',
    async (request) => {
      const { q, type = 'any' } = request.query
      if (!q || q.trim().length === 0) {
        return { results: [] }
      }
      const mpd = getMpdClient()
      const results = await mpd.search(q, type)
      return { results }
    },
  )
}
