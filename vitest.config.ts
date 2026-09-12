import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // Same alias as apps/client/vite.config.ts so client modules that use
      // `@/` can be imported from tests run at the workspace root
      '@': resolve(import.meta.dirname, 'apps/client/src'),
    },
  },
})
