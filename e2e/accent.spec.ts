import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/** Boot past the hero into the pastel-picnic theme — the "where is my blue" palette. */
const bootPastel = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pastel picnic' }).click()
  await expect(page.locator('.preview-root')).toBeVisible()
}

/** Read an engine-generated CSS variable off the preview root (hex string). */
const previewVar = (page: Page, name: string) =>
  page
    .locator('.preview-root')
    .first()
    .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)

/** #rrggbb -> the rgb(r, g, b) string computed styles report. */
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const computed = (page: Page, selector: string, prop: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

test.describe('accent jobs in the app dashboard', () => {
  test('project links render in the solved accent link color', async ({ page }) => {
    await bootPastel(page)
    const link = await previewVar(page, '--link')
    expect(link).toMatch(/^#[0-9a-f]{6}$/)
    const anchor = page.locator('.preview-root .project-link').first()
    await expect(anchor).toBeVisible()
    expect(await computed(page, '.preview-root .project-link', 'color')).toBe(hexToRgb(link))
    // and it is genuinely a link treatment, not body text
    const fg = await previewVar(page, '--foreground')
    expect(link).not.toBe(fg)
    expect(await computed(page, '.preview-root .project-link', 'text-decoration-line')).toBe(
      'underline',
    )
  })

  test('the success banner carries a link-styled inline action', async ({ page }) => {
    await bootPastel(page)
    const link = await previewVar(page, '--link')
    const action = page.locator('.preview-root .banner-action')
    await expect(action).toHaveText('View report')
    expect(await computed(page, '.preview-root .banner-action', 'color')).toBe(hexToRgb(link))
  })

  test('the selected tab wears an accent-strong indicator that follows selection', async ({
    page,
  }) => {
    await bootPastel(page)
    const strong = await previewVar(page, '--accent-strong')
    const indicator = page.locator('.preview-root .tab-accent-indicator')
    await expect(indicator).toHaveCount(1)
    expect(await computed(page, '.preview-root .tab-accent-indicator', 'background-color')).toBe(
      hexToRgb(strong),
    )
    // selection moves, the accent voice moves with it
    await page.locator('.preview-root').getByRole('tab', { name: 'Alerts' }).click()
    await expect(page.locator('.preview-root [data-active] .tab-accent-indicator')).toBeVisible()
    await expect(indicator).toHaveCount(1)
  })

  test('the Export button is accent-outlined: accent border, link text, transparent fill', async ({
    page,
  }) => {
    await bootPastel(page)
    const strong = await previewVar(page, '--accent-strong')
    const link = await previewVar(page, '--link')
    const button = page.locator('.preview-root button', { hasText: 'Export' })
    await expect(button).toBeVisible()
    const sel = '.preview-root button:has-text("Export")'
    expect(await computed(page, sel, 'border-top-color')).toBe(hexToRgb(strong))
    expect(await computed(page, sel, 'color')).toBe(hexToRgb(link))
    expect(await computed(page, sel, 'background-color')).toBe('rgba(0, 0, 0, 0)')
  })

  test('dark mode re-solves the accent jobs against the dark surfaces', async ({ page }) => {
    await bootPastel(page)
    const lightLink = await previewVar(page, '--link')
    await page.getByRole('button', { name: 'switch A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
    const darkLink = await previewVar(page, '--link')
    const darkStrong = await previewVar(page, '--accent-strong')
    expect(darkLink).not.toBe(lightLink)
    expect(await computed(page, '.preview-root .project-link', 'color')).toBe(hexToRgb(darkLink))
    expect(await computed(page, '.preview-root .tab-accent-indicator', 'background-color')).toBe(
      hexToRgb(darkStrong),
    )
  })
})
