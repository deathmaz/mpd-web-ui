<script setup lang="ts">
import { ref } from 'vue'
import { useSnapcastStore } from '@/stores/snapcast'

const emit = defineEmits<{
  close: []
  connect: []
}>()

const snapcast = useSnapcastStore()
const address = ref(snapcast.serverUrl || '')

function handleConnect() {
  const val = address.value.trim()
  if (!val) return
  if (snapcast.connected) {
    snapcast.disconnect()
  }
  snapcast.saveUrl(val)
  emit('connect')
  emit('close')
}

function handleDisconnect() {
  snapcast.disconnect()
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="emit('close')">
    <div class="bg-surface rounded-xl p-5 w-80 shadow-2xl">
      <h3 class="text-base font-semibold mb-4">Snapcast Server</h3>

      <label class="block text-sm text-text-muted mb-1">Server address</label>
      <input
        v-model="address"
        type="text"
        placeholder="192.168.1.50:1780"
        class="w-full px-3 py-2 bg-surface-alt rounded-lg text-base text-text border border-border focus:border-primary focus:outline-none mb-1"
        @keydown.enter="handleConnect"
      />
      <p class="text-xs text-text-muted mb-4">Default port is 1780 if omitted</p>

      <div class="flex gap-2 justify-end">
        <button
          v-if="snapcast.connected"
          class="px-4 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors mr-auto"
          @click="handleDisconnect"
        >Disconnect</button>
        <button
          class="px-4 py-2 text-sm rounded-lg bg-surface-hover text-text-muted hover:text-text transition-colors"
          @click="emit('close')"
        >Cancel</button>
        <button
          class="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors"
          :disabled="!address.trim()"
          @click="handleConnect"
        >{{ snapcast.connected ? 'Reconnect' : 'Connect' }}</button>
      </div>
    </div>
  </div>
</template>
