/**
 * A colour budget: how many of the palette's colours a showcase composition
 * spends. View state, like a frame's mode: the theme, its exports and its
 * contrast report never see it.
 *
 * - full: everything the theme has.
 * - brand: the primary and the neutrals; the accent is not spent.
 * - ink: the neutrals alone, ink and paper; primary is not spent either.
 *
 * Done by token substitution, as locate mode is: a token the budget doesn't
 * spend reads another token's value instead. Recoloured photographs and
 * drawn art follow for free, because both are drawn from tokens.
 *
 * Substitution moves pairs as pairs, so text stays on a pair the report
 * checks: an accent surface and its text become secondary and its text; a
 * primary surface and its text, under ink, become foreground with background
 * text. That last one is the report's foreground/background pair reversed:
 * the same two colours, so the same WCAG ratio. Where a pair lands off the
 * report's list (link on a status tint reads the ink), it still clears that
 * row's floor; budget.test.ts holds every row to it. Status colours (success,
 * warning, destructive) mean something, so no budget takes them away.
 */
export type Budget = 'ink' | 'brand' | 'full'

export const BUDGETS: Array<{ id: Budget; hint: string }> = [
  { id: 'ink', hint: 'neutrals only, ink and paper' },
  { id: 'brand', hint: 'the primary and the neutrals' },
  { id: 'full', hint: 'every colour in the theme' },
]

/** Under brand: the accent's tokens read the primary's, or a neutral's. */
const BRAND: Record<string, string> = {
  accent: 'secondary',
  'accent-foreground': 'secondary-foreground',
  'accent-strong': 'primary',
  link: 'foreground',
  ring: 'primary',
  'sidebar-accent': 'secondary',
  'sidebar-accent-foreground': 'secondary-foreground',
  'sidebar-ring': 'primary',
  'chart-1': 'primary',
  'chart-2': 'primary',
  'chart-3': 'primary',
  'chart-4': 'primary',
  'chart-5': 'primary',
}

/** Under ink: whatever brand sent to the primary goes to the ink instead. */
const INK: Record<string, string> = {
  ...Object.fromEntries(Object.entries(BRAND).map(([k, v]) => [k, v === 'primary' ? 'foreground' : v])),
  primary: 'foreground',
  'primary-foreground': 'background',
  'sidebar-primary': 'foreground',
  'sidebar-primary-foreground': 'background',
}

export const BUDGET_MAP: Record<Budget, Record<string, string>> = { full: {}, brand: BRAND, ink: INK }

/** The token set a budget spends. Reads the unsubstituted values, so order never matters. */
export function spendBudget(tokens: Record<string, string>, budget: Budget): Record<string, string> {
  const map = BUDGET_MAP[budget]
  if (!Object.keys(map).length) return tokens
  return Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, map[k] && tokens[map[k]] ? tokens[map[k]] : v]))
}

/**
 * A photograph's gradient-map stops under a budget. Not the text map: a stop
 * is a tone, not a pair, so under brand an accent stop takes the primary
 * (the colour brand still spends) rather than the ink. A stop that lands on
 * its neighbour is dropped, so the ramp keeps its middle: [ink, ink, paper]
 * would print every shadow and mid-tone as solid ink.
 */
export function photoStops(stops: string[], budget: Budget): string[] {
  const hue: Record<string, string> = budget === 'brand' ? { link: 'primary' } : {}
  const out = stops.map((s) => hue[s] ?? BUDGET_MAP[budget][s] ?? s)
  return out.filter((s, i) => i === 0 || s !== out[i - 1])
}

/**
 * The inks a budget gives generated art, each a token that budget leaves
 * alone, so distinct names stay distinct colours. Full is the art as first
 * drawn. Brand and ink trade what they don't spend for steps of the neutral
 * ramp, and list their lead colour twice so it leads the composition: the
 * primary under brand, the ink under ink. Neither uses the page's own
 * background: with the accent tints gone, a tile in it would merge with the
 * poster and break the grid's edge.
 */
export const ART_INKS: Record<Budget, string[]> = {
  full: ['primary', 'accent-strong', 'link', 'foreground', 'accent', 'background'],
  brand: ['primary', 'primary', 'foreground', 'muted-foreground', 'border'],
  ink: ['foreground', 'foreground', 'muted-foreground', 'border'],
}

/** The sun-and-bands poster's inks: its ground, the sun, and four bands, top down. */
export const BAND_INKS: Record<Budget, { ground: string; sun: string; bands: string[] }> = {
  full: { ground: 'accent', sun: 'primary', bands: ['accent-strong', 'link', 'primary', 'foreground'] },
  brand: { ground: 'secondary', sun: 'primary', bands: ['foreground', 'primary', 'muted-foreground', 'foreground'] },
  ink: { ground: 'secondary', sun: 'foreground', bands: ['muted-foreground', 'foreground', 'border', 'foreground'] },
}
