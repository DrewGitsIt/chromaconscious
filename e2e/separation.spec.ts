import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Separation is the border↔shadow balance. The control itself is easy to make
 * look right and easy to leave inert, so nothing here asserts on the control's
 * own appearance alone: every case reads a generated token back off
 * `.preview-root` and checks the ENGINE moved.
 *
 * The headline case is `lifted` in light mode, where the card ends up lighter
 * than the page — an inversion of the engine's usual order, and the reason the
 * setting is visible at all.
 */

const boot = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await expect(page.locator('.sep-seg')).toBeVisible()
}

/** Read an engine-generated CSS variable off a frame's preview root. */
const previewVar = (page: Page, name: string, frame = 0) =>
  page
    .locator('.preview-root')
    .nth(frame)
    .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)

/** OKLab-ish lightness is overkill here; sRGB relative luminance orders these
    two near-neutral surfaces the same way and needs no engine import. */
const luminance = async (page: Page, name: string, frame = 0) => {
  const hex = await previewVar(page, name, frame)
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

const choose = async (page: Page, s: 'flat' | 'layered' | 'lifted') => {
  await page.locator(`.sep-opt[data-sep="${s}"]`).click()
  await expect(page.locator(`.sep-opt[data-sep="${s}"]`)).toHaveAttribute('aria-checked', 'true')
}

test.describe('separation moves the surface ladder, not just the control', () => {
  test('layered is the zero point and lifted floats the card above the page', async ({ page }) => {
    await boot(page)

    // untouched: the engine's historical order — the card sits under the page
    await expect(page.locator('.sep-opt[data-sep="layered"]')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    const before = {
      card: await previewVar(page, '--card'),
      bg: await previewVar(page, '--background'),
      cardL: await luminance(page, '--card'),
      bgL: await luminance(page, '--background'),
    }
    expect(before.cardL).toBeLessThan(before.bgL)

    await choose(page, 'lifted')

    // the theme genuinely re-solved: both surfaces are different values now
    expect(await previewVar(page, '--card')).not.toBe(before.card)
    expect(await previewVar(page, '--background')).not.toBe(before.bg)
    // ...and the order inverted. This is the whole point of the setting.
    expect(await luminance(page, '--card')).toBeGreaterThan(
      await luminance(page, '--background'),
    )
    // the page is the half that receded
    expect(await luminance(page, '--background')).toBeLessThan(before.bgL)

    // and back again restores the zero point exactly
    await choose(page, 'layered')
    expect(await previewVar(page, '--card')).toBe(before.card)
    expect(await previewVar(page, '--background')).toBe(before.bg)
  })

  test('flat converges the surfaces and takes the resting shadow away', async ({ page }) => {
    await boot(page)
    expect(await previewVar(page, '--elevation-1')).not.toBe('0 0 #0000')
    const spread = Math.abs(
      (await luminance(page, '--card')) - (await luminance(page, '--background')),
    )

    await choose(page, 'flat')

    expect(
      Math.abs((await luminance(page, '--card')) - (await luminance(page, '--background'))),
    ).toBeLessThan(spread / 2)
    // the separation is paid for in hairlines instead — no level-1 shadow at all
    expect(await previewVar(page, '--elevation-1')).toBe('0 0 #0000')
    // higher levels survive: a modal still floats in every setting
    expect(await previewVar(page, '--elevation-3')).not.toBe('0 0 #0000')
  })

  test('the hairline trades against the shadow, in both directions', async ({ page }) => {
    await boot(page)
    await choose(page, 'flat')
    const flatBorder = await luminance(page, '--border')
    await choose(page, 'lifted')
    const liftedBorder = await luminance(page, '--border')
    // light mode: a stronger hairline is a darker one
    expect(flatBorder).toBeLessThan(liftedBorder)
  })

  test('dark mode gets its own solve, with the border signs flipped', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()

    const layeredBg = await previewVar(page, '--background')
    await choose(page, 'flat')
    const flatBorder = await luminance(page, '--border')
    // Dark mode converges from the other side: there is no room to bring the
    // card down onto a near-black page, so the PAGE rises to meet the card.
    expect(await previewVar(page, '--background')).not.toBe(layeredBg)
    expect(await luminance(page, '--background')).toBeGreaterThan(await luminance(page, '--card') - 0.002)
    expect(
      Math.abs((await luminance(page, '--card')) - (await luminance(page, '--background'))),
    ).toBeLessThan(0.004)

    await choose(page, 'lifted')
    // in dark a stronger hairline is a LIGHTER one, so the comparison inverts
    expect(flatBorder).toBeGreaterThan(await luminance(page, '--border'))
  })

  test('the segmented control is keyboard operable', async ({ page }) => {
    await boot(page)
    const layered = page.locator('.sep-opt[data-sep="layered"]')
    // roving tabindex: only the setting in force is a tab stop
    await expect(layered).toHaveAttribute('tabindex', '0')
    await expect(page.locator('.sep-opt[data-sep="flat"]')).toHaveAttribute('tabindex', '-1')

    await layered.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.sep-opt[data-sep="lifted"]')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.locator('.sep-opt[data-sep="lifted"]')).toBeFocused()
    // the keyboard drives the engine, not just the highlight
    expect(await luminance(page, '--card')).toBeGreaterThan(
      await luminance(page, '--background'),
    )

    await page.keyboard.press('Home')
    await expect(page.locator('.sep-opt[data-sep="flat"]')).toHaveAttribute('aria-checked', 'true')
    expect(await previewVar(page, '--elevation-1')).toBe('0 0 #0000')
  })

  test('hovering a setting previews its sentence without applying it', async ({ page }) => {
    await boot(page)
    const caption = page.locator('.sep-caption')
    await expect(caption).toHaveText(/hairline and shadow sharing the work/)
    const card = await previewVar(page, '--card')

    await page.locator('.sep-opt[data-sep="lifted"]').hover()
    await expect(caption).toHaveText(/the card floats above it/)
    await expect(page.locator('.sep-opt[data-sep="layered"]')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(await previewVar(page, '--card')).toBe(card)

    await page.locator('.sb-head').hover()
    await expect(caption).toHaveText(/hairline and shadow sharing the work/)
  })

  test('reduced motion kills the thumb travel — the override is unlayered', async ({ page }) => {
    // The repo's documented trap: the duration tokens are declared unlayered,
    // so a `prefers-reduced-motion` override written inside @layer chrome would
    // silently lose. This asserts the real computed value, not the source.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await boot(page)
    const thumb = page.locator('.sep-thumb')
    await expect(thumb).toHaveCSS('transition-duration', '0s')
    await expect(page.locator('.sep-caption span')).toHaveCSS('animation-name', 'none')
    // still fully functional without the motion
    await choose(page, 'lifted')
    expect(await luminance(page, '--card')).toBeGreaterThan(
      await luminance(page, '--background'),
    )
  })

  test('it belongs to the frame, so split view can hold two settings at once', async ({ page }) => {
    await boot(page)
    await page.locator('.sec-act .mini[title*="compare two frames"]').click()
    await expect(page.locator('.preview-root')).toHaveCount(2)

    // B is the active frame after compare
    await choose(page, 'lifted')
    expect(await luminance(page, '--card', 1)).toBeGreaterThan(
      await luminance(page, '--background', 1),
    )
    // A is untouched — still the engine's usual order
    expect(await luminance(page, '--card', 0)).toBeLessThan(
      await luminance(page, '--background', 0),
    )

    // selecting A back shows A's own setting, not B's
    await page.getByRole('button', { name: 'edit frame A' }).click()
    await expect(page.locator('.sep-opt[data-sep="layered"]')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await choose(page, 'flat')
    expect(await previewVar(page, '--elevation-1', 0)).toBe('0 0 #0000')
    // ...and B kept lifted through all of it
    expect(await previewVar(page, '--elevation-1', 1)).not.toBe('0 0 #0000')
  })
})
