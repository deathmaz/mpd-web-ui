import { LRUCache } from 'lru-cache'

interface CachedArt {
  type: string
  data: Buffer
}

// Max 50MB of cached album art
export const artCache = new LRUCache<string, CachedArt>({
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (value) => value.data.length,
})
