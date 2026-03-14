import { describe, expect, it } from 'vitest'
import { TimeProvider } from '../timeProvider'

describe('TimeProvider', () => {
  it('starts with zero diff', () => {
    const tp = new TimeProvider()
    expect(tp.diff).toBe(0)
  })

  it('computes median of single sample', () => {
    const tp = new TimeProvider()
    tp.setDiff(100, 90)
    // offset = (100 - 90) / 2 = 5
    expect(tp.diff).toBe(5)
  })

  it('computes median of odd samples', () => {
    const tp = new TimeProvider()
    tp.setDiff(100, 80) // offset = 10
    tp.setDiff(100, 90) // offset = 5
    tp.setDiff(100, 70) // offset = 15
    // sorted: [5, 10, 15], median = 10
    expect(tp.diff).toBe(10)
  })

  it('computes median of even samples', () => {
    const tp = new TimeProvider()
    tp.setDiff(100, 80) // 10
    tp.setDiff(100, 90) // 5
    tp.setDiff(100, 70) // 15
    tp.setDiff(100, 60) // 20
    // sorted: [5, 10, 15, 20], Math.floor(4/2) = index 2 → 15
    expect(tp.diff).toBe(15)
  })

  it('evicts samples beyond 100', () => {
    const tp = new TimeProvider()
    // Add 100 samples with offset = 50
    for (let i = 0; i < 100; i++) {
      tp.setDiff(200, 100) // offset = 50
    }
    expect(tp.diff).toBe(50)

    // Add 50 more samples with offset = 10, pushing out old ones
    for (let i = 0; i < 50; i++) {
      tp.setDiff(100, 80) // offset = 10
    }
    // Now 50 samples of 50 and 50 samples of 10
    // sorted: [10 x50, 50 x50], index 50 → 50
    expect(tp.diff).toBe(50)

    // Add 51 more samples of 10 to make them majority
    for (let i = 0; i < 51; i++) {
      tp.setDiff(100, 80) // offset = 10
    }
    // Now buffer is full of recent values, median should shift to 10
    expect(tp.diff).toBe(10)
  })

  it('applies diff to serverTime', () => {
    const tp = new TimeProvider()
    tp.setDiff(200, 100) // offset = 50
    expect(tp.serverTime(1000)).toBe(1050)
  })

  it('resets state', () => {
    const tp = new TimeProvider()
    tp.setDiff(200, 100)
    expect(tp.diff).toBe(50)
    tp.reset()
    expect(tp.diff).toBe(0)
  })

  it('now() returns positive value without AudioContext', () => {
    const tp = new TimeProvider()
    expect(tp.now()).toBeGreaterThan(0)
  })
})
