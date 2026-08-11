/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    // Playwright specs run via `npm run e2e`, not vitest.
    exclude: ['e2e/**', 'node_modules/**'],
    // material-color-utilities ships extensionless ESM imports; inline it so
    // Vite resolves them instead of Node's stricter ESM loader.
    server: {
      deps: {
        inline: ['@material/material-color-utilities'],
      },
    },
  },
})
