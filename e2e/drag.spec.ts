import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Drag and drop between the seats, the series tray and the bench.
 *
 * This is the one interaction the unit suite cannot reach — jsdom has no real
 * `dataTransfer`, so App.test.tsx skips it and points here. Placement is now
 * the ONLY way to steer the engine (the old drag-to-reorder prior is gone), so
 * if these break, the redesign's primary verb is broken.
 *
 * All three surfaces speak one payload over `application/json`; a drop that
 * fails to move a color usually means one of them stopped writing that key.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)
const hexOf = (page: Page, role: string) => seat(page, role).locator('.rb-hex')
const tagOf = (page: Page, role: string) => seat(page, role).locator('.rb-tag')

/** Coastal seats three colors and parks the rest in the chart tray. */
const boot = async (page: Page) => {
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.role-board')).toBeVisible()
}

const openBench = async (page: Page) => {
  const bar = page.locator('.bench-bar')
  if ((await bar.getAttribute('aria-expanded')) !== 'true') await bar.click()
  await expect(page.locator('.bench-drawer')).toBeVisible()
}

test.describe('drag and drop', () => {
  test('dragging a seat onto the bench parks it, and the seat is re-cast', async ({ page }) => {
    await boot(page)
    const before = await hexOf(page, 'accent').textContent()

    await seat(page, 'accent').dragTo(page.locator('.bench-bar'))

    // the color left the seat
    await expect(hexOf(page, 'accent')).not.toHaveText(before!)
    // ...and is now findable on the bench
    await openBench(page)
    await expect(page.locator('.benched', { hasText: before! })).toBeVisible()
  })

  test('dragging a benched color onto a seat fills that seat with it', async ({ page }) => {
    await boot(page)
    // park danger's neighbour first so the bench has something in it
    const parked = await hexOf(page, 'neutral').textContent()
    await seat(page, 'neutral').dragTo(page.locator('.bench-bar'))
    await openBench(page)
    const chip = page.locator('.benched', { hasText: parked! })
    await expect(chip).toBeVisible()

    await chip.dragTo(seat(page, 'success'))

    await expect(hexOf(page, 'success')).toHaveText(parked!)
    // a color you placed is yours — riff must not move it
    await expect(tagOf(page, 'success')).toHaveText('yours')
  })

  test('dragging one seat onto another moves the color and benches the displaced one', async ({
    page,
  }) => {
    await boot(page)
    const moving = await hexOf(page, 'primary').textContent()
    const displaced = await hexOf(page, 'accent').textContent()
    expect(moving).not.toBe(displaced)

    await seat(page, 'primary').dragTo(seat(page, 'accent'))

    await expect(hexOf(page, 'accent')).toHaveText(moving!)
    await openBench(page)
    await expect(page.locator('.benched', { hasText: displaced! })).toBeVisible()
  })

  test('dragging a seat into the series tray adds it to the pool', async ({ page }) => {
    await boot(page)
    const before = Number((await page.locator('.tray-cap').textContent())!.split(' ')[0])
    // must be a seat of YOURS — a derived seat has no color behind it to drag
    const source = page.locator('.rb-slot.rb-yours').first()
    const moving = await source.locator('.rb-hex').textContent()

    await source.dragTo(page.locator('.tray-set'))

    // The tray gained one of yours; `N of 5` counts only non-derived entries.
    // Don't match on `moving` here: a tray swatch shows the CHART-ADJUSTED
    // colour (chartAdjust clamps lightness and chroma so a series stays
    // visible), so the raw seat hex legitimately won't appear in its title.
    const after = Number((await page.locator('.tray-cap').textContent())!.split(' ')[0])
    expect(after).toBe(before + 1)
    expect(await page.locator('.series.yours').count()).toBe(after)
    // and the seat it left is now filled by someone else
    await expect(page.locator('.rb-slot.rb-yours').first().locator('.rb-hex')).not.toHaveText(
      moving!,
    )
  })

  test('a derived seat cannot be dragged — there is no color of yours behind it', async ({
    page,
  }) => {
    await boot(page)
    const derived = page.locator('.rb-slot.rb-derived').first()
    await expect(derived).toHaveAttribute('draggable', 'false')
  })
})
