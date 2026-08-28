import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    setupFiles: ['./tests/setup.ts'],
    // Integration tests hold interactive transactions against a pooled remote
    // database; running files in parallel exhausts the pool rather than finding bugs.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // `server-only` throws outside the Next.js server bundle. Tests exercise the
      // server modules directly, so it is stubbed rather than worked around.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
})
