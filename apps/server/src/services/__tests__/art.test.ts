import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getArt, artCache, missingArt, clearArtCaches } from '../art.js'

const mpd = vi.hoisted(() => ({ getFullAlbumArt: vi.fn() }))

vi.mock('../mpd.js', () => ({
  getMpdClient: () => mpd,
}))

const ART = { type: 'image/jpeg', data: Buffer.from([1, 2, 3]) }

describe('getArt', () => {
  beforeEach(() => {
    clearArtCaches()
  })

  it('fetches from MPD once and serves the positive cache afterwards', async () => {
    mpd.getFullAlbumArt.mockResolvedValue(ART)

    expect(await getArt('a.mp3')).toBe(ART)
    expect(await getArt('a.mp3')).toBe(ART)

    expect(mpd.getFullAlbumArt).toHaveBeenCalledTimes(1)
    expect(artCache.get('a.mp3')).toBe(ART)
  })

  it('remembers files without art and does not ask MPD again', async () => {
    mpd.getFullAlbumArt.mockResolvedValue(null)

    expect(await getArt('bare.mp3')).toBeNull()
    expect(await getArt('bare.mp3')).toBeNull()

    expect(mpd.getFullAlbumArt).toHaveBeenCalledTimes(1)
    expect(missingArt.has('bare.mp3')).toBe(true)
  })

  it('shares one MPD fetch between concurrent requests for the same URI', async () => {
    let resolve!: (art: typeof ART) => void
    mpd.getFullAlbumArt.mockReturnValue(new Promise((r) => { resolve = r }))

    const first = getArt('slow.mp3')
    const second = getArt('slow.mp3')
    expect(mpd.getFullAlbumArt).toHaveBeenCalledTimes(1)

    resolve(ART)
    expect(await first).toBe(ART)
    expect(await second).toBe(ART)

    // in-flight entry is released: a later miss (after cache clear) fetches again
    clearArtCaches()
    mpd.getFullAlbumArt.mockResolvedValue(ART)
    await getArt('slow.mp3')
    expect(mpd.getFullAlbumArt).toHaveBeenCalledTimes(2)
  })

  it('does not let a fetch started before clearArtCaches() repopulate the caches', async () => {
    let resolve!: (art: null) => void
    mpd.getFullAlbumArt.mockReturnValueOnce(new Promise((r) => { resolve = r }))

    const stale = getArt('new-cover.mp3')
    clearArtCaches() // e.g. MPD `database` event: cover.jpg was just added
    resolve(null) // old fetch answers for the pre-update library
    expect(await stale).toBeNull()

    expect(missingArt.has('new-cover.mp3')).toBe(false)
    mpd.getFullAlbumArt.mockResolvedValue(ART)
    expect(await getArt('new-cover.mp3')).toBe(ART)
    expect(mpd.getFullAlbumArt).toHaveBeenCalledTimes(2)
  })

  it('propagates MPD errors and caches nothing', async () => {
    mpd.getFullAlbumArt.mockRejectedValue(new Error('Not connected'))

    await expect(getArt('x.mp3')).rejects.toThrow('Not connected')
    expect(artCache.has('x.mp3')).toBe(false)
    expect(missingArt.has('x.mp3')).toBe(false)

    mpd.getFullAlbumArt.mockResolvedValue(ART)
    expect(await getArt('x.mp3')).toBe(ART)
  })
})
