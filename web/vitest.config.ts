import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true, // required by the @testing-library/jest-dom side-effect setup
    setupFiles: ['./tests/setup.ts'],
  },
  // The API-route tests import the engine via @engine → ../src/web.ts, which
  // lives outside the web/ root; allow vite to read the parent directory.
  server: { fs: { allow: ['..'] } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Mirror web/tsconfig.json + next.config.mjs so tests resolve the engine.
      '@engine': path.resolve(__dirname, '../src/web.ts'),
    },
  },
})
