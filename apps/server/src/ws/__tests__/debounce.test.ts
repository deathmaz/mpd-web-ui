import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncedBroadcaster } from '../debounce.js'

describe('createDebouncedBroadcaster', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires the first call immediately (leading edge)', async () => {
    const debounced = createDebouncedBroadcaster(150)
    const fn = vi.fn().mockResolvedValue(undefined)

    debounced('test', fn)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('fires trailing call after the delay when there are subsequent calls', async () => {
    const debounced = createDebouncedBroadcaster(150)
    const fn1 = vi.fn().mockResolvedValue(undefined)
    const fn2 = vi.fn().mockResolvedValue(undefined)
    const fn3 = vi.fn().mockResolvedValue(undefined)

    debounced('test', fn1) // fires immediately (leading)
    debounced('test', fn2) // stored as pending
    debounced('test', fn3) // replaces fn2 as pending

    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).not.toHaveBeenCalled()
    expect(fn3).not.toHaveBeenCalled()

    // After delay, trailing edge fires fn3
    await vi.advanceTimersByTimeAsync(150)
    expect(fn2).not.toHaveBeenCalled()
    expect(fn3).toHaveBeenCalledOnce()
  })

  it('does not fire trailing if only one call was made', async () => {
    const debounced = createDebouncedBroadcaster(150)
    const fn = vi.fn().mockResolvedValue(undefined)

    debounced('test', fn)
    expect(fn).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(150)
    // Should still only be called once — no trailing needed
    expect(fn).toHaveBeenCalledOnce()
  })

  it('throttles different keys independently', async () => {
    const debounced = createDebouncedBroadcaster(150)
    const fnA = vi.fn().mockResolvedValue(undefined)
    const fnB = vi.fn().mockResolvedValue(undefined)

    debounced('player', fnA)
    debounced('playlist', fnB)

    // Both fire immediately since they are independent keys
    expect(fnA).toHaveBeenCalledOnce()
    expect(fnB).toHaveBeenCalledOnce()
  })

  it('allows a new leading call after the cooldown expires', async () => {
    const debounced = createDebouncedBroadcaster(150)
    const fn1 = vi.fn().mockResolvedValue(undefined)
    const fn2 = vi.fn().mockResolvedValue(undefined)

    debounced('test', fn1)
    expect(fn1).toHaveBeenCalledOnce()

    // Wait for cooldown to expire
    await vi.advanceTimersByTimeAsync(150)

    // New call should fire immediately again
    debounced('test', fn2)
    expect(fn2).toHaveBeenCalledOnce()
  })

  it('logs errors from the async callback without throwing', async () => {
    const debounced = createDebouncedBroadcaster(150)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fn = vi.fn().mockRejectedValue(new Error('fetch failed'))

    debounced('player', fn)

    // Let the microtask (promise rejection) settle
    await vi.advanceTimersByTimeAsync(0)

    expect(fn).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith(
      'Error in debounced player broadcast:',
      expect.any(Error),
    )

    consoleError.mockRestore()
  })

  it('respects custom delay', async () => {
    const debounced = createDebouncedBroadcaster(300)
    const fn1 = vi.fn().mockResolvedValue(undefined)
    const fn2 = vi.fn().mockResolvedValue(undefined)

    debounced('test', fn1) // fires immediately
    debounced('test', fn2) // stored as pending

    await vi.advanceTimersByTimeAsync(200)
    expect(fn2).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(fn2).toHaveBeenCalledOnce()
  })

  it('restarts throttle cycle when trailing fires', async () => {
    const debounced = createDebouncedBroadcaster(150)
    const fn1 = vi.fn().mockResolvedValue(undefined)
    const fn2 = vi.fn().mockResolvedValue(undefined)
    const fn3 = vi.fn().mockResolvedValue(undefined)

    debounced('test', fn1) // leading — fires
    debounced('test', fn2) // pending

    await vi.advanceTimersByTimeAsync(150)
    // fn2 fires as trailing, which restarts the cycle
    expect(fn2).toHaveBeenCalledOnce()

    // During the new cooldown, fn3 should be stored as pending
    debounced('test', fn3)
    expect(fn3).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)
    expect(fn3).toHaveBeenCalledOnce()
  })
})
