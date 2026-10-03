/**
 * Contrast level: one 0..1 number that raises every contrast target the engine
 * solves for, in the spirit of Material 3's standard / medium / high.
 *
 * It moves TARGETS, never budgets. Taste (fidelity) still decides how far a
 * colour you supplied may drift to meet them; this decides what "meeting
 * them" means. At taste 1 a raised target your colour can't reach is reported,
 * not forced — exactly as at standard.
 *
 * 0 is the zero point and reproduces the engine's historical numbers exactly
 * (`contrastTargets(0)` returns the literals ramp.ts and tokens.ts used to
 * hardcode), so a theme that never touches the control is byte-identical.
 * Unit- and golden-enforced.
 *
 * Between the three anchors the targets interpolate linearly, so every target
 * is monotone in the level and a higher level can never ask for less.
 *
 * APCA Lc is the design metric the solvers aim for; WCAG ratio is the gate the
 * report checks. Lc ceilings are low: black text on the light ramp's step 3
 * tops out near Lc 96, so the high-text Lc anchors stay under it and the WCAG
 * ratio does the climbing.
 */

export interface LcTarget {
  /** APCA Lc (absolute) the solve aims for. */
  lc: number
  /** WCAG ratio the solve must also clear. */
  wcag: number
}

export interface ContrastTargets {
  /** Steps 11 (muted / subtle text) and links: the floor every text pair clears. */
  textLow: LcTarget
  /** Step 12 (body text). */
  textHigh: LcTarget
  /**
   * The floor EVERY text pair clears — ramp text, links, text on solid fills.
   * `wcag` is the report's gate at every level. `lc` joins the gate above
   * standard (at standard the report has only ever checked WCAG, and an
   * existing theme's report must not change), and from there on fills are
   * solved for it too.
   */
  text: LcTarget
  /** Non-text marks — focus ring, accent-strong, the status -strong marks (WCAG 1.4.11 at standard). */
  mark: LcTarget
  /** The primary fill against the page ("pop"), spent from taste's budget. */
  pop: number
  /**
   * Hairline floors against page and card, as WCAG ratios. 1 = no floor, the
   * separation ladder alone decides (standard). See ramp.ts.
   */
  border: number
  /** Input outlines — identify a control, so they climb faster than borders. */
  input: number
}

export const CONTRAST_LEVELS = { standard: 0, medium: 0.5, high: 1 } as const
export type ContrastLevelName = keyof typeof CONTRAST_LEVELS

/** The three anchors; index 0 MUST stay the engine's historical literals. */
const ANCHORS: readonly [ContrastTargets, ContrastTargets, ContrastTargets] = [
  {
    textLow: { lc: 62, wcag: 4.6 },
    textHigh: { lc: 92, wcag: 7 },
    text: { lc: 62, wcag: 4.5 },
    mark: { lc: 45, wcag: 3 },
    pop: 3,
    border: 1,
    input: 1,
  },
  {
    textLow: { lc: 75, wcag: 7.1 },
    textHigh: { lc: 94, wcag: 10 },
    text: { lc: 75, wcag: 7 },
    mark: { lc: 55, wcag: 3.75 },
    pop: 3.75,
    border: 2,
    input: 3,
  },
  {
    textLow: { lc: 88, wcag: 10.1 },
    textHigh: { lc: 95, wcag: 13 },
    text: { lc: 88, wcag: 10 },
    mark: { lc: 65, wcag: 4.5 },
    pop: 4.5,
    border: 3,
    input: 4.5,
  },
]

/** Clamp to 0..1; anything unreadable is the standard level. */
export function normalizeContrast(level: number | undefined | null): number {
  if (level == null || !Number.isFinite(level)) return 0
  return Math.min(1, Math.max(0, level))
}

const mix = (a: number, b: number, t: number) => (t === 0 ? a : t === 1 ? b : a + (b - a) * t)
const mixLc = (a: LcTarget, b: LcTarget, t: number): LcTarget => ({ lc: mix(a.lc, b.lc, t), wcag: mix(a.wcag, b.wcag, t) })

/** Every target the engine solves for, at a contrast level in 0..1. */
export function contrastTargets(level = 0): ContrastTargets {
  const v = normalizeContrast(level)
  // Piecewise: 0 → 0.5 between the first two anchors, 0.5 → 1 between the last two.
  const [a, b, t] = v <= 0.5 ? [ANCHORS[0], ANCHORS[1], v / 0.5] : [ANCHORS[1], ANCHORS[2], (v - 0.5) / 0.5]
  return {
    textLow: mixLc(a.textLow, b.textLow, t),
    textHigh: mixLc(a.textHigh, b.textHigh, t),
    text: mixLc(a.text, b.text, t),
    mark: mixLc(a.mark, b.mark, t),
    pop: mix(a.pop, b.pop, t),
    border: mix(a.border, b.border, t),
    input: mix(a.input, b.input, t),
  }
}

/** The named level at `v`, or null between detents. */
export function contrastLevelName(v: number): ContrastLevelName | null {
  const n = normalizeContrast(v)
  for (const [name, at] of Object.entries(CONTRAST_LEVELS) as Array<[ContrastLevelName, number]>) {
    if (Math.abs(n - at) < 1e-9) return name
  }
  return null
}
