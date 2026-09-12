import { describe, expect, it } from 'vitest'
import { shouldReconnectOnWake } from '../useWebSocket'

const HEARTBEAT_TIMEOUT = 45_000

describe('shouldReconnectOnWake', () => {
  it('reconnects when the socket is not open', () => {
    expect(shouldReconnectOnWake({ open: false, lastMessageAt: Date.now(), now: Date.now() })).toBe(true)
  })

  it('keeps an open socket that received a message within the heartbeat window', () => {
    const now = 1_000_000
    expect(shouldReconnectOnWake({ open: true, lastMessageAt: now - 1000, now })).toBe(false)
    expect(shouldReconnectOnWake({ open: true, lastMessageAt: now - HEARTBEAT_TIMEOUT, now })).toBe(false)
  })

  it('reconnects an open socket that has been silent longer than the heartbeat window', () => {
    const now = 1_000_000
    expect(shouldReconnectOnWake({ open: true, lastMessageAt: now - HEARTBEAT_TIMEOUT - 1, now })).toBe(true)
  })
})
