import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

const bootPicnic = async (page: Page) => {
  await page.getByRole('button', { name: 'Pastel picnic' }).click()
  await expect(page.locator('.candidate-strip')).toContainText('#a0c4ff')
}

const rgbOf = async (page: Page, selector: string, prop = 'color') =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

/** Rough chroma proxy: max channel spread of an rgb() string. */
const spread = (rgb: string) => {
  const m = rgb.match(/\d+/g)!.map(Number)
  return Math.max(...m.slice(0, 3)) - Math.min(...m.slice(0, 3))
}

test.describe('color locator', () => {
  test('hovering the accent row keeps links lit and grays the primary button', async ({ page }) => {
    await bootPicnic(page)
    const linkBefore = await rgbOf(page, '.project-link')
    await page.locator('.candidate-strip li', { hasText: '#a0c4ff' }).hover()
    await page.waitForTimeout(300) // locate enter debounce is 150ms
    // accent descendants stay verbatim
    expect(await rgbOf(page, '.project-link')).toBe(linkBefore)
    // primary-derived button goes near-gray
    const btn = page.locator('.preview-root button', { hasText: 'New project' })
    const btnColor = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(spread(btnColor)).toBeLessThanOrEqual(8)
  })

  test('the hovered row shows its jobs line; leave restores the mockup', async ({ page }) => {
    await bootPicnic(page)
    const row = page.locator('.candidate-strip li', { hasText: '#a0c4ff' })
    await row.hover()
    await expect(row.locator('.jobs-line')).toContainText('links')
    // moving off the strip restores full color
    await page.locator('.stage').hover({ position: { x: 400, y: 300 } })
    await page.waitForTimeout(120)
    const btn = page.locator('.preview-root button', { hasText: 'New project' })
    const btnColor = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(spread(btnColor)).toBeGreaterThan(8)
  })
})
