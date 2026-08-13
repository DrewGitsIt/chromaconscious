import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/** Boot from a single typed color — five of the six roles are synthesized. */
const bootSingle = async (page: Page) => {
  await page.goto('/')
  await page.getByPlaceholder(/or type/).fill('#7c3aed')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.preview-root')).toBeVisible()
}

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
  test('riff repaints the invented mockup colors; back restores them', async ({ page }) => {
    await bootSingle(page)
    const canonical = await inventedVars(page)
    await page.getByRole('button', { name: '⚄ riff' }).click()
    await expect(page.locator('.riff-chip')).toHaveText('riff 1')
    expect(await inventedVars(page)).not.toBe(canonical)
    // the user's color never moves with the seed
    await expect(page.locator('.candidate-strip')).toContainText('#7c3aed')
    // back is the undo: seed 0 is bit-identical to the pre-riff theme
    await page.getByRole('button', { name: 'previous riff' }).click()
    await expect(page.locator('.riff-chip')).toHaveCount(0)
    expect(await inventedVars(page)).toBe(canonical)
  })

  test('keep as your color pins the invented seed; it survives later riffs', async ({ page }) => {
    await bootSingle(page)
    await expect(page.locator('.invented-item')).toHaveCount(5)
    await page.getByRole('button', { name: 'keep danger as your color' }).click()
    await expect(page.locator('.candidate-strip li')).toHaveCount(2)
    await expect(page.locator('.badge-pinned')).toHaveCount(1)
    await expect(page.locator('.badge-pinned')).toHaveText('danger')
    // danger is user-cast now: no longer invented, and immune to the seed
    await expect(page.locator('.invented-item')).toHaveCount(4)
    const kept = await page.locator('.candidate-strip li').nth(1).locator('code').textContent()
    await page.getByRole('button', { name: '⚄ riff' }).click()
    await expect(page.locator('.riff-chip')).toHaveText('riff 1')
    await expect(page.locator('.candidate-strip li').nth(1).locator('code')).toHaveText(kept!)
    await expect(page.locator('.badge-pinned')).toHaveCount(1)
  })
})
