import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  use: {
    baseURL: 'http://localhost:5199',
    // Reuse the installed Chrome so no browser download is needed.
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --port 5199',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
  },
})
