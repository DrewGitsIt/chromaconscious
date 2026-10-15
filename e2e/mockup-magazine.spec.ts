import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * The magazine is print: no controls to prove real. What it promises is
 * honesty, so that is what these check, in the real browser where layout and
 * computed colour exist:
 *
 * - every piece of text sits on a surface whose pair the contrast report
 *   checks (engine/tokens.ts TEXT_PAIRS), and never on a photograph;
 * - every photograph is mapped through tokens, so it follows the theme, the
 *   mode and locate mode;
 * - corners and face follow the theme.
 */

/** The report's checked text pairs that can appear as a surface + its text. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['secondary-foreground', 'secondary'],
  ['primary-foreground', 'primary'],
  ['accent-foreground', 'accent'],
  ['muted-foreground', 'muted'],
  ['link', 'background'],
  ['link', 'card'],
]

const boot = async (page: Page, preset = 'Terracotta') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption('magazine')
  await expect(page.locator('.mag-spread')).toHaveCount(5)
}

/** Put frame A in a mode. Frames open dark; the toggle names the mode it goes to. */
const setMode = async (page: Page, mode: 'light' | 'dark') => {
  const toggle = page.getByRole('button', { name: /switch frame A to (dark|light)/ })
  const now = (await toggle.getAttribute('aria-label'))!.includes('to dark') ? 'light' : 'dark'
  if (now !== mode) await toggle.click()
  await expect(page.getByRole('button', { name: `switch frame A to ${mode === 'dark' ? 'light' : 'dark'}` })).toBeVisible()
}

/**
 * Every element that owns text, as [its colour's token names, its surface's
 * token names, whether a photograph lies under it]. Token names, not values:
 * two tokens can share a value, and a pair passes if any naming of it is a
 * checked pair.
 */
const textOnSurfaces = (page: Page) =>
  page
    .locator('.mag')
    .first()
    .evaluate((root) => {
      const cs = getComputedStyle(root)
      const probe = document.createElement('i')
      root.append(probe)
      // token value -> names, compared as the browser computes colours
      const names = new Map<string, string[]>()
      for (const prop of Array.from(cs)) {
        if (!prop.startsWith('--')) continue
        probe.style.color = `var(${prop})`
        const c = getComputedStyle(probe).color
        if (!c || !cs.getPropertyValue(prop).trim().startsWith('#')) continue
        names.set(c, [...(names.get(c) ?? []), prop.slice(2)])
      }
      probe.remove()
      const photos = Array.from(root.querySelectorAll('.mag-photo'))
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const out: Array<{ text: string; fg: string[]; bg: string[]; onPhoto: boolean }> = []
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())
        if (!own) continue
        let surface: HTMLElement | null = el
        while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement
        if (!surface) continue
        const box = el.getBoundingClientRect()
        // A photograph inside the surface, under this text, means the text is on the photo.
        const onPhoto = photos.some((p) => surface!.contains(p) && !p.contains(el) && overlaps(p.getBoundingClientRect(), box))
        out.push({
          text: el.textContent!.trim().slice(0, 40),
          fg: names.get(getComputedStyle(el).color) ?? [],
          bg: names.get(getComputedStyle(surface).backgroundColor) ?? [],
          onPhoto,
        })
      }
      return out
    })

/** One photograph's filter: the stops it names, and its R channel's table. */
const filterOf = (page: Page, n: number) =>
  page
    .locator('.mag filter')
    .nth(n)
    .evaluate((f) => ({
      stops: f.getAttribute('data-stops')!.split(' '),
      red: f.querySelector('feFuncR[type="table"]')!.getAttribute('tableValues')!,
    }))

test.describe('magazine mockup', () => {
  for (const [preset, mode] of [
    ['Terracotta', 'light'],
    ['Neon arcade', 'dark'],
    ['Ink & sky', 'light'],
  ] as const) {
    test(`${preset} ${mode}: every text sits on a checked pair, never on a photograph`, async ({ page }) => {
      await boot(page, preset)
      await setMode(page, mode)
      const texts = await textOnSurfaces(page)
      expect(texts.length).toBeGreaterThan(60)
      for (const t of texts) {
        expect(t.onPhoto, `"${t.text}" sits on a photograph`).toBe(false)
        const ok = TEXT_PAIRS.some(([f, b]) => t.fg.includes(f) && t.bg.includes(b))
        expect(ok, `"${t.text}" is ${t.fg.join('|') || '?'} on ${t.bg.join('|') || '?'}`).toBe(true)
      }
    })
  }

  test('every photograph is mapped through tokens, and locate mode dims it', async ({ page }) => {
    await boot(page)
    await setMode(page, 'light')
    const count = await page.locator('.mag filter').count()
    expect(count).toBe(6)
    // the stops are token names, and their channels are the tokens' own
    const cover = await filterOf(page, 0)
    expect(cover.stops).toEqual(['foreground', 'primary', 'background'])
    const red = await page
      .locator('.preview-root')
      .first()
      .evaluate((el, stops) => stops.map((t) => parseInt(getComputedStyle(el).getPropertyValue(`--${t}`).trim().slice(1, 3), 16) / 255), cover.stops)
    expect(cover.red.split(' ').map(Number)).toEqual(red.map((v) => Number(v.toFixed(4))))

    // locate the accent: the cover's primary stop is not the accent's, so it dims
    await page.locator('.rb-slot[data-role="accent"]').hover()
    await expect.poll(async () => (await filterOf(page, 0)).red).not.toBe(cover.red)
    await page.mouse.move(0, 0)
    await expect.poll(async () => (await filterOf(page, 0)).red).toBe(cover.red)
  })

  test('a dark theme never prints a photograph as a negative', async ({ page }) => {
    await boot(page)
    await setMode(page, 'dark')
    await expect.poll(async () => {
      const t = (await filterOf(page, 0)).red.split(' ').map(Number)
      return t[0] <= t[t.length - 1]
    }).toBe(true)
  })

  test('corners and face follow the theme; the masthead fills its page in any face', async ({ page }) => {
    await boot(page)
    await page.getByRole('slider', { name: 'corners' }).fill('0')
    const radius = () => page.locator('.mag-plate').first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
    await expect.poll(radius).toBe('0px')

    const fill = () =>
      page.locator('.mag-mast').first().evaluate((el) => {
        const page = el.parentElement!
        const room = page.clientWidth - 2 * parseFloat(getComputedStyle(page).paddingLeft)
        return Math.abs(el.scrollWidth - room) / room
      })
    expect(await fill()).toBeLessThan(0.02)
    await page.locator('.pg-font').click()
    await page.getByRole('option', { name: /Barlow Condensed/ }).click()
    await expect
      .poll(() => page.locator('.mag-mast').first().evaluate((el) => getComputedStyle(el).fontFamily))
      .toMatch(/^"?Barlow Condensed/)
    await expect.poll(fill).toBeLessThan(0.02)
  })
})
