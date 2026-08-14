import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/** Boot from a single typed color — it takes primary, the smith derives the rest. */
const bootSingle = async (page: Page) => {
  await page.goto('/')
  await page.getByPlaceholder(/or type/).fill('#7c3aed')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.preview-root')).toBeVisible()
}

/**
 * Boot a set big enough to fill all six seats AND all five chart slots, so the
 * engine has nothing left to derive — the one state where riff has no work.
 */
const bootFullBoard = async (page: Page) => {
  await page.goto('/')
  await page
    .getByPlaceholder(/or type/)
    .fill('#e63946 #457b9d #f1faee #ef4444 #22c55e #eab308 #3b82f6 #a855f7 #14b8a6 #ec4899 #84cc16')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.preview-root')).toBeVisible()
}

/** The section-header tools are icon-only buttons; they're addressed by title. */
const tool = (page: Page, title: string) => page.locator(`.sec-act .mini[title*="${title}"]`)

/** One seat on the board. */
const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)

/** The whole board as `role=hex/provenance` strings — one comparable snapshot. */
const board = (page: Page) =>
  page.locator('.rb-slot').evaluateAll((els) =>
    els.map(
      (el) =>
        `${el.getAttribute('data-role')}=${el.querySelector('.rb-hex')?.textContent}/${el.querySelector('.rb-tag')?.textContent}`,
    ),
  )

/** Just the seats riff is allowed to touch. */
const derivedSeats = async (page: Page) => (await board(page)).filter((s) => s.endsWith('/derived'))
/** Everything riff must leave alone: what you supplied, and what you kept. */
const frozenSeats = async (page: Page) => (await board(page)).filter((s) => !s.endsWith('/derived'))

/** The mockup's synthesized-derived CSS variables, as one comparable string. */
const inventedVars = (page: Page) =>
  page
    .locator('.preview-root')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return ['--destructive', '--success', '--warning', '--accent', '--secondary']
        .map((v) => `${v}:${s.getPropertyValue(v).trim()}`)
        .join(' ')
    })

test.describe('riff', () => {
  test('riff re-rolls only the derived seats; back restores them', async ({ page }) => {
    await bootSingle(page)
    const canonical = await inventedVars(page)
    const boardBefore = await board(page)
    const derivedBefore = await derivedSeats(page)
    const frozenBefore = await frozenSeats(page)
    expect(derivedBefore.length).toBe(5)
    expect(frozenBefore).toEqual(['primary=#7c3aed/yours'])

    await tool(page, 're-roll').click()
    await expect(tool(page, 're-roll')).toHaveText('1')
    // the seats the smith owns move…
    expect(await derivedSeats(page)).not.toEqual(derivedBefore)
    // …and the one you supplied is byte-identical, hex and provenance both
    expect(await frozenSeats(page)).toEqual(frozenBefore)
    expect(await inventedVars(page)).not.toBe(canonical)

    // back is the undo: seed 0 is bit-identical to the pre-riff theme
    await tool(page, 'back one riff').click()
    await expect(tool(page, 'back one riff')).toHaveCount(0)
    expect(await board(page)).toEqual(boardBefore)
    expect(await inventedVars(page)).toBe(canonical)
  })

  test('the pin keeps a derived seat without changing its color', async ({ page }) => {
    await bootSingle(page)
    const warning = seat(page, 'warning')
    await expect(warning.locator('.rb-tag')).toHaveText('derived')
    const kept = await warning.locator('.rb-hex').textContent()

    await warning.locator('.rb-keep').click()
    // the color does not move — only who owns it
    await expect(warning.locator('.rb-hex')).toHaveText(kept!)
    await expect(warning.locator('.rb-tag')).toHaveText('kept')
    // a kept seat has nothing left to pin
    await expect(warning.locator('.rb-keep')).toHaveCount(0)
  })

  test('a kept seat survives every later riff', async ({ page }) => {
    await bootSingle(page)
    await seat(page, 'warning').locator('.rb-keep').click()
    const kept = await seat(page, 'warning').locator('.rb-hex').textContent()
    const frozenBefore = await frozenSeats(page)

    for (const n of ['1', '2']) {
      const derivedBefore = await derivedSeats(page)
      await tool(page, 're-roll').click()
      await expect(tool(page, 're-roll')).toHaveText(n)
      // riff really did something, so "unchanged" below means something
      expect(await derivedSeats(page)).not.toEqual(derivedBefore)
      await expect(seat(page, 'warning').locator('.rb-hex')).toHaveText(kept!)
      await expect(seat(page, 'warning').locator('.rb-tag')).toHaveText('kept')
    }
    expect(await frozenSeats(page)).toEqual(frozenBefore)
  })

  test('riff is disabled when nothing is derived', async ({ page }) => {
    await bootFullBoard(page)
    // every seat and every chart slot is filled by a color you supplied
    await expect(page.locator('.rb-slot.rb-derived')).toHaveCount(0)
    await expect(page.locator('.tray-set .series.derived')).toHaveCount(0)
    await expect(page.locator('.tray-cap')).toHaveText('5 of 5')

    await expect(tool(page, 're-roll')).toHaveCount(0)
    const riff = tool(page, 'nothing to riff')
    await expect(riff).toBeDisabled()
    await expect(riff).toHaveAttribute('title', 'nothing to riff — every seat is yours')
  })
})
