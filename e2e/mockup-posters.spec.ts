import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectHonest, setMode, textOnSurfaces } from './showcase'

/**
 * The concert posters: print, so no controls. What they promise is that the
 * art is the palette (every shape fills with a token, so locate mode reaches
 * it), the art is generated but fixed (a theme always gets the same poster),
 * and no text sits on art.
 */

const boot = async (page: Page, preset = 'Terracotta') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption('posters')
  await expect(page.locator('.pst-poster')).toHaveCount(3)
}

/** Every drawn shape's computed fill, as the token names that hold it. */
const artInks = (page: Page) =>
  page
    .locator('.pst')
    .first()
    .evaluate((root) => {
      const cs = getComputedStyle(root)
      const probe = document.createElement('i')
      root.append(probe)
      const names = new Map<string, string[]>()
      for (const prop of Array.from(cs)) {
        if (!prop.startsWith('--') || !cs.getPropertyValue(prop).trim().startsWith('#')) continue
        probe.style.color = `var(${prop})`
        const c = getComputedStyle(probe).color
        names.set(c, [...(names.get(c) ?? []), prop.slice(2)])
      }
      probe.remove()
      return Array.from(root.querySelectorAll('.pst-art rect, .pst-art path, .pst-art circle')).map(
        (s) => names.get(getComputedStyle(s).fill) ?? [],
      )
    })

test.describe('concert posters mockup', () => {
  for (const [preset, mode] of [
    ['Terracotta', 'light'],
    ['Neon arcade', 'dark'],
    ['Ink & sky', 'light'],
  ] as const) {
    test(`${preset} ${mode}: every text sits on a checked pair, never on art`, async ({ page }) => {
      await boot(page, preset)
      await setMode(page, mode)
      expectHonest(await textOnSurfaces(page, '.pst'), 25)
    })
  }

  test('every shape is filled with a token, and locate mode reaches it', async ({ page }) => {
    await boot(page)
    const inks = await artInks(page)
    expect(inks.length).toBeGreaterThan(20)
    for (const [i, names] of inks.entries()) expect(names.length, `shape ${i} fills with no token`).toBeGreaterThan(0)

    const fills = () => page.locator('.pst-art').first().evaluate((svg) =>
      Array.from(svg.querySelectorAll('rect, path, circle')).map((s) => getComputedStyle(s).fill).join(),
    )
    const lit = await fills()
    await page.locator('.rb-slot[data-role="neutral"]').hover()
    await expect.poll(fills).not.toBe(lit)
    await page.mouse.move(0, 0)
    await expect.poll(fills).toBe(lit)
  })

  test('the art is the same composition in every theme', async ({ page }) => {
    await boot(page, 'Terracotta')
    const drawn = () => page.locator('.pst-art').evaluateAll((svgs) => svgs.map((s) => s.innerHTML).join('|'))
    const first = await drawn()
    await boot(page, 'Ink & sky')
    expect(await drawn()).toBe(first)
  })
})
