import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectHonest, setMode, textOnSurfaces } from './showcase'

/**
 * The magazine is print: no controls to prove real. What it promises is
 * honesty, so that is what these check, in the real browser where layout and
 * computed colour exist:
 *
 * - every piece of text sits on a surface whose pair the contrast report
 *   checks (engine/tokens.ts TEXT_PAIRS), and never on a photograph;
 * - every photograph is mapped through tokens, so it follows the theme, the
 *   mode and locate mode;
 * - corners and face follow the theme.
 */

const boot = async (page: Page, preset = 'Terracotta') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption('magazine')
  await expect(page.locator('.mag-spread')).toHaveCount(5)
}

/** One photograph's filter: the stops it names, and its R channel's table. */
const filterOf = (page: Page, n: number) =>
  page
    .locator('.mag filter')
    .nth(n)
    .evaluate((f) => ({
      stops: f.getAttribute('data-stops')!.split(' '),
      red: f.querySelector('feFuncR[type="table"]')!.getAttribute('tableValues')!,
    }))

test.describe('magazine mockup', () => {
  for (const [preset, mode] of [
    ['Terracotta', 'light'],
    ['Neon arcade', 'dark'],
    ['Ink & sky', 'light'],
  ] as const) {
    test(`${preset} ${mode}: every text sits on a checked pair, never on a photograph`, async ({ page }) => {
      await boot(page, preset)
      await setMode(page, mode)
      expectHonest(await textOnSurfaces(page, '.mag'), 60)
    })
  }

  test('every photograph is mapped through tokens, and locate mode dims it', async ({ page }) => {
    await boot(page)
    await setMode(page, 'light')
    const count = await page.locator('.mag filter').count()
    expect(count).toBe(6)
    // the stops are token names, and their channels are the tokens' own
    const cover = await filterOf(page, 0)
    expect(cover.stops).toEqual(['foreground', 'primary', 'background'])
    const red = await page
      .locator('.preview-root')
      .first()
      .evaluate((el, stops) => stops.map((t) => parseInt(getComputedStyle(el).getPropertyValue(`--${t}`).trim().slice(1, 3), 16) / 255), cover.stops)
    expect(cover.red.split(' ').map(Number)).toEqual(red.map((v) => Number(v.toFixed(4))))

    // locate the accent: the cover's primary stop is not the accent's, so it dims
    await page.locator('.rb-slot[data-role="accent"]').hover()
    await expect.poll(async () => (await filterOf(page, 0)).red).not.toBe(cover.red)
    await page.mouse.move(0, 0)
    await expect.poll(async () => (await filterOf(page, 0)).red).toBe(cover.red)
  })

  test('a dark theme never prints a photograph as a negative', async ({ page }) => {
    await boot(page)
    await setMode(page, 'dark')
    await expect.poll(async () => {
      const t = (await filterOf(page, 0)).red.split(' ').map(Number)
      return t[0] <= t[t.length - 1]
    }).toBe(true)
  })

  test('corners and face follow the theme; the masthead fills its page in any face', async ({ page }) => {
    await boot(page)
    await page.getByRole('slider', { name: 'corners' }).fill('0')
    const radius = () => page.locator('.mag-plate').first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
    await expect.poll(radius).toBe('0px')

    const fill = () =>
      page.locator('.mag-mast').first().evaluate((el) => {
        const page = el.parentElement!
        const room = page.clientWidth - 2 * parseFloat(getComputedStyle(page).paddingLeft)
        return Math.abs(el.scrollWidth - room) / room
      })
    expect(await fill()).toBeLessThan(0.02)
    await page.locator('.pg-font').click()
    await page.getByRole('option', { name: /Barlow Condensed/ }).click()
    await expect
      .poll(() => page.locator('.mag-mast').first().evaluate((el) => getComputedStyle(el).fontFamily))
      .toMatch(/^"?Barlow Condensed/)
    await expect.poll(fill).toBeLessThan(0.02)
  })
})
