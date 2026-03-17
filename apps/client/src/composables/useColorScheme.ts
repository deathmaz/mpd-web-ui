import { ref } from 'vue'
import { colorSchemes, type ColorScheme } from './colorSchemes'

const LS_KEY = 'color-scheme'
const DEFAULT_SCHEME_ID = 'default'

let initialized = false
const currentSchemeId = ref(DEFAULT_SCHEME_ID)

function buildFaviconSvg(bg: string, fg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="2" fill="${bg}"/><g fill="none" stroke="${fg}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16,4L16,22"/><path d="M13.5,7L16,4L18.5,7"/><path d="M16,22C16,22 10,20 9,14C8,9 11,6 11,6"/><path d="M9,8L11,6L12,9"/><path d="M16,22C16,22 22,20 23,14C24,9 21,6 21,6"/><path d="M23,8L21,6L20,9"/><path d="M12,22L16,24L20,22"/></g><g fill="${fg}" opacity="0.4"><rect x="3" y="3" width="1.5" height="1.5"/><rect x="3" y="6.5" width="1.5" height="1.5"/><rect x="3" y="10" width="1.5" height="1.5"/><rect x="27.5" y="3" width="1.5" height="1.5"/><rect x="27.5" y="6.5" width="1.5" height="1.5"/><rect x="27.5" y="10" width="1.5" height="1.5"/><rect x="3" y="21" width="1.5" height="1.5"/><rect x="3" y="24.5" width="1.5" height="1.5"/><rect x="3" y="28" width="1.5" height="1.5"/><rect x="27.5" y="21" width="1.5" height="1.5"/><rect x="27.5" y="24.5" width="1.5" height="1.5"/><rect x="27.5" y="28" width="1.5" height="1.5"/></g></svg>`
}

let faviconLink: HTMLLinkElement | null = null

function updateFavicon(scheme: ColorScheme): void {
  const svg = buildFaviconSvg(scheme.colors['--color-surface'], scheme.colors['--color-primary'])
  if (!faviconLink) {
    faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!faviconLink) {
      faviconLink = document.createElement('link')
      faviconLink.rel = 'icon'
      faviconLink.type = 'image/svg+xml'
      document.head.appendChild(faviconLink)
    }
  }
  faviconLink.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function applyScheme(id: string): void {
  if (initialized && currentSchemeId.value === id) return
  const scheme = colorSchemes.find(s => s.id === id)
  if (!scheme) return

  const root = document.documentElement
  for (const [prop, value] of Object.entries(scheme.colors)) {
    root.style.setProperty(prop, value)
  }

  updateFavicon(scheme)
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
