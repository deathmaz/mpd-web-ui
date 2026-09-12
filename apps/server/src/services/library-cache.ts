import { LRUCache } from 'lru-cache'
import { getMpdClient } from './mpd.js'
import { clearArtCaches } from './art.js'

export interface AlbumEntry {
  album: string
  artist: string
  coverFile: string | null
  date: string | null
}

/**
 * Library listings are expensive (the albums list alone is one `find` per
 * album) and only change when MPD's database does, which MPD announces via
 * the `database` idle event. So: cache until that event.
 *
 * Promises are cached, not values, so concurrent callers share one fetch;
 * a rejected fetch is evicted immediately so errors are never cached.
 */
let artists: Promise<string[]> | null = null
let genres: Promise<string[]> | null = null
// key: album-artist filter, '' for the whole library
const albums = new LRUCache<string, Promise<AlbumEntry[]>>({ max: 200 })

function remember<T>(get: () => Promise<T> | undefined, set: (p: Promise<T>) => void, evict: () => void, fetch: () => Promise<T>): Promise<T> {
  const existing = get()
  if (existing) return existing
  const pending = fetch().catch((err) => {
    evict()
    throw err
  })
  set(pending)
  return pending
}

export function getArtists(): Promise<string[]> {
  return remember(
    () => artists ?? undefined,
    (p) => { artists = p },
    () => { artists = null },
    () => getMpdClient().listArtists(),
  )
}

export function getGenres(): Promise<string[]> {
  return remember(
    () => genres ?? undefined,
    (p) => { genres = p },
    () => { genres = null },
    () => getMpdClient().listGenres(),
  )
}

async function fetchAlbums(artist?: string): Promise<AlbumEntry[]> {
  const mpd = getMpdClient()
  const list = await mpd.listAlbums(artist)

  // Batch: first song per album for cover art and date, one command list
  let info: { coverFile: string | null; date: string | null }[]
  try {
    info = await mpd.findAlbumInfoBatch(list)
  } catch {
    info = list.map(() => ({ coverFile: null, date: null }))
  }

  const entries = list.map((a, i) => ({
    ...a,
    coverFile: info[i]?.coverFile ?? null,
    date: info[i]?.date ?? null,
  }))
  entries.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  return entries
}

export function getAlbums(artist?: string): Promise<AlbumEntry[]> {
  const key = artist ?? ''
  return remember(
    () => albums.get(key),
    (p) => { albums.set(key, p) },
    () => { albums.delete(key) },
    () => fetchAlbums(artist),
  )
}

export function invalidateLibraryCache(): void {
  artists = null
  genres = null
  albums.clear()
}

/**
 * Drop cached listings (and art) whenever MPD's database changes, and on
 * disconnect: after a reconnect we may be talking to a different library.
 */
export function setupLibraryCacheInvalidation(): void {
  const mpd = getMpdClient()
  const invalidate = () => {
    invalidateLibraryCache()
    clearArtCaches()
  }
  mpd.on('database', invalidate)
  mpd.on('disconnect', invalidate)
}
