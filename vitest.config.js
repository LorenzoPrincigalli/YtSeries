import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'cloudflare-worker/**/*.test.js'],
    globals: false,
  },
})
