import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Page settings (corners, type) are preview-only view state. The trap they
 * exist to avoid is the portal: a menu or dialog mounts on <body>, outside
 * the frame, so a setting injected only on the frame would stop at its edge.
 * So every check here reads a card in the frame AND a portalled menu.
 */

const boot = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
}

const card = (page: Page) => page.locator('.preview-root [data-slot="card"]').first()
const cardTitle = (page: Page) => page.locator('.preview-root [data-slot="card-title"]').first()
const menu = (page: Page) => page.locator('[data-slot="dropdown-menu-content"]').first()
type Prop = 'borderTopLeftRadius' | 'fontFamily' | 'fontWeight'
const css = (loc: Locator, prop: Prop) =>
  loc.evaluate((el, p) => getComputedStyle(el)[p as Prop], prop)

const openMenu = async (page: Page) => {
  await page.locator('.act-export').first().click()
  await expect(menu(page)).toBeVisible()
}
const closeMenu = async (page: Page) => {
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
}

const corners = (page: Page) => page.getByRole('slider', { name: 'corners' })
const typeTrigger = (page: Page) => page.locator('.pg-font')

test.describe('page settings', () => {
  test('the defaults are today\'s look: shadcn radius, system body, Geist titles', async ({ page }) => {
    await boot(page)
    await expect(page.locator('.pg-head')).toContainText('preview only · rides the share link · not exported')
    await expect(corners(page)).toHaveValue('10')
    await expect(page.locator('.pg-value')).toHaveText('10px')
    await expect(typeTrigger(page)).toContainText('System UI')

    // rounded-xl = --radius × 1.4 = 14px; the menu's rounded-lg = --radius = 10px
    expect(await css(card(page), 'borderTopLeftRadius')).toBe('14px')
    expect(await css(page.locator('.preview-root').first(), 'fontFamily')).toMatch(/^ui-sans-serif/)
    expect(await css(cardTitle(page), 'fontFamily')).toMatch(/^"Geist Variable"/)
    await openMenu(page)
    expect(await css(menu(page), 'borderTopLeftRadius')).toBe('10px')
  })

  test('corners reach a card in the frame and a portalled menu alike', async ({ page }) => {
    await boot(page)

    await corners(page).fill('0')
    await expect(page.locator('.pg-value')).toHaveText('0px')
    expect(await css(card(page), 'borderTopLeftRadius')).toBe('0px')
    await openMenu(page)
    expect(await css(menu(page), 'borderTopLeftRadius')).toBe('0px')
    await closeMenu(page)
    expect(await css(page.locator('.preview-root [class*="rounded-t-[min"]').first(), 'borderTopLeftRadius')).toBe('0px')

    await corners(page).fill('20')
    await expect(page.locator('.pg-value')).toHaveText('20px')
    expect(await css(card(page), 'borderTopLeftRadius')).toBe('28px')
    await openMenu(page)
    expect(await css(menu(page), 'borderTopLeftRadius')).toBe('20px')
    await closeMenu(page)

    // chart bars follow down to sharp but are capped at today's 6px, so a
    // short bar never turns into a half-circle hill
    const bar = page.locator('.preview-root [class*="rounded-t-[min"]').first()
    expect(await css(bar, 'borderTopLeftRadius')).toBe('6px')

    // the old hardcoded radii scale too: the checkbox was rounded-[4px]
    await page.locator('.preview-root .nav-item:nth-child(2)').click()
    const box = page.getByRole('checkbox', { name: 'Select every project in view' })
    expect(await css(box, 'borderTopLeftRadius')).toBe('8px')

    // the chrome is not the preview: the sidebar's own corners never move
    expect(await css(typeTrigger(page), 'borderTopLeftRadius')).toBe('8px')
  })

  test('a font is self-hosted, lazy, and reaches body, titles and portals', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await boot(page)
    expect(requests.some((u) => /tinos/i.test(u))).toBe(false)

    await typeTrigger(page).click()
    const option = page.getByRole('option', { name: /Tinos/ })
    await expect(option).toBeVisible()
    // each option is set in its own face, from the name-only specimen
    expect(await css(option.locator('.pg-fn'), 'fontFamily')).toMatch(/^"?cc-specimen-tinos/)
    await expect.poll(() => page.evaluate(() => document.fonts.check('16px cc-specimen-tinos'))).toBe(true)
    await option.click()

    await expect(typeTrigger(page)).toContainText('Tinos')
    await expect
      .poll(() => css(page.locator('.preview-root').first(), 'fontFamily'))
      .toMatch(/^Tinos/)
    expect(await css(cardTitle(page), 'fontFamily')).toMatch(/^Tinos/)
    expect(await css(cardTitle(page), 'fontWeight')).toBe('700')
    await openMenu(page)
    expect(await css(menu(page), 'fontFamily')).toMatch(/^Tinos/)
    await expect.poll(() => page.evaluate(() => document.fonts.check('700 16px Tinos'))).toBe(true)

    // fetched from this origin, never from Google
    expect(requests.some((u) => /tinos-latin-400-normal.*\.woff2$/.test(u) && u.startsWith(new URL(page.url()).origin))).toBe(true)
    expect(requests.filter((u) => /googleapis|gstatic/.test(u))).toEqual([])
  })

  test('a link carries the page settings; an unknown font is dropped and the theme still opens', async ({ page }) => {
    await page.route('**/api/chromaconscious/v1/state*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ v: 1, candidates: [{ color: '#e63946' }, { color: '#457b9d' }] }),
      }),
    )
    await page.goto('/#t_abcdefghijkl&radius=0&font=jetbrains-mono')
    await expect(page.locator('.preview-root').first()).toBeVisible()
    await expect(corners(page)).toHaveValue('0')
    await expect(typeTrigger(page)).toContainText('JetBrains Mono')
    expect(await css(card(page), 'borderTopLeftRadius')).toBe('0px')

    await page.goto('about:blank')
    await page.goto('/#t_abcdefghijkl&radius=4&font=comic-sans')
    await expect(page.locator('.preview-root').first()).toBeVisible()
    await expect(corners(page)).toHaveValue('4')
    await expect(typeTrigger(page)).toContainText('System UI')
  })

  test('the brand board says it keeps its own corners and type', async ({ page }) => {
    await boot(page)
    await expect(page.locator('.pg-note')).toHaveCount(0)
    await page.locator('.frame-mockup').first().selectOption('brand')
    await expect(page.locator('.pg-note')).toHaveText('the brand board is print: it keeps its own corners and type')
  })
})
