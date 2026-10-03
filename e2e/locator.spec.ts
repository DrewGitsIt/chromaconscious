import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** One labelled seat on the board. */
const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)

/**
 * Match a seat by the colour it CAME FROM. A seat's chip shows the seed the
 * engine resolved, which below fidelity 1 is not the string you typed; the
 * input is disclosed in the body tooltip as "from #…".
 */
const seatFrom = (page: Page, role: string, hex: string) =>
  expect(seat(page, role).locator('.rb-body')).toHaveAttribute('title', new RegExp(hex))

const bootPicnic = async (page: Page) => {
  await page.getByRole('button', { name: 'Pastel picnic' }).click()
  await seatFrom(page, 'accent', '#a0c4ff')
}

const rgbOf = async (page: Page, selector: string, prop = 'color') =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

/** Rough chroma proxy: max channel spread of an rgb() string. */
const spread = (rgb: string) => {
  const m = rgb.match(/\d+/g)!.map(Number)
  return Math.max(...m.slice(0, 3)) - Math.min(...m.slice(0, 3))
}

const newProjectBg = (page: Page) =>
  page
    .locator('.preview-root button', { hasText: 'New project' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)

test.describe('color locator', () => {
  test('hovering the accent seat keeps links lit and grays the primary button', async ({ page }) => {
    await bootPicnic(page)
    // `.banner-action` is the link-colored element on the landing view (the
    // project table now lives a page over); like `.project-link` it descends
    // from the accent, so it is what must stay lit while the rest grays.
    const linkBefore = await rgbOf(page, '.banner-action')
    await seat(page, 'accent').hover()
    await page.waitForTimeout(300) // locate enter debounce is 150ms
    // accent descendants stay verbatim
    expect(await rgbOf(page, '.banner-action')).toBe(linkBefore)
    // primary-derived button goes near-gray
    expect(spread(await newProjectBg(page))).toBeLessThanOrEqual(8)
  })

  test('leaving the board restores the mockup', async ({ page }) => {
    await bootPicnic(page)
    await seat(page, 'accent').hover()
    await page.waitForTimeout(300)
    expect(spread(await newProjectBg(page))).toBeLessThanOrEqual(8)
    // moving off the board restores full color
    await page.locator('.stage').hover({ position: { x: 400, y: 300 } })
    await page.waitForTimeout(300)
    expect(spread(await newProjectBg(page))).toBeGreaterThan(8)
  })

  /**
   * This used to assert the opposite — that a derived seat located nothing,
   * "because there is no color of yours behind it". That reasoned about
   * provenance when the question is about USE: a derived neutral still owns
   * the backgrounds, the text and the borders, which is most of the frame.
   * Locate is now keyed on the role rather than on a candidate, so it answers
   * for derived seats too.
   */
  test('hovering a DERIVED seat locates it — provenance is not the question', async ({ page }) => {
    await bootPicnic(page)
    const neutral = seat(page, 'neutral')
    await expect(neutral).toHaveClass(/\brb-derived\b/)
    // the page background descends from the neutral, so it must stay verbatim
    const bgBefore = await rgbOf(page, '.preview-root', 'background-color')
    await neutral.hover()
    await page.waitForTimeout(300)
    expect(await rgbOf(page, '.preview-root', 'background-color')).toBe(bgBefore)
    // ...while the primary-derived button, which is not the neutral's, grays out
    expect(spread(await newProjectBg(page))).toBeLessThanOrEqual(8)
  })
})
