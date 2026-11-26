import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Same-origin /api → review API; VITE_API_URL keeps direct-URL deploys.
      '/api': {
        // 8010 is the review API's port — 8000 belongs to a stale WSL relay.
        target: 'http://localhost:8010',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    globals: true,
  },
})
