import { computed } from 'vue'
import { useStream } from './useStream'
import { useSnapcastStore } from '@/stores/snapcast'

export type AudioSource = 'none' | 'mpd-stream' | 'snapcast'

export function useAudioSource() {
  const stream = useStream()
  const snapcast = useSnapcastStore()

  const activeSource = computed<AudioSource>(() => {
    if (snapcast.connected) return 'snapcast'
    if (stream.isPlaying.value) return 'mpd-stream'
    return 'none'
  })

  const isListening = computed(() => activeSource.value !== 'none')

  function startMpdStream() {
    if (snapcast.connected) snapcast.disconnect()
    stream.play()
  }

  function startSnapcast() {
    stream.stop()
    snapcast.connect()
  }

  function stopAll() {
    stream.stop()
    snapcast.disconnect()
  }

  return {
    activeSource,
    isListening,
    startMpdStream,
    startSnapcast,
    stopAll,
    stream,
    snapcast,
  }
}
