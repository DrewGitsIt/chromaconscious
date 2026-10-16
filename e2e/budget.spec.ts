import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectHonest, setBudget, setMode, textOnSurfaces, tokenNames } from './showcase'

/**
 * The colour budget (src/budget.ts): view state on the showcase mockups that
 * limits which of the palette's colours a composition spends. These check it
 * is offered only where it means something, that it spends what it says,
 * that every text stays on a checked pair under it, and that the theme
 * itself (its id, so its exports) never changes.
 */

const SHOWCASE: Array<[id: string, root: string, min: number]> = [
  ['magazine', '.mag', 60],
  ['trail', '.trl', 50],
  ['shop', '.shp', 40],
  ['posters', '.pst', 25],
]

/** The neutral role's tokens: all that ink may spend. */
const NEUTRAL = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'border',
  'input',
]

const boot = async (page: Page, mockup: string, preset = 'Terracotta') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption(mockup)
}

const budgetGroup = (page: Page) => page.getByRole('radiogroup', { name: 'colour budget for frame A' })

test.describe('colour budget', () => {
  test('only the showcase mockups offer it, and it opens on full', async ({ page }) => {
    await boot(page, 'app')
    await expect(budgetGroup(page)).toHaveCount(0)
    for (const [id] of SHOWCASE) {
      await page.locator('.frame-mockup').first().selectOption(id)
      await expect(budgetGroup(page).getByRole('radio', { name: 'full' })).toHaveAttribute('aria-checked', 'true')
    }
  })

  for (const [id, root, min] of SHOWCASE)
    for (const mode of ['light', 'dark'] as const)
      test(`${id} ${mode}: every text stays on a checked pair under ink and brand`, async ({ page }) => {
        await boot(page, id, mode === 'dark' ? 'Neon arcade' : 'Terracotta')
        await setMode(page, mode)
        const names = await tokenNames(page, root)
        for (const budget of ['brand', 'ink'] as const) {
          await setBudget(page, budget)
          expectHonest(await textOnSurfaces(page, root, names), min, { reversedEnds: budget === 'ink' })
        }
      })

  test('the posters spend what the budget says', async ({ page }) => {
    await boot(page, 'posters')
    await setMode(page, 'light')
    const names = new Map(await tokenNames(page, '.pst'))
    const inks = () =>
      page
        .locator('.pst-art')
        .evaluateAll((svgs) =>
          svgs.flatMap((svg) =>
            Array.from(svg.querySelectorAll('rect, path, circle')).map((s) => getComputedStyle(s).fill),
          ),
        )
    const spent = async () => new Set((await inks()).flatMap((c) => names.get(c) ?? ['?']))
    const full = await spent()
    expect([...full].some((n) => n.startsWith('accent'))).toBe(true)

    await setBudget(page, 'brand')
    for (const c of await inks()) {
      const n = names.get(c) ?? []
      expect(
        n.some((t) => NEUTRAL.includes(t) || t === 'primary'),
        `${c} is ${n.join('|')}`,
      ).toBe(true)
    }
    await setBudget(page, 'ink')
    for (const c of await inks()) {
      const n = names.get(c) ?? []
      expect(
        n.some((t) => NEUTRAL.includes(t)),
        `${c} is ${n.join('|')}`,
      ).toBe(true)
    }
  })

  test('a photograph keeps its middle tone under every budget', async ({ page }) => {
    await boot(page, 'magazine')
    await setMode(page, 'light')
    const cover = () =>
      page
        .locator('.mag filter')
        .first()
        .evaluate((f) => ({
          stops: f.getAttribute('data-stops'),
          red: f.querySelector('feFuncR[type="table"]')!.getAttribute('tableValues')!.split(' ').map(Number),
        }))
    // the stairwell asks for foreground → link → background
    const stairs = () => page.locator('.mag filter[id^="mag-stairwell"]').evaluate((f) => f.getAttribute('data-stops'))
    expect(await stairs()).toBe('foreground link background')
    await setBudget(page, 'brand')
    // brand trades the accent's tone for the primary's, not the ink's
    expect(await stairs()).toBe('foreground primary background')
    await setBudget(page, 'ink')
    // ink drops the stop that would land on its neighbour: no flat run of ink
    expect(await stairs()).toBe('foreground background')
    const { stops, red } = await cover()
    expect(stops).toBe('foreground background')
    expect(new Set(red).size).toBe(red.length)
  })

  test('the shop offers three finishes a budget can tell apart', async ({ page }) => {
    await boot(page, 'shop')
    for (const budget of ['full', 'brand', 'ink'] as const)
      for (const mode of ['light', 'dark'] as const) {
        await setMode(page, mode)
        await setBudget(page, budget)
        const swatches = await page
          .locator('.shp-swatch i')
          .evaluateAll((is) => is.map((i) => getComputedStyle(i).backgroundColor))
        expect(swatches, `${budget} ${mode}`).toHaveLength(3)
        expect(new Set(swatches).size, `${budget} ${mode}: ${swatches.join(' ')}`).toBe(3)
        // the legend names a finish that is on offer
        const name = await page.locator('.shp-finish legend b').textContent()
        await expect(page.getByRole('radio', { name: name! })).toBeChecked()
      }
  })

  test('every poster tile keeps its figure off its ground, and the grid off the page', async ({ page }) => {
    await boot(page, 'posters')
    for (const budget of ['full', 'brand', 'ink'] as const)
      for (const mode of ['light', 'dark'] as const) {
        await setMode(page, mode)
        await setBudget(page, budget)
        const tiles = await page
          .locator('.pst-art')
          .first()
          .evaluate((svg) => {
            const page = getComputedStyle(svg.closest('.pst-poster')!).backgroundColor
            return Array.from(svg.querySelectorAll(':scope > g')).map((g) => {
              const [ground, ...figure] = Array.from(g.children).map((c) => getComputedStyle(c).fill)
              return { ground, figure: figure[0], page }
            })
          })
        for (const t of tiles) expect(t.figure, `${budget} ${mode}`).not.toBe(t.ground)
        if (budget !== 'full')
          expect(tiles.filter((t) => t.ground === t.page).length, `${budget} ${mode}: tiles in the page colour`).toBe(0)
      }
  })

  test('the budget is view state: the theme, so its id and exports, never change', async ({ page }) => {
    await boot(page, 'shop')
    const themeId = async () => {
      await page.locator('.sidebar-shell').getByRole('button', { name: 'Export' }).click()
      const id = page.getByRole('dialog', { name: 'Export' }).locator('.xd-id')
      await expect(id).toHaveText(/^t_[a-z2-7]{12}$/)
      const text = await id.textContent()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Export' })).toHaveCount(0)
      return text
    }
    const before = await themeId()
    await setBudget(page, 'ink')
    expect(await themeId()).toBe(before)
    // and the frame keeps it across another mockup and back
    await page.locator('.frame-mockup').first().selectOption('posters')
    await expect(budgetGroup(page).getByRole('radio', { name: 'ink' })).toHaveAttribute('aria-checked', 'true')
  })
})
