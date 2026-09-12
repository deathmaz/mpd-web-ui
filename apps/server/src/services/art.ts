import { LRUCache } from 'lru-cache'
import { getMpdClient } from './mpd.js'

export interface Art {
  type: string
  data: Buffer
}

// Max 50MB of cached album art
export const artCache = new LRUCache<string, Art>({
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (value) => value.data.length,
})

// URIs known to have no art. Cheap to keep, and it stops every render of a
// track list from asking MPD twice (readpicture + albumart) per art-less file.
const NEGATIVE_TTL = 60 * 60 * 1000
export const missingArt = new LRUCache<string, true>({
  max: 5000,
  ttl: NEGATIVE_TTL,
})

// Requests for the same URI while a fetch is in flight share that fetch
// instead of each queueing their own MPD commands.
const inFlight = new Map<string, Promise<Art | null>>()

// Bumped by clearArtCaches(); a fetch started before a clear must not write
// its (possibly stale) result into the freshly cleared caches.
let generation = 0

/**
 * Album art for a song URI: positive cache, negative cache, then MPD.
 * Resolves null when MPD has no art for the file.
 */
export function getArt(uri: string): Promise<Art | null> {
  const cached = artCache.get(uri)
  if (cached) return Promise.resolve(cached)
  if (missingArt.has(uri)) return Promise.resolve(null)

  const pending = inFlight.get(uri)
  if (pending) return pending

  const startedIn = generation
  const fetching: Promise<Art | null> = getMpdClient()
    .getFullAlbumArt(uri)
    .then((art) => {
      if (startedIn === generation) {
        if (art) {
          artCache.set(uri, art)
        } else {
          missingArt.set(uri, true)
        }
      }
      return art
    })
    .finally(() => {
      if (inFlight.get(uri) === fetching) inFlight.delete(uri)
    })
  inFlight.set(uri, fetching)
  return fetching
}

/** Drop all cached art, e.g. after the MPD database changed. */
export function clearArtCaches(): void {
  generation++
  artCache.clear()
  missingArt.clear()
  inFlight.clear()
}
