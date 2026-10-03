import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Riff motion: the shipped column cross-fades to each hop while locked seats
 * hold still, the trail jumps to any hop it shows, and reduced motion snaps.
 */

const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)
const riffBtn = (page: Page) => page.locator('.ctl-row .ctl[title^="riff"]')
const backBtn = (page: Page) => page.locator('.ctl-row .ctl[title^="back one riff"], .ctl-row .ctl[title^="no hops"]')
const shipped = (page: Page, role: string) => seat(page, role).locator('.rb-body .rb-hex')
const bg = (page: Page, role: string) =>
  seat(page, role).locator('.rb-body').evaluate((el) => getComputedStyle(el).backgroundColor)

async function boot(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.role-board')).toBeVisible()
  await page.mouse.move(900, 6)
}

test('the trail shows every hop walked, and a column jumps there — hop 0 included', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page)
  await expect(page.locator('.trail')).toHaveCount(0)
  const at: string[] = [(await shipped(page, 'primary').textContent())!]
  for (let i = 1; i <= 3; i++) {
    await riffBtn(page).click()
    await expect(page.locator('.ctl-hop')).toHaveText(String(i))
    at.push((await shipped(page, 'primary').textContent())!)
  }
  const cols = page.locator('.trail .hopcol')
  await expect(cols).toHaveCount(4)
  await expect(page.locator('.hopcol.cur')).toHaveAttribute('data-hop', '3')
  // a column's own colours are the colours a jump lands on
  await expect(page.locator('.hopcol[data-hop="1"]')).toHaveAttribute('title', new RegExp(`primary ${at[1]}`))

  await page.locator('.hopcol[data-hop="1"]').click()
  await expect(page.locator('.ctl-hop')).toHaveText('1')
  await expect(shipped(page, 'primary')).toHaveText(at[1])
  // hops ahead stay on the trail, dimmed, and still jump
  await expect(cols).toHaveCount(4)
  await expect(page.locator('.hopcol[data-hop="3"]')).toHaveClass(/ahead/)
  // back still works from a jump
  await backBtn(page).click()
  await expect(page.locator('.ctl-hop')).toHaveCount(0)
  await expect(shipped(page, 'primary')).toHaveText(at[0])
  await page.locator('.hopcol[data-hop="3"]').click()
  await expect(shipped(page, 'primary')).toHaveText(at[3])
  await page.locator('.hopcol[data-hop="0"]').click()
  await expect(shipped(page, 'primary')).toHaveText(at[0])
  await expect(backBtn(page)).toBeDisabled()
})

test('past ten hops the older ones fold into "+N", which jumps home', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page)
  const home = await shipped(page, 'primary').textContent()
  for (let i = 0; i < 12; i++) await riffBtn(page).click()
  await expect(page.locator('.ctl-hop')).toHaveText('12')
  await expect(page.locator('.trail .hopcol')).toHaveCount(10)
  await expect(page.locator('.trail-more')).toHaveText('+3')
  await page.locator('.trail-more').click()
  await expect(shipped(page, 'primary')).toHaveText(home!)
})

test('riff cross-fades what moves; a locked seat does not change at any point of it', async ({ page }) => {
  await boot(page)
  await seat(page, 'accent').locator('.rb-lock').click()
  const lockedBg = await bg(page, 'accent')
  const lockedHex = await shipped(page, 'accent').textContent()
  const inputBefore = await seat(page, 'primary').locator('.rb-in').textContent()
  const primaryBefore = await bg(page, 'primary')

  await riffBtn(page).click()
  // mid-animation: the moving seat has its incoming layer part-way in…
  const layer = seat(page, 'primary').locator('.rb-body .fc-in')
  await expect(layer).toHaveCount(1)
  await page.waitForTimeout(120) // ~a quarter of the 420ms fade
  const mid = await layer.evaluate((el) => +getComputedStyle(el).opacity)
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(1)
  // …painted over the colour it is leaving, which the chip still shows
  expect(await bg(page, 'primary')).toBe(primaryBefore)
  // the locked seat: no layer, same computed colour, same hex
  await expect(seat(page, 'accent').locator('.fc-in, .fc-out')).toHaveCount(0)
  expect(await bg(page, 'accent')).toBe(lockedBg)
  await expect(shipped(page, 'accent')).toHaveText(lockedHex!)
  // inputs never move on a riff
  await expect(seat(page, 'primary').locator('.rb-in')).toHaveText(inputBefore!)

  // and when it lands, the layer is gone and the chip is the new colour
  await expect(seat(page, 'primary').locator('.is-fading')).toHaveCount(0)
  expect(await bg(page, 'primary')).not.toBe(primaryBefore)
  expect(await bg(page, 'accent')).toBe(lockedBg)
})

test('under reduced motion a riff snaps: no layers, the new colour at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page)
  const before = await bg(page, 'primary')
  await riffBtn(page).click()
  await expect(page.locator('.ctl-hop')).toHaveText('1')
  // read in the same task as the click lands: nothing is fading, anywhere
  const now = await page.evaluate(() => ({
    layers: document.querySelectorAll('.fc-in, .fc-out, .is-fading').length,
    bg: getComputedStyle(document.querySelector('.rb-slot[data-role="primary"] .rb-body')!).backgroundColor,
  }))
  expect(now.layers).toBe(0)
  expect(now.bg).not.toBe(before)
})

test('taste moves the middle cells live: "=" opens into an arrow as ΔE grows', async ({ page }) => {
  await boot(page)
  const cell = seat(page, 'primary').locator('.dc')
  const len = () => cell.evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--len')))
  await page.locator('.dial-slider').fill('1')
  // as typed: the engine leaves it alone, and the glyph is "="
  await expect(cell).toHaveAttribute('data-kind', 'same')
  await page.locator('.dial-slider').fill('0.5')
  await expect(cell).toHaveAttribute('data-kind', 'moved')
  const mid = await len()
  await page.locator('.dial-slider').fill('0')
  await expect(cell).toHaveAttribute('data-kind', 'moved')
  // pulled harder toward its role: the same element, a longer arrow
  expect(await len()).toBeGreaterThan(mid)
})
