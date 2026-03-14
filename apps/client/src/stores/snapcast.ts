import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SnapcastClient } from '@/snapcast/snapcastClient'
import { SnapcastControl } from '@/snapcast/snapcastControl'
import { loadFlacLibrary } from '@/snapcast/decoder'
import type { ConnectionState } from '@/snapcast/types'

const LS_SERVER_URL = 'snapcast.serverUrl'

export const useSnapcastStore = defineStore('snapcast', () => {
  const serverUrl = ref(localStorage.getItem(LS_SERVER_URL) || '')
  const connectionState = ref<ConnectionState>('disconnected')
  const error = ref<string | null>(null)
  const volume = ref(100)
  const muted = ref(false)
  const codec = ref('')
  const bufferMs = ref(0)

  const configured = computed(() => serverUrl.value.length > 0)
  const connected = computed(() => connectionState.value === 'connected')

  let streamClient: SnapcastClient | null = null
  let controlClient: SnapcastControl | null = null

  function getWsUrl(): string {
    let url = serverUrl.value.trim()
    // Add ws:// if no protocol specified
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = 'ws://' + url
    }
    // Add default port if none specified
    const urlWithoutProto = url.replace(/^wss?:\/\//, '')
    if (!urlWithoutProto.includes(':')) {
      url += ':1780'
    }
    return url
  }

  async function connect(): Promise<void> {
    if (connectionState.value !== 'disconnected') return
    if (!serverUrl.value.trim()) {
      error.value = 'Server address required'
      return
    }

    error.value = null

    // Pre-load FLAC decoder library before connecting
    try {
      await loadFlacLibrary()
    } catch {
      console.warn('Snapcast: Could not load FLAC library, PCM-only mode')
    }

    const wsUrl = getWsUrl()

    streamClient = new SnapcastClient()
    streamClient.setEvents({
      onStateChange(state) {
        connectionState.value = state
      },
      onServerSettings(settings) {
        volume.value = settings.volume
        muted.value = settings.muted
        bufferMs.value = settings.bufferMs
      },
      onCodec(c) {
        codec.value = c
      },
      onError(err) {
        error.value = err
      },
    })

    controlClient = new SnapcastControl()
    controlClient.setEvents({
      onVolumeChange(clientId, vol) {
        if (clientId === streamClient?.getClientId()) {
          volume.value = vol.percent
          muted.value = vol.muted
        }
      },
      onError(err) {
        error.value = err
      },
    })

    streamClient.connect(wsUrl)
    controlClient.connect(wsUrl)

    localStorage.setItem(LS_SERVER_URL, serverUrl.value)
  }

  function disconnect(): void {
    streamClient?.disconnect()
    controlClient?.disconnect()
    streamClient = null
    controlClient = null
    connectionState.value = 'disconnected'
    codec.value = ''
  }

  async function setVolume(percent: number): Promise<void> {
    if (!controlClient || !streamClient) return
    const clientId = streamClient.getClientId()
    await controlClient.setClientVolume(clientId, percent, muted.value)
    volume.value = percent
  }

  async function toggleMute(): Promise<void> {
    if (!controlClient || !streamClient) return
    const clientId = streamClient.getClientId()
    const newMuted = !muted.value
    await controlClient.setClientVolume(clientId, volume.value, newMuted)
    muted.value = newMuted
  }

  function saveUrl(url: string): void {
    serverUrl.value = url
    localStorage.setItem(LS_SERVER_URL, url)
  }

  function clearConfig(): void {
    disconnect()
    serverUrl.value = ''
    localStorage.removeItem(LS_SERVER_URL)
  }

  return {
    serverUrl,
    connectionState,
    error,
    volume,
    muted,
    codec,
    configured,
    connected,
    connect,
    disconnect,
    setVolume,
    toggleMute,
    saveUrl,
    clearConfig,
  }
})
