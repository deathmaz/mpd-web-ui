<script setup lang="ts">
import { ref } from 'vue'
import { sendCommand } from '@/composables/useWebSocket'

const emit = defineEmits<{ close: [] }>()

const name = ref('')
const saving = ref(false)
const showOverwrite = ref(false)
const error = ref('')

async function save() {
  const val = name.value.trim()
  if (!val || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await sendCommand('savePlaylist', { name: val })
    emit('close')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('already exists')) {
      showOverwrite.value = true
    } else {
      error.value = msg
    }
  } finally {
    saving.value = false
  }
}

async function overwrite() {
  const val = name.value.trim()
  if (!val || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await sendCommand('deletePlaylist', { name: val })
    await sendCommand('savePlaylist', { name: val })
    emit('close')
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

function onNameInput() {
  showOverwrite.value = false
  error.value = ''
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="emit('close')">
    <div class="bg-surface rounded-xl p-5 w-80 shadow-2xl">
      <h3 class="text-base font-semibold mb-4">Save as Playlist</h3>

      <label class="block text-sm text-text-muted mb-1">Playlist name</label>
      <input
        v-model="name"
        type="text"
        placeholder="My playlist"
        class="w-full px-3 py-2 bg-surface-alt rounded-lg text-base text-text border border-border focus:border-primary focus:outline-none mb-2"
        @input="onNameInput"
        @keydown.enter="showOverwrite ? overwrite() : save()"
      />

      <p v-if="showOverwrite" class="text-xs text-text-muted mb-2">
        A playlist with this name already exists. Overwrite?
      </p>
      <p v-if="error" class="text-xs text-text-muted mb-2">{{ error }}</p>

      <div class="flex gap-2 justify-end">
        <button
          class="px-4 py-2 text-sm rounded-lg bg-surface-hover text-text-muted hover:text-text transition-colors"
          @click="emit('close')"
        >Cancel</button>
        <button
          v-if="showOverwrite"
          class="px-4 py-2 text-sm rounded-lg bg-primary text-surface hover:bg-primary-hover transition-colors"
          :disabled="saving"
          @click="overwrite"
        >Overwrite</button>
        <button
          v-else
          class="px-4 py-2 text-sm rounded-lg bg-primary text-surface hover:bg-primary-hover transition-colors"
          :disabled="!name.trim() || saving"
          @click="save"
        >Save</button>
      </div>
    </div>
  </div>
</template>
