import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** Boot a working session with the pastel picnic preset (blue accent last). */
const bootPicnic = async (page: Page) => {
  await page.getByRole('button', { name: 'Pastel picnic' }).click()
  await expect(page.locator('.candidate-strip')).toContainText('#a0c4ff')
}

test.describe('chips explain themselves', () => {
  test('clicking a role chip opens a menu with a why-line', async ({ page }) => {
    await bootPicnic(page)
    const accentRow = page.locator('.candidate-strip li', { hasText: '#a0c4ff' })
    await accentRow.locator('.badge').click()
    const menu = page.locator('.role-menu')
    await expect(menu).toBeVisible()
    await expect(menu.locator('.why-line').first()).not.toBeEmpty()
  })

  test('pinning through the menu changes the chip and survives edits', async ({ page }) => {
    await bootPicnic(page)
    // the cyan sits in chart; pin it to accent — the seat transfers
    const cyanRow = page.locator('.candidate-strip li', { hasText: '#9bf6ff' })
    await expect(cyanRow.locator('.badge')).toContainText(/chart/i)
    await cyanRow.locator('.badge').click()
    await page.getByRole('button', { name: 'pin to → accent' }).click()
    await expect(cyanRow.locator('.badge')).toContainText(/accent/i)
    // unpin restores engine casting
    await cyanRow.locator('.badge').click()
    await page.getByRole('button', { name: 'unpin' }).click()
    await expect(cyanRow.locator('.badge')).toContainText(/chart/i)
  })

  test('an edit that moves a seat fires the transfer toast; undo restores', async ({ page }) => {
    await bootPicnic(page)
    // pinning cyan to accent takes the seat from blue — that transfer is news
    const cyanRow = page.locator('.candidate-strip li', { hasText: '#9bf6ff' })
    await cyanRow.locator('.badge').click()
    await page.getByRole('button', { name: 'pin to → accent' }).click()
    const toast = page.locator('.toast')
    await expect(toast).toContainText('took accent from')
    await expect(toast).toContainText('#a0c4ff')
    await page.locator('.toast-undo').click()
    await expect(page.locator('.candidate-strip li', { hasText: '#a0c4ff' }).locator('.badge')).toContainText(
      /accent/i,
    )
  })
})
