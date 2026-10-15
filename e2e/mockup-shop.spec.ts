import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectHonest, setMode, textOnSurfaces } from './showcase'

/**
 * The product page: every control is real (state read back across a click),
 * the finishes are the palette's own (the product photographs re-map through
 * the finish's tokens), and every text is a checked pair, never on a
 * photograph, in whatever state the controls leave it.
 */

const boot = async (page: Page, preset = 'Terracotta') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption('shop')
  await expect(page.locator('.shp-title')).toBeVisible()
}

const shop = (page: Page) => page.locator('.shp').first()

test.describe('product page mockup', () => {
  for (const [preset, mode] of [
    ['Terracotta', 'light'],
    ['Neon arcade', 'dark'],
    ['Ink & sky', 'light'],
  ] as const) {
    test(`${preset} ${mode}: every text sits on a checked pair, in every state`, async ({ page }) => {
      await boot(page, preset)
      await setMode(page, mode)
      expectHonest(await textOnSurfaces(page, '.shp'), 40)
      // the other states: added, the bag open, reviews, another finish
      await shop(page).getByRole('button', { name: 'Add to bag' }).click()
      await shop(page).getByRole('button', { name: /^Bag/ }).click()
      await shop(page).getByRole('tab', { name: /Reviews/ }).click()
      await shop(page).getByRole('radio', { name: 'Accent enamel' }).check({ force: true })
      expectHonest(await textOnSurfaces(page, '.shp'), 40)
    })
  }

  test('the finish re-maps the product photographs through its tokens', async ({ page }) => {
    await boot(page)
    const stops = () =>
      shop(page)
        .locator('.shp-stage filter')
        .getAttribute('data-stops')
    await expect.poll(stops).toBe('foreground primary background')
    await shop(page).getByRole('radio', { name: 'Accent enamel' }).check({ force: true })
    await expect(shop(page).locator('.shp-finish legend')).toHaveText('Finish: Accent enamel')
    await expect.poll(stops).toBe('foreground accent-strong background')
    // the thumbnails follow the finish too
    await expect(shop(page).locator('.shp-thumb filter').first()).toHaveAttribute('data-stops', 'foreground accent-strong background')
  })

  test('the thumbnails pick the view', async ({ page }) => {
    await boot(page)
    const alt = () => shop(page).locator('.shp-stage img').getAttribute('alt')
    expect(await alt()).toMatch(/domed teapot/)
    await shop(page).getByRole('button', { name: 'show back' }).click()
    await expect(shop(page).getByRole('button', { name: 'show back' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(alt).toMatch(/other side/)
    await shop(page).getByRole('button', { name: 'show handle' }).click()
    await expect.poll(alt).toMatch(/handle/)
  })

  test('quantity, add to bag and the quick adds fill the bag', async ({ page }) => {
    await boot(page)
    const s = shop(page)
    await expect(s.getByRole('button', { name: 'one fewer' })).toBeDisabled()
    await s.getByRole('button', { name: 'one more' }).click()
    await s.getByRole('button', { name: 'one more' }).click()
    await expect(s.locator('.shp-qty output')).toHaveText('3')
    await s.getByRole('button', { name: 'Add to bag' }).click()
    await expect(s.locator('.shp-added')).toHaveText('Added 3 × Dome teapot, primary enamel to your bag.')
    await expect(s.locator('.shp-count')).toHaveText('3')
    await s.getByRole('button', { name: 'add Sugar bowl' }).click()
    await expect(s.locator('.shp-count')).toHaveText('4')
    await s.getByRole('button', { name: /^Bag/ }).click()
    const bag = s.getByRole('region', { name: 'bag' })
    await expect(bag.locator('li')).toHaveCount(2)
    await expect(bag.locator('.shp-bag-total')).toHaveText('Total€502')
    await s.getByRole('button', { name: /^Bag/ }).click()
    await expect(bag).toHaveCount(0)
  })

  test('the tabs switch, and the reviews link opens reviews', async ({ page }) => {
    await boot(page)
    const s = shop(page)
    await expect(s.getByRole('tabpanel')).toContainText('Capacity')
    await s.getByRole('tab', { name: 'Care' }).click()
    await expect(s.getByRole('tabpanel')).toContainText('No dishwasher')
    await s.getByRole('button', { name: '126 reviews' }).click()
    await expect(s.getByRole('tab', { name: /Reviews/ })).toHaveAttribute('aria-selected', 'true')
    await expect(s.getByRole('tabpanel')).toContainText('Pours without dripping')
  })
})
