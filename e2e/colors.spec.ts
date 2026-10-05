import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * The colour rows: `[your colour] [what happened] [what ships]` per seat.
 * Each test drives a real edit and reads the row back across it.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.role-board')).toBeVisible()
})

const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)
const middle = (page: Page, role: string) => seat(page, role).locator('.dc')

/** Set the colour a seat ships, through its popover. */
const setShipped = async (page: Page, role: string, hex: string) => {
  await seat(page, role).locator('.rb-body').click()
  const pop = page.locator('.rp-ship')
  await expect(pop).toBeVisible()
  await pop.getByLabel(`color ${role} ships`).fill(hex.replace('#', ''))
  await pop.getByRole('button', { name: 'lock' }).click()
  await expect(pop).toHaveCount(0)
}

test.describe('colour rows', () => {
  test('a moved seat says how in words; an unchanged one shows both chips and "="', async ({ page }) => {
    await expect(middle(page, 'primary')).toHaveAttribute('data-kind', 'moved')
    await expect(middle(page, 'primary').locator('.dc-why')).toHaveText(
      /^ΔE \.\d{3}(lighter|darker|more vivid|softer|hue [+−]\d+°|nudged)$/,
    )
    await expect(middle(page, 'accent')).toHaveAttribute('data-kind', 'same')
    await expect(middle(page, 'accent').locator('.dc-why')).toHaveText('same')
    await expect(seat(page, 'accent').locator('.rb-chip')).toHaveCount(2)
  })

  test('editing the output locks it as typed and shows "="', async ({ page }) => {
    await setShipped(page, 'primary', '#c0392b')
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#c0392b')
    await expect(seat(page, 'primary').locator('.rb-in')).toHaveText('#c0392b')
    await expect(middle(page, 'primary')).toHaveAttribute('data-kind', 'same')
    await expect(seat(page, 'primary').locator('.rb-lock')).toHaveAttribute('data-locked', 'true')
    await expect(seat(page, 'primary').locator('.rb-state')).toHaveText('locked · as typed')
    // the lock is the freeze: riff walks the rest and leaves this one exactly
    await page.locator('.ctl-row .ctl[title^="riff"]').click()
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#c0392b')
  })

  test('a failing lock shows the warning, the reason, and one button', async ({ page }) => {
    await setShipped(page, 'primary', '#f8f8f8')
    await expect(middle(page, 'primary')).toHaveAttribute('data-kind', 'fail')
    await expect(middle(page, 'primary').locator('.dc-short')).toHaveText('2.1:1')
    const line = seat(page, 'primary').locator('.rb-fail')
    await expect(line).toContainText('2.1:1 on the light page; a primary fill needs 3:1')
    // keeping it is the default, so there is exactly one button: the fix
    await expect(line.getByRole('button')).toHaveText(['derive safely'])
    // and the theme still exports — guide, don't block
    await expect(page.locator('.sidebar-shell').getByRole('button', { name: 'Export' })).toBeEnabled()
  })

  test('"derive safely" unlocks it and the engine re-derives from your colour', async ({ page }) => {
    await setShipped(page, 'primary', '#f8f8f8')
    await seat(page, 'primary').getByRole('button', { name: 'derive safely' }).click()
    await expect(seat(page, 'primary').locator('.rb-fail')).toHaveCount(0)
    await expect(seat(page, 'primary').locator('.rb-lock')).toHaveAttribute('data-locked', 'false')
    await expect(seat(page, 'primary').locator('.rb-in')).toHaveText('#f8f8f8')
    await expect(middle(page, 'primary')).toHaveAttribute('data-kind', 'moved')
    await expect(seat(page, 'primary').locator('.rb-hex')).not.toHaveText('#f8f8f8')
  })

  test('"+ add" in an empty cell gives the seat a colour of yours', async ({ page }) => {
    const add = seat(page, 'success').locator('.rb-add')
    await expect(add).toHaveText('add')
    await expect(middle(page, 'success')).toHaveAttribute('data-kind', 'derived')
    await expect(seat(page, 'success').locator('.rb-body')).toHaveClass(/is-derived/)
    await add.click()
    await page.getByLabel('new color for success').fill('2f9e5b')
    await page.getByRole('button', { name: 'apply' }).click()
    await expect(seat(page, 'success').locator('.rb-in')).toHaveText('#2f9e5b')
    await expect(seat(page, 'success')).toHaveClass(/\brb-yours\b/)
    await expect(seat(page, 'success').locator('.rb-lock')).toHaveAttribute('data-locked', 'false')
    await expect(seat(page, 'success').locator('.rb-body')).not.toHaveClass(/is-derived/)
  })

  test('chart rows are folded under a strip of what ships, and unfold to the same grid', async ({ page }) => {
    const toggle = page.locator('.tray-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.tray-sum i')).toHaveCount(5)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const rows = page.locator('.tray-set .series')
    await expect(rows).toHaveCount(5)
    // coastal charts two colours of yours; the engine derives the rest
    await expect(page.locator('.tray-set .series .series-in')).toHaveCount(2)
    await expect(page.locator('.tray-set .series .series-add')).toHaveCount(3)
  })

  test('at taste 1, "derive safely" fixes that one colour: warning and count clear, taste stays 1', async ({ page }) => {
    await page.locator('.dial-slider').fill('1')
    await setShipped(page, 'primary', '#f8f8f8')
    await expect(middle(page, 'primary')).toHaveAttribute('data-kind', 'fail')
    await expect(page.locator('.status-chip')).toContainText('issue')
    await seat(page, 'primary').getByRole('button', { name: 'derive safely' }).click()
    await expect(seat(page, 'primary').locator('.rb-fail')).toHaveCount(0)
    await expect(page.locator('.status-chip')).toContainText(/^all \d+ checks pass/)
    // the theme's taste is untouched; this one colour has its own
    await expect(page.locator('.dial-value')).toHaveText('1.00')
    await expect(seat(page, 'primary').locator('.rb-state')).toHaveText(/^derived safely · taste 0\.\d\d$/)
    await expect(seat(page, 'primary').locator('.rb-in')).toHaveText('#f8f8f8')
    await expect(middle(page, 'primary')).toHaveAttribute('data-kind', 'moved')
    // every other colour of yours still ships as typed
    await expect(middle(page, 'accent')).toHaveAttribute('data-kind', 'same')
    // and it holds through a riff
    await page.locator('.ctl-row .ctl[title^="riff"]').click()
    await expect(seat(page, 'primary').locator('.rb-state')).toHaveText(/^derived safely/)
    await expect(seat(page, 'primary').locator('.rb-fail')).toHaveCount(0)
  })
})
