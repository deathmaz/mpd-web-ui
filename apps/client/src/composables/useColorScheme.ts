import { ref } from 'vue'
import { colorSchemes } from './colorSchemes'

const LS_KEY = 'color-scheme'
const DEFAULT_SCHEME_ID = 'default'

let initialized = false
const currentSchemeId = ref(DEFAULT_SCHEME_ID)

function applyScheme(id: string): void {
  if (initialized && currentSchemeId.value === id) return
  const scheme = colorSchemes.find(s => s.id === id)
  if (!scheme) return

  const root = document.documentElement
  for (const [prop, value] of Object.entries(scheme.colors)) {
    root.style.setProperty(prop, value)
  }

  currentSchemeId.value = id
  localStorage.setItem(LS_KEY, id)
}

function initColorScheme(): void {
  const saved = localStorage.getItem(LS_KEY)
  const id = saved && colorSchemes.some(s => s.id === saved) ? saved : DEFAULT_SCHEME_ID
  applyScheme(id)
  initialized = true
}

export function useColorScheme() {
  return {
    currentSchemeId,
    schemes: colorSchemes,
    applyScheme,
    initColorScheme,
  }
}
