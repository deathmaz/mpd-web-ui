import { describe, it, expect } from 'vitest'
import { formatDuration, formatTotalDuration } from '../format'

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('formats seconds under a minute', () => {
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(45)).toBe('0:45')
  })

  it('formats whole minutes', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(120)).toBe('2:00')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(185)).toBe('3:05')
    expect(formatDuration(599)).toBe('9:59')
  })

  it('formats durations over an hour', () => {
    expect(formatDuration(3600)).toBe('60:00')
    expect(formatDuration(3661)).toBe('61:01')
  })

  it('truncates fractional seconds', () => {
    expect(formatDuration(90.7)).toBe('1:30')
    expect(formatDuration(59.999)).toBe('0:59')
  })

  it('returns --:-- for undefined', () => {
    expect(formatDuration(undefined)).toBe('--:--')
  })

  it('returns --:-- for negative values', () => {
    expect(formatDuration(-1)).toBe('--:--')
    expect(formatDuration(-100)).toBe('--:--')
  })
})

describe('formatTotalDuration', () => {
  it('formats minutes only', () => {
    expect(formatTotalDuration(0)).toBe('0m')
    expect(formatTotalDuration(300)).toBe('5m')
    expect(formatTotalDuration(59 * 60)).toBe('59m')
  })

  it('formats hours and minutes', () => {
    expect(formatTotalDuration(3600)).toBe('1h 0m')
    expect(formatTotalDuration(3600 + 1800)).toBe('1h 30m')
    expect(formatTotalDuration(7200 + 900)).toBe('2h 15m')
  })

  it('truncates seconds', () => {
    expect(formatTotalDuration(3599)).toBe('59m')
    expect(formatTotalDuration(3601)).toBe('1h 0m')
  })
})
