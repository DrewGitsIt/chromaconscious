import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * The colorblind view is per-frame view state. These check the three ways to
 * set it (the eye menu, the `v` key, a link) and that it lands where the spec
 * says: on `.frame`, named in the label row, and never on the label row itself.
 */

const boot = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
}

const eye = (page: Page, frame: 'A' | 'B' = 'A') =>
  page.getByRole('button', { name: `colorblind view for frame ${frame}` })
const frameEl = (page: Page, i = 0) => page.locator('.frame').nth(i)

test.describe('colorblind view', () => {
  test('the eye menu sets a frame\'s vision and strength, and the label row says so', async ({ page }) => {
    await boot(page)
    await expect(frameEl(page)).not.toHaveAttribute('data-vision', /.+/)
    await expect(page.locator('.frame-vision-tag')).toHaveCount(0)

    await eye(page).click()
    // typical is first and checked; strength has nothing to scale yet
    await expect(page.getByRole('radio', { name: /^typical/ })).toBeChecked()
    await expect(page.getByRole('slider', { name: /vision strength/ })).toBeDisabled()

    await page.getByRole('radio', { name: /^deutan/ }).check()
    await expect(frameEl(page)).toHaveAttribute('data-vision', 'deutan')
    await expect(frameEl(page)).toHaveCSS('filter', /url\(.*vision-a/)
    await expect(page.locator('.frame-vision-tag')).toHaveText('deutan · full')
    await expect(eye(page)).toHaveAttribute('aria-pressed', 'true')

    const slider = page.getByRole('slider', { name: /vision strength/ })
    await expect(slider).toBeEnabled()
    await slider.fill('60')
    await expect(page.locator('.frame-vision-tag')).toHaveText('deutan · 60%')

    // the label row is outside .frame, so it is never itself filtered
    await expect(page.locator('.frame-card').first()).toHaveCSS('filter', 'none')

    await page.getByRole('radio', { name: /^typical/ }).check()
    await expect(frameEl(page)).not.toHaveAttribute('data-vision', /.+/)
    await expect(page.locator('.frame-vision-tag')).toHaveCount(0)
  })

  test('the menu closes on Escape and on an outside click', async ({ page }) => {
    await boot(page)
    await eye(page).click()
    await expect(page.locator('.frame-vision-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.frame-vision-menu')).toHaveCount(0)
    await expect(eye(page)).toBeFocused()

    await eye(page).click()
    await page.locator('.stage').click({ position: { x: 4, y: 4 } })
    await expect(page.locator('.frame-vision-menu')).toHaveCount(0)
  })

  test('v cycles the active frame through the types and keeps its strength', async ({ page }) => {
    await boot(page)
    const seen: (string | null)[] = []
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('v')
      seen.push(await frameEl(page).getAttribute('data-vision'))
    }
    expect(seen).toEqual(['protan', 'deutan', 'tritan', null])

    await eye(page).click()
    await page.getByRole('radio', { name: /^protan/ }).check()
    await page.getByRole('slider', { name: /vision strength/ }).fill('40')
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')
    await expect(frameEl(page)).toHaveAttribute('data-vision', 'deutan')
    await expect(page.locator('.frame-vision-tag')).toHaveText('deutan · 40%')
  })

  test('v goes to the active frame only, and copy A → B carries vision across', async ({ page }) => {
    await boot(page)
    await page.locator('.board-btn[title*="compare two frames"]').click()
    await expect(page.locator('.frame')).toHaveCount(2)
    // the clone is active, so it is frame B that takes the key
    await page.keyboard.press('v')
    await expect(frameEl(page, 1)).toHaveAttribute('data-vision', 'protan')
    await expect(frameEl(page, 0)).not.toHaveAttribute('data-vision', /.+/)

    await page.getByRole('button', { name: 'copy frame B over frame A' }).click()
    await expect(frameEl(page, 0)).toHaveAttribute('data-vision', 'protan')
  })

  // The API is not served by the dev server, so the theme comes from a stub.
  const stubTheme = (page: Page) =>
    page.route('**/api/chromaconscious/v1/state*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          v: 1,
          candidates: [{ color: '#e63946' }, { color: '#457b9d' }, { color: '#2a9d8f' }],
        }),
      }),
    )

  test('a vision link opens in compare: A typical, B simulated', async ({ page }) => {
    await stubTheme(page)
    await page.goto('/#t_abcdefghijkl&vision=deutan&strength=60')
    await expect(page.locator('.frame')).toHaveCount(2)
    await expect(frameEl(page, 0)).not.toHaveAttribute('data-vision', /.+/)
    await expect(frameEl(page, 1)).toHaveAttribute('data-vision', 'deutan')
    await expect(page.locator('.frame-vision-tag')).toHaveText('deutan · 60%')
    await expect(page.getByRole('button', { name: 'edit frame A' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a plain theme link still opens one frame, and an unknown vision is ignored', async ({ page }) => {
    await stubTheme(page)
    await page.goto('/#t_abcdefghijkl&vision=mauve')
    await expect(page.locator('.preview-root').first()).toBeVisible()
    await expect(page.locator('.frame')).toHaveCount(1)
    await expect(frameEl(page)).not.toHaveAttribute('data-vision', /.+/)
  })

  test('the marketing menu opens on the frame\'s filtered layer, in place', async ({ page }) => {
    await boot(page)
    await page.locator('.frame-mockup').first().selectOption('marketing')
    await expect(page.locator('.mkt-hero').first()).toBeVisible()
    await page.keyboard.press('v')
    await expect(frameEl(page)).toHaveAttribute('data-vision', 'protan')

    const trigger = page.locator('.mkt-product-trigger')
    await trigger.click()
    const menu = page.locator('.mkt-product-menu')
    await expect(menu).toBeVisible()
    // portaled onto the layer carrying frame A's filter, not bare onto <body>
    expect(
      await menu.evaluate((el) => (el.closest('.portal-layer') as HTMLElement | null)?.style.filter ?? null),
    ).toBe('url("#vision-a")')
    const t = (await trigger.boundingBox())!
    const m = (await menu.boundingBox())!
    expect(Math.abs(m.x - t.x)).toBeLessThan(4)
    expect(m.y).toBeGreaterThan(t.y + t.height - 2)
    expect(m.y - (t.y + t.height)).toBeLessThan(16)
  })

  test('a select aligned to its trigger opens where it would with no filter', async ({ page }) => {
    // Base UI places this popup with position: fixed. Inside a filtered
    // element it would be offset by that element's position on screen.
    await boot(page)
    await page.locator('.frame-mockup').first().selectOption('analytics')
    const trigger = page.locator('.an-segment').first()
    await expect(trigger).toBeVisible()
    const listboxAt = async () => {
      await trigger.click()
      const box = (await page.getByRole('listbox').boundingBox())!
      await page.keyboard.press('Escape')
      await expect(page.getByRole('listbox')).toHaveCount(0)
      return box
    }
    const plain = await listboxAt()
    await page.keyboard.press('v')
    await expect(frameEl(page)).toHaveAttribute('data-vision', 'protan')
    const simulated = await listboxAt()
    expect(Math.abs(simulated.x - plain.x)).toBeLessThan(1)
    expect(Math.abs(simulated.y - plain.y)).toBeLessThan(1)
  })
})
