import { ref, watch, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'

export function useElapsedTime() {
  const currentTime = ref(0)
  const playerStore = usePlayerStore()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let lastUpdate = 0
  let lastElapsed = 0

  function startTimer() {
    stopTimer()
    intervalId = setInterval(() => {
      if (playerStore.playState === 'play') {
        const delta = (Date.now() - lastUpdate) / 1000
        currentTime.value = lastElapsed + delta
      }
    }, 250)
  }

  function stopTimer() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  watch(
    () => [playerStore.elapsed, playerStore.playState] as const,
    ([elapsed, state]) => {
      lastElapsed = elapsed
      lastUpdate = Date.now()
      currentTime.value = elapsed

      if (state === 'play') {
        startTimer()
      } else {
        stopTimer()
      }
    },
    { immediate: true },
  )

  onUnmounted(() => stopTimer())

  return { currentTime }
}
