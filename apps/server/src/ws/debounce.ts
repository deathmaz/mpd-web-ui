type AsyncFn = () => Promise<void>

/**
 * Creates a keyed throttle (leading + trailing edge).
 * First call for a key fires immediately; subsequent calls within the
 * window are coalesced and the last one fires when the window expires.
 */
export function createDebouncedBroadcaster(delayMs = 150) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Map<string, AsyncFn>()

  function execute(key: string, fn: AsyncFn): void {
    fn().catch((err) =>
      console.error(`Error in debounced ${key} broadcast:`, err),
    )
  }

  return function debounced(key: string, fn: AsyncFn): void {
    if (!timers.has(key)) {
      // Leading edge: fire immediately, start cooldown
      execute(key, fn)
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          const trailingFn = pending.get(key)
          if (trailingFn) {
            pending.delete(key)
            // Restart the cycle so further rapid calls are also throttled
            debounced(key, trailingFn)
          }
        }, delayMs),
      )
    } else {
      // Within cooldown: store latest for trailing edge
      pending.set(key, fn)
    }
  }
}
