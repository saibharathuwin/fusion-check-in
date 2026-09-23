import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Pure-logic unit tests only (checkInStatus.ts, sessionWindowStatus) — no DOM/React rendering
    // needed, so the default 'node' environment is enough; no jsdom dependency to add for it.
    include: ['src/**/*.test.ts'],
  },
})