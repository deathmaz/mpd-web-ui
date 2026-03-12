import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { MpdStatus, MpdSong, MpdOutput } from '@mpd-web/shared'

export const usePlayerStore = defineStore('player', () => {
  const playState = ref<'play' | 'pause' | 'stop'>('stop')
  const volume = ref(-1)
  const repeat = ref(false)
  const random = ref(false)
  const single = ref<boolean | 'oneshot'>(false)
  const consume = ref<boolean | 'oneshot'>(false)
  const elapsed = ref(0)
  const duration = ref(0)
  const bitrate = ref(0)
  const audioFormat = ref('')
  const currentSong = ref<MpdSong | null>(null)
  const outputs = ref<MpdOutput[]>([])

  function updateStatus(status: MpdStatus) {
    playState.value = status.state
    volume.value = status.volume
    repeat.value = status.repeat
    random.value = status.random
    single.value = status.single
    consume.value = status.consume
    elapsed.value = status.elapsed ?? 0
    duration.value = status.duration ?? 0
    bitrate.value = status.bitrate ?? 0
    audioFormat.value = status.audio ?? ''
  }

  function updateCurrentSong(song: MpdSong | null) {
    currentSong.value = song
  }

  function updateOutputs(o: MpdOutput[]) {
    outputs.value = o
  }

  return {
    playState,
    volume,
    repeat,
    random,
    single,
    consume,
    elapsed,
    duration,
    bitrate,
    audioFormat,
    currentSong,
    outputs,
    updateStatus,
    updateCurrentSong,
    updateOutputs,
  }
})
