import { describe, expect, it } from 'vitest'
import { buildPrefixSums, findStartIndex } from '../useVirtualList'

describe('buildPrefixSums', () => {
  it('returns [0] for empty list', () => {
    expect(buildPrefixSums([], () => 40)).toEqual([0])
  })

  it('builds correct sums for uniform heights', () => {
    const items = ['a', 'b', 'c']
    expect(buildPrefixSums(items, () => 40)).toEqual([0, 40, 80, 120])
  })

  it('builds correct sums for mixed heights', () => {
    const items = [
      { type: 'header' as const },
      { type: 'song' as const },
      { type: 'song' as const },
      { type: 'header' as const },
      { type: 'song' as const },
    ]
    const height = (item: { type: 'header' | 'song' }) => item.type === 'header' ? 30 : 44
    expect(buildPrefixSums(items, height)).toEqual([0, 30, 74, 118, 148, 192])
  })

  it('handles single item', () => {
    expect(buildPrefixSums(['x'], () => 50)).toEqual([0, 50])
  })
})

describe('findStartIndex', () => {
  // Uniform heights: 5 items of 40px each → sums = [0, 40, 80, 120, 160, 200]
  const uniformSums = [0, 40, 80, 120, 160, 200]

  it('returns 0 when scrollTop is 0', () => {
    expect(findStartIndex(uniformSums, 0)).toBe(0)
  })

  it('returns 0 when scrollTop is within first item', () => {
    expect(findStartIndex(uniformSums, 20)).toBe(0)
  })

  it('returns 1 when scrollTop is exactly at second item', () => {
    expect(findStartIndex(uniformSums, 40)).toBe(1)
  })

  it('returns correct index for middle scroll position', () => {
    expect(findStartIndex(uniformSums, 100)).toBe(2)
  })

  it('returns last index when scrolled to end', () => {
    expect(findStartIndex(uniformSums, 180)).toBe(4)
  })

  it('returns length when scrolled past end', () => {
    // Returns items.length (one past last), clamped by visibleItems computed
    expect(findStartIndex(uniformSums, 999)).toBe(5)
  })

  // Mixed heights: header(30), song(44), song(44), header(30), song(44)
  // sums = [0, 30, 74, 118, 148, 192]
  const mixedSums = [0, 30, 74, 118, 148, 192]

  it('finds correct index in mixed-height list', () => {
    expect(findStartIndex(mixedSums, 0)).toBe(0)    // in header 0
    expect(findStartIndex(mixedSums, 30)).toBe(1)   // at song 1
    expect(findStartIndex(mixedSums, 50)).toBe(1)   // in song 1
    expect(findStartIndex(mixedSums, 74)).toBe(2)   // at song 2
    expect(findStartIndex(mixedSums, 118)).toBe(3)  // at header 3
    expect(findStartIndex(mixedSums, 148)).toBe(4)  // at song 4
  })

  it('handles single-item prefix sums', () => {
    expect(findStartIndex([0, 44], 0)).toBe(0)
    expect(findStartIndex([0, 44], 20)).toBe(0)
  })
})
