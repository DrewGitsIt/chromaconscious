import { defineConfig } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  // visual-parity is a local refactoring net, recorded on demand; its
  // baselines drift with every intended engine change, so CI never gates on it.
  testIgnore: CI ? ['**/visual-parity.spec.ts'] : [],
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    // Locally, reuse the installed Chrome so no browser download is needed. CI
    // uses Playwright's pinned Chromium, so a runner image update can't move it.
    channel: CI ? undefined : 'chrome',
    headless: true,
    trace: CI ? 'on-first-retry' : 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 5199',
    url: 'http://localhost:5199',
    reuseExistingServer: !CI,
  },
})
