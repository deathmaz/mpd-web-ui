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

      // Batch: get first song per album for cover art and date in one round trip
      let info: { coverFile: string | null; date: string | null }[]
      try {
        info = await mpd.findAlbumInfoBatch(albums)
      } catch {
        info = albums.map(() => ({ coverFile: null, date: null }))
      }

      const albumsWithCover = albums.map((a, i) => ({
        ...a,
        coverFile: info[i]?.coverFile ?? null,
        date: info[i]?.date ?? null,
      }))

      albumsWithCover.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

      return { albums: albumsWithCover }
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
