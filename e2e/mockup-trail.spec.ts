import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectHonest, setMode, textOnSurfaces } from './showcase'

/**
 * The hiking app: three phones that are one app. Two promises, as in the app
 * mockups: every control is real (state read back across a click), and every
 * text is a checked pair, never on a photograph or the map, in whatever state
 * the controls leave it.
 */

const boot = async (page: Page, preset = 'Terracotta') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption('trail')
  await expect(page.locator('.trl-phone')).toHaveCount(3)
}

const phone = (page: Page, name: string) => page.getByRole('region', { name: `Phone: ${name}` })

test.describe('hiking app mockup', () => {
  for (const [preset, mode] of [
    ['Terracotta', 'light'],
    ['Neon arcade', 'dark'],
    ['Ink & sky', 'light'],
  ] as const) {
    test(`${preset} ${mode}: every text sits on a checked pair, in every state`, async ({ page }) => {
      await boot(page, preset)
      await setMode(page, mode)
      expectHonest(await textOnSurfaces(page, '.trl'), 50)
      // the other states: a pressed chip, the map, a running recording
      await phone(page, 'Explore').getByRole('button', { name: 'Easy' }).click()
      await phone(page, 'Trail').getByRole('tab', { name: 'Map' }).click()
      await phone(page, 'Trail').getByRole('button', { name: 'Start this trail' }).click()
      expectHonest(await textOnSurfaces(page, '.trl'), 30)
    })
  }

  test('search, difficulty and the saved tab filter the list', async ({ page }) => {
    await boot(page)
    const explore = phone(page, 'Explore')
    const items = explore.locator('.trl-item')
    await expect(items).toHaveCount(5)
    await explore.getByPlaceholder('Search trails').fill('ridge')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText('North ridge')
    await explore.getByPlaceholder('Search trails').fill('')
    await explore.getByRole('button', { name: 'Easy' }).click()
    await expect(explore.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true')
    await expect(items).toHaveCount(2)
    await explore.getByRole('button', { name: 'Easy' }).click()
    await expect(items).toHaveCount(5)
    await explore.getByRole('button', { name: /Saved/ }).click()
    await expect(explore.getByRole('heading', { name: 'Saved trails' })).toBeVisible()
    await expect(items).toHaveCount(1)
  })

  test('saving on either phone saves on both', async ({ page }) => {
    await boot(page)
    const explore = phone(page, 'Explore')
    const detail = phone(page, 'Trail')
    await expect(explore.locator('.trl-count')).toHaveText('1')
    await detail.getByRole('button', { name: 'save Meadow traverse' }).click()
    await expect(explore.getByRole('button', { name: 'remove Meadow traverse from saved' })).toHaveAttribute('aria-pressed', 'true')
    await expect(explore.locator('.trl-count')).toHaveText('2')
    await explore.getByRole('button', { name: 'remove Meadow traverse from saved' }).click()
    await expect(detail.getByRole('button', { name: 'save Meadow traverse' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('the trail view switches between elevation and map', async ({ page }) => {
    await boot(page)
    const detail = phone(page, 'Trail')
    await expect(detail.getByRole('tabpanel')).toContainText('Highest point')
    await detail.getByRole('tab', { name: 'Map' }).click()
    await expect(detail.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
    await expect(detail.getByRole('tabpanel')).toContainText('trailhead')
    await expect(detail.locator('.trl-map')).toHaveCount(1)
  })

  test('starting the trail records it on the third phone', async ({ page }) => {
    await boot(page)
    const rec = phone(page, 'Recording')
    await expect(rec.getByRole('status')).toHaveText('Paused')
    await phone(page, 'Trail').getByRole('button', { name: 'Start this trail' }).click()
    await expect(phone(page, 'Trail').getByRole('button', { name: 'Recording' })).toBeDisabled()
    await expect(rec.getByRole('status')).toHaveText('Recording')
    await expect(rec.getByLabel('time')).not.toHaveText('0:00', { timeout: 3000 })
    await rec.getByRole('button', { name: 'Mark' }).click()
    await expect(rec.getByRole('list', { name: 'waypoints' }).locator('li')).toHaveCount(1)
    await rec.getByRole('button', { name: 'pause' }).click()
    await expect(rec.getByRole('status')).toHaveText('Paused')
    const held = await rec.getByLabel('time').textContent()
    await page.waitForTimeout(1300)
    await expect(rec.getByLabel('time')).toHaveText(held!)
    await expect(rec.getByRole('button', { name: 'Mark' })).toBeDisabled()
    await rec.getByRole('button', { name: 'Finish' }).click()
    await expect(rec.getByRole('status')).toHaveText('Finished')
    await expect(rec.locator('.trl-done')).toContainText(`in ${held}`)
  })

  test('every photograph is drawn through its own token filter', async ({ page }) => {
    await boot(page)
    const wiring = await page.locator('.trl').first().evaluate((root) =>
      Array.from(root.querySelectorAll('.token-photo img')).map((img) => {
        const id = /url\("?#([^")]+)"?\)/.exec((img as HTMLElement).style.filter)?.[1]
        return !!id && !!root.querySelector(`filter[id="${id}"]`)
      }),
    )
    expect(wiring.length).toBe(6)
    expect(wiring.every(Boolean)).toBe(true)
  })
})
