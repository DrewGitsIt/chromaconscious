import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * The contrast level is easy to leave inert — a slider that redraws its own
 * readout and nothing else looks finished. So this drives the real control
 * and reads generated tokens back off `.preview-root`, measuring WCAG ratios
 * on pairs the mockup actually paints, in both modes.
 */

const previewVar = (page: Page, name: string) =>
  page
    .locator('.preview-root')
    .first()
    .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const pair = async (page: Page, fg: string, bg: string) =>
  ratio(await previewVar(page, fg), await previewVar(page, bg))

const PAIRS: Array<[string, string]> = [
  ['--muted-foreground', '--muted'],
  ['--primary-foreground', '--primary'],
  ['--border', '--background'],
]

test('the contrast slider raises measured contrast on real token pairs, in both modes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()

  const slider = page.getByRole('slider', { name: 'contrast' })
  await expect(slider).toHaveValue('0')
  await expect(page.locator('.ctr-ratio')).toHaveText('4.5:1')
  await expect(page.locator('.ctr-lc')).toHaveText('Lc 62')

  // The Lc explanation reaches the keyboard, not just a hovering pointer.
  const tip = page.getByRole('tooltip')
  await expect(tip).toBeHidden()
  await slider.focus()
  await page.keyboard.press('Shift+Tab') // back from the slider lands on the Lc
  await expect(page.locator('.ctr-lc')).toBeFocused()
  await expect(tip).toBeVisible()
  await expect(page.locator('.ctr-lc')).toHaveAccessibleDescription(/^APCA lightness contrast: the engine aims for this/)
  await page.locator('.ctr-lc').blur()

  for (const mode of ['dark', 'light'] as const) {
    if (mode === 'light') {
      await slider.fill('0')
      await page.getByRole('button', { name: 'switch frame A to light' }).click()
    }
    const before = await Promise.all(PAIRS.map(([fg, bg]) => pair(page, fg, bg)))

    await slider.fill('1')
    await expect(page.locator('.ctr-ratio')).toHaveText('10:1')
    await expect(page.locator('.ctr-lc')).toHaveText('Lc 88')
    await expect(page.locator('.ctr-caption')).toContainText('every text pair clears 10:1 · Lc 88')
    await expect(slider).toHaveAttribute('aria-valuetext', /^high/)
    // The status chip is the sidebar's verdict on the same report.
    await expect(page.locator('.status-chip')).toContainText('all 48 checks pass')

    const after = await Promise.all(PAIRS.map(([fg, bg]) => pair(page, fg, bg)))
    for (let i = 0; i < PAIRS.length; i++)
      expect(after[i], `${mode} ${PAIRS[i].join(' on ')}`).toBeGreaterThan(before[i] + 0.25)
    // …and they meet what the readout promised.
    expect(after[0], `${mode} muted text`).toBeGreaterThanOrEqual(10)
    expect(after[1], `${mode} text on primary`).toBeGreaterThanOrEqual(10)
    expect(after[2], `${mode} border`).toBeGreaterThanOrEqual(3)
  }
})
