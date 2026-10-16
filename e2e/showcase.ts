import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * What the showcase mockups (magazine, trail app, posters, shop) share in
 * their specs: the honesty walk. Each mockup keeps two promises the app
 * mockups get for free from shadcn's pairs, and these check them in the real
 * browser, where layout and computed colour exist.
 */

/** The report's checked text pairs (engine/tokens.ts TEXT_PAIRS, gate 'text'). */
export const TEXT_PAIRS: Array<[string, string]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['secondary-foreground', 'secondary'],
  ['primary-foreground', 'primary'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive-subtle-foreground', 'destructive-subtle'],
  ['success-foreground', 'success'],
  ['success-subtle-foreground', 'success-subtle'],
  ['warning-foreground', 'warning'],
  ['warning-subtle-foreground', 'warning-subtle'],
  ['link', 'background'],
  ['link', 'card'],
  ['link', 'success-subtle'],
]

/** Put frame A in a mode. Frames open dark; the toggle names the mode it goes to. */
export const setMode = async (page: Page, mode: 'light' | 'dark') => {
  const toggle = page.getByRole('button', { name: /switch frame A to (dark|light)/ })
  const now = (await toggle.getAttribute('aria-label'))!.includes('to dark') ? 'light' : 'dark'
  if (now !== mode) await toggle.click()
  await expect(
    page.getByRole('button', { name: `switch frame A to ${mode === 'dark' ? 'light' : 'dark'}` }),
  ).toBeVisible()
}

/**
 * The theme's colours under `root`, as [computed colour, token names]. Read
 * it with the budget on full: under a smaller budget the root's variables are
 * substituted, and a substituted pair would name itself a checked pair.
 */
export const tokenNames = (page: Page, root: string) =>
  page
    .locator(root)
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
      return Array.from(names.entries())
    })

/**
 * Every element under `root` that owns text, as [its colour's token names, its
 * surface's token names, whether art lies under it]. Art is a recoloured
 * photograph (`.token-photo`) or a drawn shape (`.showcase-art`): neither is a
 * surface the report checks. Token names, not values: two tokens can share a
 * value, and a pair passes if any naming of it is a checked pair.
 */
export const textOnSurfaces = async (page: Page, root: string, known?: Array<[string, string[]]>) =>
  page
    .locator(root)
    .first()
    .evaluate(
      (root, known) => {
        // token value -> names, compared as the browser computes colours
        const names = new Map<string, string[]>(known)
        const art = Array.from(root.querySelectorAll('.token-photo, .showcase-art'))
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
        const out: Array<{ text: string; fg: string[]; bg: string[]; fgRgb: string; bgRgb: string; onArt: boolean }> =
          []
        for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
          const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())
          if (!own) continue
          const box = el.getBoundingClientRect()
          if (box.width === 0 || box.height === 0) continue
          let surface: HTMLElement | null = el
          while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)')
            surface = surface.parentElement
          if (!surface) continue
          // Art inside the surface, under this text, means the text is on the art.
          const onArt = art.some(
            (p) => surface!.contains(p) && !p.contains(el) && overlaps(p.getBoundingClientRect(), box),
          )
          const fgRgb = getComputedStyle(el).color
          const bgRgb = getComputedStyle(surface).backgroundColor
          out.push({
            text: el.textContent!.trim().slice(0, 40),
            fg: names.get(fgRgb) ?? [],
            bg: names.get(bgRgb) ?? [],
            fgRgb,
            bgRgb,
            onArt,
          })
        }
        return out
      },
      known ?? (await tokenNames(page, root)),
    )

/** WCAG 2.x contrast between two rgb() strings. */
const wcag = (a: string, b: string) => {
  const lum = (c: string) => {
    const ch = c
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((x) => {
        const s = Number(x) / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Fail on any text that isn't a checked pair, or that sits on art. One more
 * pair is allowed, and only where `reversedEnds` says so (the ink budget):
 * background text on a foreground surface, the report's own pair reversed.
 * Same two colours, so it is held to the report's own text floor here.
 */
export const expectHonest = (
  texts: Awaited<ReturnType<typeof textOnSurfaces>>,
  min: number,
  { reversedEnds = false } = {},
) => {
  expect(texts.length).toBeGreaterThan(min)
  for (const t of texts) {
    expect(t.onArt, `"${t.text}" sits on art`).toBe(false)
    const checked = TEXT_PAIRS.some(([f, b]) => t.fg.includes(f) && t.bg.includes(b))
    const reversed = reversedEnds && t.fg.includes('background') && t.bg.includes('foreground')
    expect(checked || reversed, `"${t.text}" is ${t.fg.join('|') || '?'} on ${t.bg.join('|') || '?'}`).toBe(true)
    if (reversed) expect(wcag(t.fgRgb, t.bgRgb), `"${t.text}" reversed ends`).toBeGreaterThanOrEqual(4.5)
  }
}

/** Set frame A's colour budget. */
export const setBudget = async (page: Page, budget: 'ink' | 'brand' | 'full') => {
  const radio = page.getByRole('radiogroup', { name: 'colour budget for frame A' }).getByRole('radio', { name: budget })
  await radio.click()
  await expect(radio).toHaveAttribute('aria-checked', 'true')
}
