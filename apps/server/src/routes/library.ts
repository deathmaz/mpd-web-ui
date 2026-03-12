import type { FastifyInstance } from 'fastify'
import { getMpdClient } from '../services/mpd.js'

export async function libraryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/library/artists', async () => {
    const mpd = getMpdClient()
    const artists = await mpd.listArtists()
    return { artists }
  })

  fastify.get<{ Querystring: { artist?: string } }>(
    '/api/library/albums',
    async (request) => {
      const mpd = getMpdClient()
      const albums = await mpd.listAlbums(request.query.artist)

      // Fetch first song of each album to get a file path for cover art
      const albumsWithCover = await Promise.all(
        albums.map(async (a) => {
          try {
            const songs = await mpd.findAlbumSongs(a.album, a.artist)
            return { ...a, coverFile: songs[0]?.file || null }
          } catch {
            return { ...a, coverFile: null }
          }
        }),
      )

      return { albums: albumsWithCover }
    },
  )

  fastify.get('/api/library/genres', async () => {
    const mpd = getMpdClient()
    const genres = await mpd.listGenres()
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
