import { ref } from 'vue'
import { usePlayerStore } from '@/stores/player'

// Singleton state — shared across all components
const currentTime = ref(0)
let store: ReturnType<typeof usePlayerStore> | null = null

function tick() {
  if (!store) return
  if (store.playState === 'play' && store.elapsedReceivedAt > 0) {
    const delta = (Date.now() - store.elapsedReceivedAt) / 1000
    currentTime.value = Math.min(store.elapsed + delta, store.duration ?? Infinity)
  } else {
    currentTime.value = store.elapsed
  }
}

export function useElapsedTime() {
  if (!store) {
    store = usePlayerStore()
    tick()
    setInterval(tick, 250)
  }
  return { currentTime }
}

/** Optimistically update the displayed time (call before sending seek command) */
export function seekTo(time: number) {
  if (store) {
    store.seekTo(time)
  }
  currentTime.value = time
}
