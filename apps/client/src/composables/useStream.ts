import { ref } from 'vue'

const audio = new Audio()
audio.preload = 'none'

const isPlaying = ref(false)
const isLoading = ref(false)
const streamError = ref<string | null>(null)

audio.addEventListener('playing', () => {
  isPlaying.value = true
  isLoading.value = false
  streamError.value = null
})

audio.addEventListener('pause', () => {
  isPlaying.value = false
})

audio.addEventListener('waiting', () => {
  isLoading.value = true
})

audio.addEventListener('error', () => {
  isPlaying.value = false
  isLoading.value = false
  streamError.value = 'Stream unavailable'
})

export function useStream() {
  function play() {
    streamError.value = null
    isLoading.value = true
    // Set src fresh each time to force reconnect
    audio.src = '/api/stream'
    audio.play().catch((err) => {
      isLoading.value = false
      streamError.value = err.message
    })
  }

  function stop() {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    isPlaying.value = false
    isLoading.value = false
  }

  function toggle() {
    if (isPlaying.value) {
      stop()
    } else {
      play()
    }
  }

  return {
    isPlaying,
    isLoading,
    streamError,
    play,
    stop,
    toggle,
  }
}
