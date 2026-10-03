/**
 * Pixel-parity net for output-neutral changes (engine speedups, refactors).
 *
 * Record the reference on the commit you trust, then change the code and run
 * again: every screenshot must match exactly.
 *
 *   npx playwright test e2e/visual-parity.spec.ts --update-snapshots   # record
 *   npx playwright test e2e/visual-parity.spec.ts                      # compare
 */
import { expect, test, type Page } from '@playwright/test'
import { PRESETS } from '../src/presets'

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
test.describe.configure({ timeout: 60_000 })

const MOCKUPS = ['app', 'analytics', 'marketing', 'brand']

/**
 * Two nets per checkpoint.
 *
 * 1. EXACT: every inline style under the stage (that is where theme variables
 *    and seat colours are written) plus all sidebar text (hexes, provenance,
 *    check counts). A theme that moves by one hex step fails this.
 * 2. PIXELS: the whole page, for layout. Rasterisation flickers by ±1–2 on a
 *    few dozen anti-aliased pixels between identical runs, so this allows 150
 *    differing pixels; a real colour change repaints thousands.
 *
 * Before either, settle everything that is not the theme: park the pointer on
 * bare stage (a hover state is not output), let riff's bounce, the analytics
 * cold load and every finite animation finish, and reset every scroller. The screenshot goes first: it waits for two identical
 * frames, so the DOM read after it sees a fully rendered mockup.
 */
async function shot(page: Page, name: string) {
  await page.mouse.move(900, 6)
  await expect(page.locator('.is-fading')).toHaveCount(0)
  // The analytics mockup plays a scripted cold load, and the chrome's entrance
  // motion is driven from script too — neither is reached by Playwright's
  // `animations: 'disabled'`, so wait them out explicitly.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  )
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, 0)
    for (const el of document.querySelectorAll('.sb-body, .frame, .stage, .boards')) el.scrollTo(0, 0)
  })
  await expect(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', maxDiffPixels: 150, threshold: 0 })
  const exact = await page.evaluate(() => {
    const styles = [...document.querySelectorAll('.app [style]')].map(
      (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${el.getAttribute('style')}`,
    )
    const side = (document.querySelector('.sidebar-shell') as HTMLElement | null)?.innerText ?? ''
    return [...styles, '---', side].join('\n')
  })
  expect(exact).toMatchSnapshot(`${name}.txt`)
}

async function boot(page: Page, preset: string) {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.role-board')).toBeVisible()
}

const tool = (page: Page, title: string) => page.locator(`.ctl-row .ctl[title*="${title}"]`)

for (const p of PRESETS) {
  for (const mockup of MOCKUPS) {
    test(`${p.name} · ${mockup} · dark and light`, async ({ page }) => {
      await boot(page, p.name)
      await page.getByLabel('mockup for frame A').selectOption(mockup)
      await shot(page, `${p.name}-${mockup}-dark`)
      await page.getByRole('button', { name: 'switch frame A to light' }).click()
      await shot(page, `${p.name}-${mockup}-light`)
    })
  }
}

for (const preset of ['Coastal starter', 'Neon arcade', 'Mono + ember']) {
  test(`${preset} · riff walk and back`, async ({ page }) => {
    await boot(page, preset)
    for (let i = 1; i <= 3; i++) {
      await tool(page, 'walk the palette').click()
      await shot(page, `${preset}-riff-${i}`)
    }
    await tool(page, 'back one riff').click()
    await shot(page, `${preset}-riff-back`)
  })

  test(`${preset} · taste extremes and separation`, async ({ page }) => {
    await boot(page, preset)
    for (const v of ['0', '1']) {
      await page.locator('.dial-slider').fill(v)
      await shot(page, `${preset}-taste-${v}`)
    }
    await page.locator('.dial-slider').fill('0.5')
    for (const sep of ['flat', 'lifted']) {
      await page.getByRole('radiogroup', { name: 'separation' }).getByRole('radio').nth(sep === 'flat' ? 0 : 2).click()
      await shot(page, `${preset}-sep-${sep}`)
    }
  })

  test(`${preset} · mono lock, seat lock and riff`, async ({ page }) => {
    await boot(page, preset)
    await tool(page, 'lock the theme').click()
    await page.locator('.rb-slot[data-role="primary"] .rb-body').click()
    await expect(page.locator('.rb-anchor')).toBeVisible()
    await shot(page, `${preset}-mono`)
    await tool(page, 'unlock').click()
    await page.locator('.rb-slot[data-role="primary"] .rb-lock').click()
    await tool(page, 'walk the palette').click()
    await tool(page, 'walk the palette').click()
    await shot(page, `${preset}-locked-riff-2`)
  })

  test(`${preset} · assign popover and compare`, async ({ page }) => {
    await boot(page, preset)
    await page.locator('.rb-slot[data-role="danger"] :is(.rb-in, .rb-add)').click()
    await expect(page.locator('.rp-asg')).toBeVisible()
    await shot(page, `${preset}-assign-danger`)
    await page.keyboard.press('Escape')
    await page.locator('.rb-slot[data-role="neutral"] :is(.rb-in, .rb-add)').click()
    await expect(page.locator('.rp-asg')).toBeVisible()
    await shot(page, `${preset}-assign-neutral`)
    await page.keyboard.press('Escape')
    await page.locator('.board-btn[title*="compare two frames"]').click()
    await expect(page.locator('.artboard')).toHaveCount(2)
    await shot(page, `${preset}-compare`)
  })
}
