import type { FastifyInstance } from 'fastify'
import { getMpdClient } from '../services/mpd.js'
import { getArtists, getAlbums, getGenres } from '../services/library-cache.js'

export async function libraryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/library/artists', async () => {
    const artists = await getArtists()
    return { artists }
  })

  fastify.get<{ Querystring: { artist?: string } }>(
    '/api/library/albums',
    async (request) => {
      const albums = await getAlbums(request.query.artist)
      return { albums }
    },
  )

  fastify.get<{ Querystring: { path?: string } }>(
    '/api/library/browse',
    async (request) => {
      const mpd = getMpdClient()
      const entries = await mpd.lsinfo(request.query.path || '')
      return { entries }
    },
  )

  fastify.get('/api/library/genres', async () => {
    const genres = await getGenres()
    return { genres }
  })

  fastify.get<{ Querystring: { album: string; artist?: string } }>(
    '/api/library/songs',
    async (request) => {
      const { album, artist } = request.query
      if (!album) {
        return { songs: [] }
      }
      const mpd = getMpdClient()
      const songs = await mpd.findAlbumSongs(album, artist)
      return { songs }
    },
  )
}
