import type { FastifyInstance } from 'fastify'
import { getMpdClient } from '../services/mpd.js'

export async function playlistRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/playlists', async () => {
    const mpd = getMpdClient()
    const playlists = await mpd.listPlaylists()
    return { playlists }
  })

  fastify.get<{ Params: { name: string } }>(
    '/api/playlists/:name',
    async (request) => {
      const mpd = getMpdClient()
      const songs = await mpd.listPlaylistInfo(request.params.name)
      return { songs }
    },
  )
}
