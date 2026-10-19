/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The browser reaches Vite through Caddy (:8080 or :8443), not directly.
    // Live reload then connects back on whichever port the page came from.
    allowedHosts: true,
    // Docker on Windows doesn't forward file-change events into containers.
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
