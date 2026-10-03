import type { Oklch, Ramp, Separation } from './types'
import { clamp, toGamut, toHex } from './color'
import { solveLightness } from './contrast'
import { contrastTargets } from './contrastLevel'

/**
 * Radix-style 12-step ramps generated in OKLCH.
 * Steps 1-8 come from a fixed cross-hue lightness ladder with a chroma curve
 * easing toward zero at the extremes. Step 9 is the solid seed, 10 its hover.
 * Steps 11-12 (text) are SOLVED against the step-3 background to hit APCA
 * targets (at the standard contrast level Lc 62 low-contrast text, Lc 92
 * high-contrast text; see contrastLevel.ts for the other levels).
 */

// Lightness ladder for steps 1-8 (bg -> borders).
const LIGHT_L = [0.99, 0.977, 0.947, 0.915, 0.882, 0.845, 0.79, 0.72]
const DARK_L = [0.18, 0.205, 0.24, 0.27, 0.3, 0.34, 0.41, 0.49]

// Per-step chroma: fraction of seed chroma, with an absolute cap so
// backgrounds stay subtle regardless of how vivid the seed is.
const CHROMA_MULT = [0.1, 0.16, 0.3, 0.38, 0.46, 0.55, 0.68, 0.85]
const CHROMA_CAP = [0.012, 0.02, 0.045, 0.06, 0.075, 0.09, 0.115, 0.145]
const DARK_CHROMA_CAP = [0.015, 0.022, 0.045, 0.055, 0.07, 0.085, 0.11, 0.14]

// Neutral ramps carry the seed's chroma near-verbatim (capped) instead: the
// vivid curve's early-step multipliers (0.1×) would collapse a neutral's
// small chroma below perception, making every background identical. The seed
// chroma itself is fidelity-controlled upstream, so harmonize → near-gray,
// verbatim + a cream/tinted input → a genuinely colorful background. True
// grays (seedC ≈ 0) stay gray.
const NEUTRAL_CAP = [0.045, 0.042, 0.038, 0.034, 0.03, 0.027, 0.024, 0.022]
const DARK_NEUTRAL_CAP = [0.03, 0.028, 0.026, 0.025, 0.024, 0.023, 0.024, 0.026]

// How much a chromatic neutral seed pulls light-mode backgrounds down from
// near-white (a cream background can't exist at L 0.99 — sRGB has no room
// for chroma there). Tapers off by mid-ramp so borders keep their ladder.
const NEUTRAL_L_TAPER = [1, 0.95, 0.7, 0.45, 0.2, 0.1, 0, 0]

/**
 * Separation as signed deltas on the neutral ladder — never as an absolute
 * lightness plan. The ladder is already moved by `NEUTRAL_L_TAPER` (a
 * chromatic neutral pulls light backgrounds down off near-white by up to
 * .045), so an absolute plan would overwrite that correction and re-break
 * light mode for tinted neutrals. Deltas ride on top of whatever the taper
 * decided.
 *
 * `layered` is all zeroes by construction: an existing theme is byte-identical
 * unless the user actually moves the control. That is unit-enforced.
 *
 * The shape of each plan, reading steps 1→8 (page, card, secondary … border,
 * input):
 *   flat   — surfaces CONVERGE (card meets the page) and the hairlines get
 *            stronger to carry the separation the lightness no longer does.
 *   lifted — the page RECEDES and the card floats above it, while hairlines
 *            soften because the shadow has taken over. In light mode that
 *            means the card ends up lighter than the page, inverting the
 *            engine's usual order — which is the whole point of the setting.
 */
const SEPARATION_DELTA: Record<'light' | 'dark', Record<Separation, number[]>> = {
  light: {
    flat: [0, 0.013, 0.011, 0.008, 0.006, -0.017, -0.015, -0.01],
    layered: [0, 0, 0, 0, 0, 0, 0, 0],
    lifted: [-0.022, 0.011, -0.007, -0.006, -0.005, 0.017, 0.012, 0.008],
  },
  dark: {
    // In dark, a STRONGER hairline is a lighter one, so the border signs flip.
    flat: [0.025, 0, 0.01, 0.008, 0.006, 0.02, 0.015, 0.01],
    layered: [0, 0, 0, 0, 0, 0, 0, 0],
    lifted: [-0.012, 0.014, 0.008, 0.006, 0.005, -0.01, -0.008, -0.006],
  },
}

export interface RampOptions {
  isNeutral?: boolean
  /** Surface separation; only the neutral ramp responds. Default `layered`. */
  separation?: Separation
  /** Contrast level 0..1 (contrastLevel.ts). Default 0, the historical ramp. */
  contrast?: number
}

/**
 * Hairline floors for the contrast level, on the neutral ramp only: step 6
 * (`border`) and step 7 (`input`), measured against step 1 (page) and step 2
 * (card), whichever is binding.
 *
 * A FLOOR, not another delta table. Separation already shapes the hairlines
 * with signed lightness deltas, and a second table of deltas would be a second
 * control over the same number (the failure that removed `weight`). So the
 * level only ever pushes a hairline further from the surfaces, and only when
 * separation's ladder leaves it short of the level's ratio. At standard the
 * floor is 1:1 and nothing is solved at all, so every existing theme is
 * byte-identical; at high, `flat` and `layered` hairlines converge on the same
 * floor while their surfaces keep separation's shape.
 */
const HAIRLINE_STEPS = [5, 6] as const

function stepChroma(seedC: number, i: number, dark: boolean, neutral: boolean): number {
  if (neutral) {
    return Math.min(seedC, dark ? DARK_NEUTRAL_CAP[i] : NEUTRAL_CAP[i])
  }
  const cap = dark ? DARK_CHROMA_CAP[i] : CHROMA_CAP[i]
  return Math.min(seedC * CHROMA_MULT[i], cap)
}

/** Derive the dark-mode solid from the light solid: raise lightness, cut chroma. */
function darkSolid(seed: Oklch): Oklch {
  return toGamut({
    l: Math.max(seed.l, 0.68),
    c: seed.c * 0.85,
    h: seed.h,
  })
}

export function makeRamp(
  seed: Oklch,
  mode: 'light' | 'dark',
  opts: RampOptions = {},
): {
  steps: Oklch[]
  hex: Ramp
  /** Step indexes whose contrast target could not be reached (solved to the extreme instead). */
  unreached: number[]
} {
  const dark = mode === 'dark'
  const targets = contrastTargets(opts.contrast ?? 0)
  const unreached: number[] = []
  const seedC = opts.isNeutral ? Math.min(seed.c, 0.08) : seed.c
  let ladder = dark ? DARK_L : LIGHT_L
  if (opts.isNeutral && !dark) {
    const dip = clamp((seedC - 0.02) * 0.9, 0, 0.045)
    if (dip > 0) ladder = ladder.map((l, i) => l - dip * NEUTRAL_L_TAPER[i])
  }
  // Separation rides on top of the taper, and only on the surface ramp — the
  // brand and status ramps have no surfaces to separate. The ceiling sits
  // above the ladder's own top step (0.99) so `layered` passes through
  // untouched; it exists only to stop a delta reaching pure white, where
  // there is no gamut room left for the neutral's chroma.
  if (opts.isNeutral) {
    const delta = SEPARATION_DELTA[dark ? 'dark' : 'light'][opts.separation ?? 'layered']
    ladder = ladder.map((l, i) => clamp(l + delta[i], 0.02, 0.995))
  }

  const steps: Oklch[] = ladder.map((l, i) =>
    toGamut({ l, c: stepChroma(seedC, i, dark, !!opts.isNeutral), h: seed.h }),
  )

  const direction = dark ? 'lighter' : 'darker'
  const further = (a: number, b: number) => (dark ? Math.max(a, b) : Math.min(a, b))
  if (opts.isNeutral && (targets.border > 1 || targets.input > 1)) {
    const surfaces = [toHex(steps[0]), toHex(steps[1])]
    for (const i of HAIRLINE_STEPS) {
      const floor = i === 5 ? targets.border : targets.input
      if (floor <= 1) continue
      const chroma = () => stepChroma(seedC, i, dark, true)
      const solves = surfaces.map((s) => solveLightness(0, floor, s, seed.h, chroma, direction))
      if (solves.some((x) => !x.reached)) unreached.push(i)
      const l = solves.map((x) => x.color.l).reduce(further)
      if (further(l, steps[i].l) !== steps[i].l) steps[i] = toGamut({ l, c: chroma(), h: seed.h })
    }
    // Keep the ladder ordered: step 8 never sits nearer the page than step 7.
    if (further(steps[6].l, steps[7].l) !== steps[7].l) {
      steps[7] = toGamut({ l: steps[6].l, c: stepChroma(seedC, 7, dark, true), h: seed.h })
    }
  }

  // Step 9: solid. Step 10: hover.
  const solid = dark ? (opts.isNeutral ? toGamut({ l: 0.62, c: seedC * 0.8, h: seed.h }) : darkSolid(seed)) : toGamut({ l: seed.l, c: seedC, h: seed.h })
  const hover = toGamut({
    l: clamp(solid.l + (dark ? 0.035 : -0.035), 0.03, 0.98),
    c: solid.c,
    h: solid.h,
  })
  steps.push(solid, hover)

  // Steps 11-12: text, solved against step 3 (the darkest surface text sits
  // on: bg/card/muted) so contrast holds on steps 1-3. APCA target + WCAG gate.
  const bg = toHex(steps[2])
  const textChroma = opts.isNeutral
    ? () => Math.min(seedC, 0.015)
    : () => Math.min(seedC * (dark ? 0.45 : 0.6), dark ? 0.08 : 0.11)
  const lowText = solveLightness(targets.textLow.lc, targets.textLow.wcag, bg, seed.h, textChroma, direction)
  const highText = solveLightness(targets.textHigh.lc, targets.textHigh.wcag, bg, seed.h, textChroma, direction)
  if (!lowText.reached) unreached.push(10)
  if (!highText.reached) unreached.push(11)
  steps.push(toGamut(lowText.color), toGamut(highText.color))

  return { steps, hex: steps.map(toHex), unreached }
}
