/**
 * Page settings: the preview's corners and type.
 *
 * These are VIEW state, like the vision simulation, not theme state. They
 * change how the mockups are drawn, never which colours the engine solves, so
 * they stay out of the theme state, its id, the API and every export. They
 * ride the share link (`#t_…&radius=4&font=tinos`, read in visionLink.ts) and
 * are global: both frames of a split show the same page.
 *
 * Kept free of imports so scripts/font-specimens.mjs can read the font table
 * with Node's own type stripping. That script also holds where each face's
 * dropdown specimen is cut from, which the app never needs.
 */

/** Corners, in px. 0 is sharp; 20 (1.25rem) is round. */
export const RADIUS_MIN = 0
export const RADIUS_MAX = 20
/** shadcn's `--radius: 0.625rem` (index.css), i.e. today's look. The slider's detent. */
export const RADIUS_DEFAULT = 10

export type PageFontGroup = 'interface' | 'character' | 'serif' | 'mono'

export interface PageFont {
  id: string
  /** The name the dropdown shows, set in the face itself. */
  name: string
  /** What the face is for, in a few words. */
  use: string
  group: PageFontGroup
  /** The CSS font-family stack for body text and headings alike. */
  stack: string
  /** Body weight. Arimo and Barlow Condensed sit at 500, the rest at 400. */
  weight: number
  /**
   * Heading weight, baked into the pairing rather than offered as a dial
   * (Material's "emphasized" lesson: the same face, heavier, is the signal).
   */
  headingWeight: number
  /** The licence the font files ship under (each package's LICENSE). */
  licence: 'OFL-1.1' | 'Apache-2.0' | null
}

const SANS = 'ui-sans-serif, system-ui, sans-serif'
const SERIF = 'ui-serif, Georgia, serif'

/**
 * The approved list (2026-10-03), in the dropdown's order. Every font is
 * self-hosted from @fontsource and fetched only when picked; no request ever
 * goes to Google.
 *
 * Licences, read from each package's LICENSE file: SIL Open Font License 1.1
 * for all of them except Roboto Slab (Apache 2.0). Arimo and Tinos were
 * Apache 2.0 as the Chrome OS core fonts; the current upstream releases that
 * @fontsource ships are OFL 1.1.
 *
 * `system` is the default and is today's look exactly: the frame's system
 * stack for body text with card and dialog titles in Geist (`.font-heading`
 * compiles to `var(--font-sans)`, which is Geist at :root). It injects
 * nothing, which is what keeps the visual-parity PNGs unchanged. Every other
 * pairing is one face for both, with a heavier heading.
 */
export const PAGE_FONTS: readonly PageFont[] = [
  { id: 'system', name: 'System UI', use: 'native interface', group: 'interface', stack: `ui-sans-serif, system-ui, -apple-system, sans-serif`, weight: 400, headingWeight: 500, licence: null },
  { id: 'geist', name: 'Geist', use: 'product UI', group: 'interface', stack: `'Geist Variable', ${SANS}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'inter', name: 'Inter', use: 'interface workhorse', group: 'interface', stack: `'Inter Variable', ${SANS}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'arimo', name: 'Arimo', use: 'sturdy, Arial-class', group: 'interface', stack: `'Arimo Variable', Arial, ${SANS}`, weight: 500, headingWeight: 700, licence: 'OFL-1.1' },
  { id: 'plex', name: 'IBM Plex Sans', use: 'corporate', group: 'interface', stack: `'IBM Plex Sans Variable', ${SANS}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'source-sans', name: 'Source Sans 3', use: 'humanist, warm', group: 'interface', stack: `'Source Sans 3 Variable', ${SANS}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', use: 'max legibility', group: 'interface', stack: `'Atkinson Hyperlegible', ${SANS}`, weight: 400, headingWeight: 700, licence: 'OFL-1.1' },
  { id: 'nunito', name: 'Nunito', use: 'rounded, friendly', group: 'character', stack: `'Nunito Variable', ${SANS}`, weight: 400, headingWeight: 700, licence: 'OFL-1.1' },
  { id: 'outfit', name: 'Outfit', use: 'geometric', group: 'character', stack: `'Outfit Variable', ${SANS}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'space-grotesk', name: 'Space Grotesk', use: 'technical', group: 'character', stack: `'Space Grotesk Variable', ${SANS}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'barlow', name: 'Barlow Condensed', use: 'condensed display', group: 'character', stack: `'Barlow Condensed', ${SANS}`, weight: 500, headingWeight: 700, licence: 'OFL-1.1' },
  { id: 'tinos', name: 'Tinos', use: 'newspaper, TNR-class', group: 'serif', stack: `'Tinos', 'Times New Roman', ${SERIF}`, weight: 400, headingWeight: 700, licence: 'OFL-1.1' },
  { id: 'source-serif', name: 'Source Serif 4', use: 'editorial reading', group: 'serif', stack: `'Source Serif 4 Variable', ${SERIF}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'playfair', name: 'Playfair Display', use: 'headline, high contrast', group: 'serif', stack: `'Playfair Display Variable', ${SERIF}`, weight: 400, headingWeight: 700, licence: 'OFL-1.1' },
  { id: 'fraunces', name: 'Fraunces', use: 'soft display', group: 'serif', stack: `'Fraunces Variable', ${SERIF}`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
  { id: 'roboto-slab', name: 'Roboto Slab', use: 'slab', group: 'serif', stack: `'Roboto Slab Variable', ${SERIF}`, weight: 400, headingWeight: 600, licence: 'Apache-2.0' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', use: 'code, dev tools', group: 'mono', stack: `'JetBrains Mono Variable', ui-monospace, monospace`, weight: 400, headingWeight: 600, licence: 'OFL-1.1' },
]

export const FONT_DEFAULT = 'system'

export const isPageFontId = (s: string): boolean => PAGE_FONTS.some((f) => f.id === s)
export const pageFontById = (id: string): PageFont => PAGE_FONTS.find((f) => f.id === id) ?? PAGE_FONTS[0]

export interface PageSettings {
  /** px, RADIUS_MIN..RADIUS_MAX */
  radius: number
  /** a PAGE_FONTS id */
  font: string
}

export const DEFAULT_PAGE: PageSettings = { radius: RADIUS_DEFAULT, font: FONT_DEFAULT }

export const clampRadius = (px: number): number => Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(px)))

/**
 * Read `radius=` and `font=` from a share link's parameters. Like `vision=`,
 * a value we can't read is dropped (that setting stays at its default) and
 * the theme still opens. A radius outside the slider is clamped onto it.
 */
export function parsePageParams(params: URLSearchParams): Partial<PageSettings> {
  const page: Partial<PageSettings> = {}
  const r = params.get('radius')
  if (r !== null && r.trim() !== '') {
    const px = Number(r)
    if (Number.isFinite(px)) page.radius = clampRadius(px)
  }
  const f = params.get('font')
  if (f !== null && isPageFontId(f)) page.font = f
  return page
}

/**
 * The share-link params for these settings, `{ radius: '4', font: 'tinos' }`,
 * or `{}` at the defaults, so a default link stays exactly `#t_…`. The Export
 * dialog's share link merges these after the vision params.
 */
export function pageLinkParams(page: PageSettings): Record<string, string> {
  const p: Record<string, string> = {}
  if (page.radius !== RADIUS_DEFAULT) p.radius = String(page.radius)
  if (page.font !== FONT_DEFAULT) p.font = page.font
  return p
}

/** The same params as a hash suffix: `&radius=4&font=tinos`, or `''`. */
export function pageParams(page: PageSettings): string {
  return Object.entries(pageLinkParams(page))
    .map(([k, v]) => `&${k}=${v}`)
    .join('')
}

/**
 * What the preview spreads into its `style`, beside the tokens, on the
 * mockup's root AND on every portalled menu and dialog (they carry the same
 * object, which is how they get the tokens at all).
 *
 * Empty at the defaults: nothing is injected, so today's look holds to the
 * pixel. Keys starting `--` are custom properties; `fontFamily` and
 * `fontWeight` are ordinary React style keys, because a portal is not inside
 * `.frame` and has no other way to learn the body face.
 */
export function pageVars(page: PageSettings): Record<string, string> {
  const v: Record<string, string> = {}
  if (page.radius !== RADIUS_DEFAULT) v['--radius'] = `${page.radius}px`
  const f = pageFontById(page.font)
  if (f.id !== FONT_DEFAULT) {
    // `.font-heading` compiles to `var(--font-sans)` (index.css's @theme
    // inline), so in the preview --font-sans IS the heading hook.
    v['--font-sans'] = f.stack
    v['--font-heading'] = f.stack
    v['--font-heading-weight'] = String(f.headingWeight)
    v.fontFamily = f.stack
    if (f.weight !== 400) v.fontWeight = String(f.weight)
  }
  return v
}

/**
 * Fetch a face's files. One lazy chunk per font (its @fontsource CSS and the
 * woff2 files it points at), so none of this is in the main bundle; the
 * per-script files then load only for glyphs the page actually uses
 * (unicode-range). Waits for the latin file so the preview swaps once,
 * straight from the old face to the new one, with no fallback flash.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  system: async () => {},
  geist: async () => {}, // the chrome's own face, already loaded
  inter: () => import('@fontsource-variable/inter'),
  arimo: () => import('@fontsource-variable/arimo'),
  plex: () => import('@fontsource-variable/ibm-plex-sans'),
  'source-sans': () => import('@fontsource-variable/source-sans-3'),
  atkinson: () => Promise.all([import('@fontsource/atkinson-hyperlegible/400.css'), import('@fontsource/atkinson-hyperlegible/700.css')]),
  nunito: () => import('@fontsource-variable/nunito'),
  outfit: () => import('@fontsource-variable/outfit'),
  'space-grotesk': () => import('@fontsource-variable/space-grotesk'),
  barlow: () => Promise.all([import('@fontsource/barlow-condensed/500.css'), import('@fontsource/barlow-condensed/700.css')]),
  tinos: () => Promise.all([import('@fontsource/tinos/400.css'), import('@fontsource/tinos/700.css')]),
  'source-serif': () => import('@fontsource-variable/source-serif-4'),
  playfair: () => import('@fontsource-variable/playfair-display'),
  fraunces: () => import('@fontsource-variable/fraunces'),
  'roboto-slab': () => import('@fontsource-variable/roboto-slab'),
  'jetbrains-mono': () => import('@fontsource-variable/jetbrains-mono'),
}

export async function loadPageFont(id: string): Promise<void> {
  const f = pageFontById(id)
  await LOADERS[f.id]?.()
  if (f.id === FONT_DEFAULT || f.id === 'geist' || typeof document === 'undefined' || !document.fonts) return
  const family = f.stack.split(',')[0]
  try {
    await Promise.all([
      document.fonts.load(`${f.weight} 16px ${family}`),
      document.fonts.load(`${f.headingWeight} 16px ${family}`),
    ])
  } catch {
    // The fallback stack still renders; never block the pick on a font file.
  }
}
