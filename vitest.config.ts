import { defineConfig } from 'vitest/config'

// The unit-tested modules in shared/utils are pure TypeScript, so they run without Nuxt.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
