import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * A new flow opens on colors, with tuning and riff folded below (the guided
 * flow, guided-flow.spec.ts). Specs about what lives in those sections open
 * them first, the way a person would: by the header.
 */
export async function openSection(page: Page, id: 'tuning' | 'riff' | 'colors') {
  const head = page.locator(`[data-sec="${id}"] .sec-toggle`)
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'true')
}

/** Every section open: the pane as it was before sections folded on arrival. */
export async function openAll(page: Page) {
  await openSection(page, 'tuning')
  await openSection(page, 'riff')
}

/**
 * The pane slides in with a theme (420ms). Anything that measures the pane
 * and then acts at those coordinates (a drag, a hover) waits for it to land.
 */
export async function paneSettled(page: Page) {
  await expect
    .poll(() => page.locator('.sidebar-shell').evaluate((e) => Math.round(e.getBoundingClientRect().left)))
    .toBe(0)
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  )
}
