import type { FastifyInstance } from 'fastify'
import { getMpdClient } from '../services/mpd.js'

export async function outputRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/outputs', async () => {
    const mpd = getMpdClient()
    const outputs = await mpd.outputs()
    return { outputs }
  })
}
