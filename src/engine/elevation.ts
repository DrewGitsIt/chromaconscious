import type { Oklch, Separation, ShadowLayer, ThemeEffects } from './types'
import { toGamut, toHex } from './color'
import { converter } from 'culori'

/**
 * Elevation, derived from the neutral seed the theme already has — a shadow is
 * a colour decision, not a new input the user has to supply.
 *
 * Three things drive the shape of this file:
 *
 * 1. **A light-mode shadow is tinted, not black.** Pure black over a warm or
 *    cool theme reads dirty, so the shadow borrows the neutral's hue at low
 *    chroma and belongs to the palette like every other derived value.
 *    In DARK mode this is effectively moot and that is deliberate: the shadow
 *    sits at L .04, where sRGB has almost no room for chroma, so it resolves
 *    to near-black whatever the hue. A dark-mode shadow *should* be black —
 *    the lit top edge below, not the tint, is what does the separating there.
 *
 * 2. **Light and dark elevate by different physics.** Light mode has luminance
 *    headroom *below* the page, so a drop shadow does the work. Dark mode has
 *    almost none — page and card sit within a few hundredths of each other —
 *    so it leans on a lit top edge (an inset highlight), which is the one
 *    trick a drop shadow cannot perform.
 *
 * 3. **Separation is the border↔shadow balance**, not just lightness spacing.
 *    `flat` pays for separation with hairlines and has no level-1 shadow at
 *    all; `lifted` pays with shadow and lets the hairlines soften. That is why
 *    this module and the ladder deltas in `ramp.ts` read the same setting.
 */

/** [ambient, key] alpha per level. Level 1 is deliberately absent in `flat`. */
const ALPHA: Record<'light' | 'dark', Record<Separation, Record<1 | 2 | 3, [number, number]>>> = {
  light: {
    flat: { 1: [0, 0], 2: [0.03, 0.05], 3: [0.06, 0.13] },
    layered: { 1: [0.03, 0.045], 2: [0.05, 0.09], 3: [0.08, 0.18] },
    lifted: { 1: [0.045, 0.075], 2: [0.07, 0.16], 3: [0.1, 0.25] },
  },
  dark: {
    flat: { 1: [0, 0], 2: [0.2, 0.28], 3: [0.3, 0.45] },
    layered: { 1: [0.18, 0.26], 2: [0.28, 0.4], 3: [0.38, 0.55] },
    lifted: { 1: [0.24, 0.34], 2: [0.36, 0.52], 3: [0.46, 0.66] },
  },
}

/** [offsetY, blur, spread] per level — the key layer's geometry. */
const GEOMETRY: Record<1 | 2 | 3, [number, number, number]> = {
  1: [2, 6, -1],
  2: [8, 20, -6],
  3: [24, 48, -12],
}

/** Strength of dark mode's lit top edge. `flat` forgoes it along with shadow. */
const HIGHLIGHT: Record<Separation, number> = { flat: 0, layered: 0.045, lifted: 0.075 }

const LEVELS = [1, 2, 3] as const

/**
 * The shadow's own colour: the neutral's hue at low chroma, dark enough to
 * read as shade. Light mode can afford a slightly lighter, more chromatic
 * shadow because it sits on a bright page; dark mode goes nearly to black
 * because anything else turns into fog.
 */
function shadowColor(neutral: Oklch, mode: 'light' | 'dark'): string {
  return toHex(
    toGamut(
      mode === 'light'
        ? { l: 0.22, c: Math.min(neutral.c, 0.05), h: neutral.h }
        : { l: 0.04, c: Math.min(neutral.c, 0.04), h: neutral.h },
    ),
  )
}

export function buildEffects(
  neutral: Oklch,
  mode: 'light' | 'dark',
  separation: Separation = 'layered',
): ThemeEffects {
  const color = shadowColor(neutral, mode)
  const highlight = HIGHLIGHT[separation]

  const layersFor = (level: 1 | 2 | 3): ShadowLayer[] => {
    const [ambient, key] = ALPHA[mode][separation][level]
    const [offsetY, blur, spread] = GEOMETRY[level]
    const out: ShadowLayer[] = []
    if (ambient > 0 || key > 0) {
      // A contact shadow plus a cast shadow. One layer alone reads either as a
      // sticker (no contact) or as fog (no cast).
      out.push({ offsetX: 0, offsetY: 1, blur: 2, spread: 0, color, alpha: ambient })
      out.push({ offsetX: 0, offsetY, blur, spread, color, alpha: key })
    }
    // Dark mode's lit top edge, scaled up past level 1 — this is what actually
    // separates a raised surface when there is no luminance room beneath it.
    if (mode === 'dark' && highlight > 0) {
      out.push({
        offsetX: 0,
        offsetY: 1,
        blur: 0,
        spread: 0,
        color: '#ffffff',
        alpha: highlight * (level === 1 ? 1 : 1.4),
        inset: true,
      })
    }
    return out
  }

  return {
    elevation: {
      1: layersFor(LEVELS[0]),
      2: layersFor(LEVELS[1]),
      3: layersFor(LEVELS[2]),
    },
    // The scrim is the same shade, opened up. Dark mode needs more of it: a
    // light wash over a near-black page barely registers.
    scrim: { color, alpha: mode === 'light' ? 0.32 : 0.58 },
  }
}

/* ---------------------------------------------------------------------------
   CSS serialization. It lives here, beside the producer, because BOTH the
   exporter and the live preview need the identical string — two
   implementations of "how a ShadowLayer becomes CSS" would drift, and the
   preview would stop showing what the export actually contains.
   --------------------------------------------------------------------------- */

const toRgb = converter('rgb')
const ch = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)

/** `#rrggbb` + alpha → `rgb(R G B / A)`. Modern syntax; no alpha-hex guessing. */
export function cssAlphaColor(hex: string, alpha: number): string {
  const c = toRgb(hex)
  if (!c) return hex
  const a = Number(alpha.toFixed(3))
  return `rgb(${ch(c.r)} ${ch(c.g)} ${ch(c.b)} / ${a})`
}

/**
 * Layers → one `box-shadow` value.
 *
 * An empty list serializes to `0 0 #0000` — a fully transparent, zero-size
 * shadow — rather than the `none` keyword, and that choice is load-bearing.
 * `flat` legitimately produces an empty level 1, and utility frameworks
 * compose `box-shadow` from a LIST of layer variables (`var(--ring), var(--x)`).
 * A list containing `none` is invalid CSS, so the browser discards the whole
 * declaration — silently taking any ring or border-shadow on that element with
 * it. Both mockups hit exactly that and had to patch it locally before this
 * was fixed here. `0 0 #0000` paints nothing on its own AND composes, and is
 * what Tailwind's own `shadow-none` emits, so it is correct in both positions.
 * The empty string is never right either: `box-shadow: ;` drops the rule.
 */
export function cssShadow(layers: ShadowLayer[]): string {
  if (layers.length === 0) return '0 0 #0000'
  return layers
    .map((l) => {
      const parts = [
        `${l.offsetX}px`,
        `${l.offsetY}px`,
        `${l.blur}px`,
        `${l.spread}px`,
        cssAlphaColor(l.color, l.alpha),
      ]
      return (l.inset ? 'inset ' : '') + parts.join(' ')
    })
    .join(', ')
}

/** The effect CSS variables, ready to drop into a `:root`/`style` block. */
export function effectVars(effects: ThemeEffects): Record<string, string> {
  return {
    '--elevation-1': cssShadow(effects.elevation[1]),
    '--elevation-2': cssShadow(effects.elevation[2]),
    '--elevation-3': cssShadow(effects.elevation[3]),
    '--scrim': cssAlphaColor(effects.scrim.color, effects.scrim.alpha),
  }
}
