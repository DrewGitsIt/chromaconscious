import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Drag and drop between the seats, the series tray and "unused" (which
 * appears as a drop target while a drag is in flight, even when empty).
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
const lockOf = (page: Page, role: string) => seat(page, role).locator('.rb-lock')

/**
 * The colour a seat CAME FROM — the string you typed. The chip shows the seed
 * the engine resolved instead, and the same colour resolves differently in
 * different seats, so a drag can only be followed by its source. The tooltip
 * carries it as "from #…", falling back to the chip when the two agree.
 */
const sourceOf = async (page: Page, role: string): Promise<string> => {
  const title = (await seat(page, role).locator('.rb-body').getAttribute('title')) ?? ''
  return /from (#[0-9a-f]{6})/.exec(title)?.[1] ?? ((await hexOf(page, role).textContent()) ?? '')
}

/** Coastal seats three colors and parks the rest in the chart tray. */
const boot = async (page: Page) => {
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.role-board')).toBeVisible()
}

/**
 * Drag with both ends already on screen. The rows are taller than the old
 * 2×3 grid, so "unused" and the tray sit below the sidebar's fold; letting
 * dragTo scroll the pane between mouse-down and drop cancels the native drag.
 */
const drag = async (from: Locator, to: Locator) => {
  // the higher of the two at the top of the pane, so the lower one is in view
  const [a, b] = [await from.boundingBox(), await to.boundingBox()]
  await (a!.y <= b!.y ? from : to).evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await from.dragTo(to)
}

/** A colour of yours sitting in the "unused" row. */
const unusedChip = (page: Page, hex: string) => page.locator('.unused-chip', { hasText: hex })

test.describe('drag and drop', () => {
  test('dragging a seat onto the bench parks it, and the seat is re-cast', async ({ page }) => {
    await boot(page)
    const before = await sourceOf(page, 'accent')

    await drag(seat(page, 'accent'), page.locator('.unused'))

    // the color left the seat
    expect(await sourceOf(page, 'accent')).not.toBe(before)
    // ...and is now findable in "unused", which names your colours as you gave them
    await expect(unusedChip(page, before)).toBeVisible()
  })

  test('dragging a benched color onto a seat fills that seat with it', async ({ page }) => {
    await boot(page)
    // park danger's neighbour first so the bench has something in it
    const parked = await sourceOf(page, 'neutral')
    await drag(seat(page, 'neutral'), page.locator('.unused'))
    const chip = unusedChip(page, parked)
    await expect(chip).toBeVisible()

    await drag(chip, seat(page, 'success'))

    expect(await sourceOf(page, 'success')).toBe(parked)
    await expect(seat(page, 'success')).toHaveClass(/\brb-yours\b/)
    // ...and placing it says nothing about riff: a pin is not a lock
    await expect(lockOf(page, 'success')).toHaveAttribute('data-locked', 'false')
  })

  test('dragging one seat onto another moves the color and benches the displaced one', async ({
    page,
  }) => {
    await boot(page)
    const moving = await sourceOf(page, 'primary')
    const displaced = await sourceOf(page, 'accent')
    expect(moving).not.toBe(displaced)

    await seat(page, 'primary').dragTo(seat(page, 'accent'))

    expect(await sourceOf(page, 'accent')).toBe(moving)
    await expect(unusedChip(page, displaced)).toBeVisible()
  })

  test('dragging a seat into the series tray adds it to the pool', async ({ page }) => {
    await boot(page)
    const before = Number((await page.locator('.tray-cap').textContent())!.split(' ')[0])
    // must be a seat of YOURS — a derived seat has no color behind it to drag
    const source = page.locator('.rb-slot.rb-yours').first()
    const movingRole = (await source.getAttribute('data-role'))!
    const moving = await sourceOf(page, movingRole)

    // the whole tray takes the drop, folded or not
    await drag(source, page.locator('.tray-top'))

    // The tray gained one of yours; `N of 5` counts only non-derived entries.
    // Don't match on `moving` here: a tray swatch shows the CHART-ADJUSTED
    // colour (chartAdjust clamps lightness and chroma so a series stays
    // visible), so the raw seat hex legitimately won't appear in its title.
    const after = Number((await page.locator('.tray-cap').textContent())!.split(' ')[0])
    expect(after).toBe(before + 1)
    expect(await page.locator('.series.yours').count()).toBe(after)
    // and the seat it left is now filled by someone else
    const nowRole = (await page.locator('.rb-slot.rb-yours').first().getAttribute('data-role'))!
    expect(await sourceOf(page, nowRole)).not.toBe(moving)
  })

  test('a derived seat cannot be dragged — there is no color of yours behind it', async ({
    page,
  }) => {
    await boot(page)
    const derived = page.locator('.rb-slot.rb-derived').first()
    await expect(derived).toHaveAttribute('draggable', 'false')
  })
})
