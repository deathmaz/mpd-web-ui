import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getArtists,
  getAlbums,
  getGenres,
  invalidateLibraryCache,
  setupLibraryCacheInvalidation,
} from '../library-cache.js'
import { artCache } from '../art.js'

const mpd = await vi.hoisted(async () => {
  const { EventEmitter } = await import('events')
  const emitter = new EventEmitter() as InstanceType<typeof EventEmitter> & {
    listArtists: ReturnType<typeof vi.fn>
    listGenres: ReturnType<typeof vi.fn>
    listAlbums: ReturnType<typeof vi.fn>
    findAlbumInfoBatch: ReturnType<typeof vi.fn>
  }
  emitter.listArtists = vi.fn()
  emitter.listGenres = vi.fn()
  emitter.listAlbums = vi.fn()
  emitter.findAlbumInfoBatch = vi.fn()
  return emitter
})

vi.mock('../mpd.js', () => ({
  getMpdClient: () => mpd,
}))

describe('library cache', () => {
  beforeEach(() => {
    invalidateLibraryCache()
    mpd.removeAllListeners()
    mpd.listArtists.mockResolvedValue(['A', 'B'])
    mpd.listGenres.mockResolvedValue(['Rock'])
    mpd.listAlbums.mockResolvedValue([
      { album: 'Two', artist: 'A' },
      { album: 'One', artist: 'B' },
    ])
    mpd.findAlbumInfoBatch.mockResolvedValue([
      { coverFile: 'a/two.mp3', date: '2001' },
      { coverFile: 'b/one.mp3', date: '1999' },
    ])
  })

  it('serves artists and genres from cache after the first call', async () => {
    expect(await getArtists()).toEqual(['A', 'B'])
    expect(await getArtists()).toEqual(['A', 'B'])
    expect(await getGenres()).toEqual(['Rock'])
    expect(await getGenres()).toEqual(['Rock'])

    expect(mpd.listArtists).toHaveBeenCalledTimes(1)
    expect(mpd.listGenres).toHaveBeenCalledTimes(1)
  })

  it('builds the album list with cover/date once, sorted by date', async () => {
    const first = await getAlbums()
    expect(first).toEqual([
      { album: 'One', artist: 'B', coverFile: 'b/one.mp3', date: '1999' },
      { album: 'Two', artist: 'A', coverFile: 'a/two.mp3', date: '2001' },
    ])
    expect(await getAlbums()).toBe(first)

    expect(mpd.listAlbums).toHaveBeenCalledTimes(1)
    expect(mpd.findAlbumInfoBatch).toHaveBeenCalledTimes(1)
  })

  it('keeps per-artist album lists separate from the full list', async () => {
    await getAlbums()
    await getAlbums('A')
    await getAlbums('A')

    expect(mpd.listAlbums).toHaveBeenCalledTimes(2)
    expect(mpd.listAlbums).toHaveBeenCalledWith(undefined)
    expect(mpd.listAlbums).toHaveBeenCalledWith('A')
  })

  it('falls back to null cover/date when the batch lookup fails', async () => {
    mpd.findAlbumInfoBatch.mockRejectedValue(new Error('timeout'))

    expect(await getAlbums()).toEqual([
      { album: 'Two', artist: 'A', coverFile: null, date: null },
      { album: 'One', artist: 'B', coverFile: null, date: null },
    ])
  })

  it('shares one fetch between concurrent callers', async () => {
    const [a, b] = await Promise.all([getArtists(), getArtists()])
    expect(a).toBe(b)
    expect(mpd.listArtists).toHaveBeenCalledTimes(1)
  })

  it('does not cache failures', async () => {
    mpd.listArtists.mockRejectedValueOnce(new Error('Not connected'))

    await expect(getArtists()).rejects.toThrow('Not connected')
    expect(await getArtists()).toEqual(['A', 'B'])
    expect(mpd.listArtists).toHaveBeenCalledTimes(2)
  })

  it('refetches after the MPD database changes and after a disconnect', async () => {
    setupLibraryCacheInvalidation()
    artCache.set('x.mp3', { type: 'image/jpeg', data: Buffer.from([1]) })

    await getArtists()
    await getAlbums()
    mpd.emit('database')
    await getArtists()
    await getAlbums()
    expect(mpd.listArtists).toHaveBeenCalledTimes(2)
    expect(mpd.listAlbums).toHaveBeenCalledTimes(2)
    expect(artCache.has('x.mp3')).toBe(false)

    mpd.emit('disconnect')
    await getArtists()
    expect(mpd.listArtists).toHaveBeenCalledTimes(3)
  })
})
