import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Riff is a WALK, and a lock is the only thing that stops it.
 *
 * The old contract this replaced said riff re-rolled the seats the engine had
 * derived and nothing else, which meant a palette pulled out of an image —
 * eleven colours, every seat filled — could not be riffed at all. The suite
 * below asserts the opposite of both halves: everything unlocked moves, only
 * what you locked holds still, and a full board is fully riffable.
 */

/** Boot from a single typed color — it takes primary, the engine derives the rest. */
const bootSingle = async (page: Page) => {
  await page.goto('/')
  await page.getByPlaceholder(/or type/).fill('#7c3aed')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.preview-root')).toBeVisible()
}

/**
 * Boot a set big enough to fill all six seats AND all five chart slots. This
 * used to be the state where riff had no work; it is now simply a palette with
 * no locks in it, which is the most riffable state there is.
 */
const bootFullBoard = async (page: Page) => {
  await page.goto('/')
  await page
    .getByPlaceholder(/or type/)
    .fill('#e63946 #457b9d #f1faee #ef4444 #22c55e #eab308 #3b82f6 #a855f7 #14b8a6 #ec4899 #84cc16')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.preview-root')).toBeVisible()
}

/**
 * The palette's verbs live in `.ctl-row` under the section header. Titles now
 * carry the control's shortcut key on the end, so match a fragment or a
 * prefix — never the whole string.
 */
const tool = (page: Page, title: string) => page.locator(`.ctl-row .ctl[title*="${title}"]`)
/** The riff button in either state. Anchored: `back one riff` contains the word too. */
const riff = (page: Page) =>
  page.locator('.ctl-row .ctl[title^="riff"], .ctl-row .ctl[title^="nothing to riff"]')
/** The hop badge — the count moved off the button once it grew a word. */
const hops = (page: Page) => page.locator('.ctl-row .ctl-hop')

const ROLES = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning'] as const

/** One seat on the board. */
const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)
const lock = (page: Page, role: string) => seat(page, role).locator('.rb-lock')

/** The whole board as `role=hex/provenance` strings — one comparable snapshot. */
const board = (page: Page) =>
  page.locator('.rb-slot').evaluateAll((els) =>
    els.map(
      (el) =>
        `${el.getAttribute('data-role')}=${el.querySelector('.rb-hex')?.textContent}/${el.querySelector('.rb-tag')?.textContent}`,
    ),
  )

/** Split by the only thing that decides who moves. */
const seatsBy = async (page: Page, locked: boolean) =>
  page.locator('.rb-slot').evaluateAll(
    (els, want) =>
      els
        .filter((el) => (el.querySelector('.rb-lock')?.getAttribute('data-locked') === 'true') === want)
        .map(
          (el) =>
            `${el.getAttribute('data-role')}=${el.querySelector('.rb-hex')?.textContent}`,
        ),
    locked,
  )

/** The mockup's role-driven CSS variables, as one comparable string. */
const themeVars = (page: Page) =>
  page
    .locator('.preview-root')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return ['--primary', '--destructive', '--success', '--warning', '--accent', '--secondary']
        .map((v) => `${v}:${s.getPropertyValue(v).trim()}`)
        .join(' ')
    })

test.describe('riff', () => {
  test('a hop moves every unlocked seat; back returns exactly to hop 0', async ({ page }) => {
    await bootSingle(page)
    const canonical = await themeVars(page)
    const hop0 = await board(page)
    // nothing is locked yet — not even the colour you typed
    expect(await seatsBy(page, true)).toEqual([])
    expect(await seatsBy(page, false)).toHaveLength(6)

    await riff(page).click()
    await expect(hops(page)).toHaveText('1')

    const hop1 = await board(page)
    expect(hop1).not.toEqual(hop0)
    // every seat moved, the one you supplied included
    for (let i = 0; i < hop0.length; i++) expect(hop1[i]).not.toBe(hop0[i])
    expect(await themeVars(page)).not.toBe(canonical)

    // back is the undo, and hop 0 is bit-identical to the pre-riff theme
    await tool(page, 'back one riff').click()
    await expect(tool(page, 'no hops to step back through')).toBeDisabled()
    expect(await board(page)).toEqual(hop0)
    expect(await themeVars(page)).toBe(canonical)
  })

  test('a locked seat is byte-identical across hops while the rest walk', async ({ page }) => {
    await bootSingle(page)
    // lock the colour you supplied, and keep (= lock) one the engine derived
    await lock(page, 'primary').click()
    await seat(page, 'warning').locator('.rb-keep').click()
    await expect(seat(page, 'warning').locator('.rb-tag')).toHaveText('kept')
    await expect(lock(page, 'warning')).toHaveAttribute('data-locked', 'true')

    const frozen = await seatsBy(page, true)
    expect(frozen).toEqual([
      `primary=${await seat(page, 'primary').locator('.rb-hex').textContent()}`,
      `warning=${await seat(page, 'warning').locator('.rb-hex').textContent()}`,
    ])

    for (const n of ['1', '2', '3']) {
      const movingBefore = await seatsBy(page, false)
      await riff(page).click()
      await expect(hops(page)).toHaveText(n)
      // byte-identical, hop after hop — not merely close
      expect(await seatsBy(page, true)).toEqual(frozen)
      expect(await seatsBy(page, false)).not.toEqual(movingBefore)
    }
  })

  test('the lock toggles both ways, and says which way it is', async ({ page }) => {
    await bootSingle(page)
    const primary = lock(page, 'primary')
    await expect(primary).toHaveAttribute('data-locked', 'false')
    await expect(primary).toHaveAttribute('title', 'unlocked — riff may move this')

    await primary.click()
    await expect(primary).toHaveAttribute('data-locked', 'true')
    await expect(primary).toHaveAttribute('title', 'locked — riff will not move this')
    await expect(seat(page, 'primary')).toHaveClass(/is-locked/)

    // unlocking leaves the colour exactly where it sits — it is not a bench
    await primary.click()
    await expect(primary).toHaveAttribute('data-locked', 'false')
    await expect(seat(page, 'primary').locator('.rb-tag')).toHaveText('yours')
    await expect(page.locator('.bench-bar')).toContainText('0 colors not in play')
  })

  test('keep freezes a derived seat where it stands, and shows as locked', async ({ page }) => {
    await bootSingle(page)
    const warning = seat(page, 'warning')
    await expect(warning.locator('.rb-tag')).toHaveText('derived')
    await expect(lock(page, 'warning')).toHaveAttribute('data-locked', 'false')
    const kept = await warning.locator('.rb-hex').textContent()

    await warning.locator('.rb-keep').click()

    // the color does not move — only who owns it, and whether riff may touch it
    await expect(warning.locator('.rb-hex')).toHaveText(kept!)
    await expect(warning.locator('.rb-tag')).toHaveText('kept')
    await expect(lock(page, 'warning')).toHaveAttribute('data-locked', 'true')
    // a kept seat has an ordinary lock now; there is nothing left to claim
    await expect(warning.locator('.rb-keep')).toHaveCount(0)
    await expect(warning.locator('.rb-lock')).toHaveCount(1)
  })

  test('riff, lock what you found, riff on — the loop keeps it', async ({ page }) => {
    // The whole point of the feature, driven the way a user drives it. This
    // broke once: the lock set a flag on the untouched candidate, so a walked
    // seat rewound to the typed input under the click meant to freeze it, and
    // nothing a riff turned up could be kept.
    await bootSingle(page)
    const hex = () => seat(page, 'primary').locator('.rb-hex').textContent()
    // NB the seat shows the seed, which already differs from the typed string
    // below fidelity 1 — so the input has to come from what was typed, not
    // from reading the chip back at hop 0.
    const typed = '#7c3aed'
    const hop0 = await hex()

    await riff(page).click()
    await riff(page).click()
    await expect(hops(page)).toHaveText('2')
    const found = await hex()
    expect(found).not.toBe(hop0)

    await lock(page, 'primary').click()
    // the colour you were looking at, not the one you typed
    expect(await hex()).toBe(found)

    const accentBefore = await seat(page, 'accent').locator('.rb-hex').textContent()
    await riff(page).click()
    await riff(page).click()
    await expect(hops(page)).toHaveText('4')
    expect(await hex()).toBe(found)
    expect(await seat(page, 'accent').locator('.rb-hex').textContent()).not.toBe(accentBefore)

    // and your input is never lost — it is still named as the source
    await expect(seat(page, 'primary').locator('.rb-body')).toHaveAttribute(
      'title',
      new RegExp(`from ${typed}`),
    )
  })

  test('a board you filled entirely yourself is fully riffable', async ({ page }) => {
    await bootFullBoard(page)
    // every seat and every chart slot is filled by a color you supplied — the
    // exact state the old rule called "nothing to riff"
    await expect(page.locator('.rb-slot.rb-derived')).toHaveCount(0)
    await expect(page.locator('.tray-set .series.derived')).toHaveCount(0)
    await expect(page.locator('.tray-cap')).toHaveText('5 of 5')

    await expect(riff(page)).toBeEnabled()
    const hop0 = await board(page)
    await riff(page).click()
    await expect(hops(page)).toHaveText('1')
    const hop1 = await board(page)
    for (let i = 0; i < hop0.length; i++) expect(hop1[i]).not.toBe(hop0[i])
  })

  test('riff is disabled only when every seat and chart colour is locked', async ({ page }) => {
    await bootFullBoard(page)
    await expect(riff(page)).toBeEnabled()

    // Address the controls positionally, never by their own `data-locked` —
    // a locator built from that attribute goes stale the moment it is clicked.
    for (const role of ROLES) await lock(page, role).click()
    // the roles are frozen, but colours of yours are still loose in the tray
    await expect(page.locator('.rb-lock[data-locked="true"]')).toHaveCount(6)
    await expect(riff(page)).toBeEnabled()

    // a tray swatch can share its candidate with a seat, in which case locking
    // the seat already locked it and clicking again would undo that
    await expect(page.locator('.series-lock')).toHaveCount(5)
    for (let i = 0; i < 5; i++) {
      const l = page.locator('.tray-set .series').nth(i).locator('.series-lock')
      if ((await l.getAttribute('data-locked')) === 'false') await l.click()
    }
    await expect(page.locator('.series-lock[data-locked="false"]')).toHaveCount(0)

    await expect(riff(page)).toBeDisabled()
    await expect(riff(page)).toHaveAttribute(
      'title',
      /^nothing to riff — every seat is locked/,
    )
  })
})
