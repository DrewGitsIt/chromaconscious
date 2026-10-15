#!/usr/bin/env node
/**
 * Re-take the README's screenshots from the current code.
 *
 *   npm run dev -- --port 5199     # in another terminal
 *   node scripts/readme-screenshots.mjs
 *
 * Writes docs/images/*.png. The dev server has no API, so theme links
 * (#t_…) are answered by the live one: the shots show this build's UI on a
 * real stored theme. Uses Playwright's pinned Chromium
 * (`npx playwright install chromium` once).
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const APP = process.env.CHROMACONSCIOUS_URL ?? 'http://localhost:5199'
const LIVE = 'https://drewkidwell.com'
const OUT = 'docs/images'
// The Coastal starter preset, as stored by the live API.
const THEME = 't_m67ew7r47gdw'

const shots = [
  { file: 'app-dark.png', hash: `#${THEME}` },
  { file: 'compare-deutan.png', hash: `#${THEME}&vision=deutan&strength=100` },
  { file: 'analytics-light.png', hash: `#${THEME}`, mockup: 'analytics', light: true },
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()

for (const shot of shots) {
  // A fresh page each time: a hash-only goto would not re-open the link.
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  })
  await page.route('**/api/chromaconscious/**', async (route) => {
    const url = new URL(route.request().url())
    route.fulfill({ response: await route.fetch({ url: LIVE + url.pathname + url.search }) })
  })
  await page.goto(APP + '/' + shot.hash)
  await page.locator('.role-board').waitFor()
  if (shot.mockup) await page.locator('.frame-mockup').first().selectOption(shot.mockup)
  if (shot.light) await page.getByRole('button', { name: 'switch frame A to light' }).click()
  await page.locator('.preview-root').first().waitFor()
  // Park the pointer off the stage and let fonts, loads and fades settle.
  await page.mouse.move(0, 0)
  await page.getByText(/^opened t_/).waitFor({ state: 'hidden', timeout: 10_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${shot.file}` })
  console.log(`${OUT}/${shot.file}`)
  await page.close()
}

await browser.close()
