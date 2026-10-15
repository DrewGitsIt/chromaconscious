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
  await expect(page.getByRole('button', { name: `switch frame A to ${mode === 'dark' ? 'light' : 'dark'}` })).toBeVisible()
}

/**
 * Every element under `root` that owns text, as [its colour's token names, its
 * surface's token names, whether art lies under it]. Art is a recoloured
 * photograph (`.token-photo`) or a drawn shape (`.showcase-art`): neither is a
 * surface the report checks. Token names, not values: two tokens can share a
 * value, and a pair passes if any naming of it is a checked pair.
 */
export const textOnSurfaces = (page: Page, root: string) =>
  page
    .locator(root)
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
      const art = Array.from(root.querySelectorAll('.token-photo, .showcase-art'))
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const out: Array<{ text: string; fg: string[]; bg: string[]; onArt: boolean }> = []
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())
        if (!own) continue
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        let surface: HTMLElement | null = el
        while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement
        if (!surface) continue
        // Art inside the surface, under this text, means the text is on the art.
        const onArt = art.some((p) => surface!.contains(p) && !p.contains(el) && overlaps(p.getBoundingClientRect(), box))
        out.push({
          text: el.textContent!.trim().slice(0, 40),
          fg: names.get(getComputedStyle(el).color) ?? [],
          bg: names.get(getComputedStyle(surface).backgroundColor) ?? [],
          onArt,
        })
      }
      return out
    })

/** Fail on any text that isn't a checked pair, or that sits on art. */
export const expectHonest = (texts: Awaited<ReturnType<typeof textOnSurfaces>>, min: number) => {
  expect(texts.length).toBeGreaterThan(min)
  for (const t of texts) {
    expect(t.onArt, `"${t.text}" sits on art`).toBe(false)
    const ok = TEXT_PAIRS.some(([f, b]) => t.fg.includes(f) && t.bg.includes(b))
    expect(ok, `"${t.text}" is ${t.fg.join('|') || '?'} on ${t.bg.join('|') || '?'}`).toBe(true)
  }
}
