import type { JudgeInput, JudgeVerdict, Oklch, Role } from './types'
import { clamp, hueDistance } from './color'
import { STATUS_HUE } from './roles'

/**
 * Judge v1: a pure scorer over a set of role seeds (plus chart seeds when
 * present). Color-compatibility features in the O'Donovan lineage, hand-tuned
 * weights: every feature normalizes to [0,1] and the score is their weighted
 * sum. Deterministic — no randomness, seeds in, number out.
 *
 * The riff walk (walk.ts) calls this to choose between the neighbours each hop
 * proposes, and to decide when it has walked into a wall. Judging touches seeds
 * only, never ramps, which is what makes tasting a pool per hop cheap enough to
 * do on every keystroke.
 */

const smoothstep = (x: number, lo: number, hi: number) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Below this chroma a hue carries no perceptual weight — hue features abstain. */
const CHROMA_FLOOR = 0.02

/** Max pairwise hue spread that reads as a deliberate mono register. */
const MONO_SPREAD = 12

// How far each status may drift from its semantic anchor (STATUS_HUE) before
// legibility decays. Repertoire windows ± the 15° harmonize rotation fit inside.
const STATUS_WINDOW: Record<'danger' | 'success' | 'warning', number> = {
  danger: 25,
  success: 32,
  warning: 25,
}

// Two statuses within this many degrees read as one voice — a real failure.
const STATUS_COLLISION = 25

/** The one weight table. Explicit, named, sums to 1 so the score stays 0..1. */
export const JUDGE_WEIGHTS = {
  hueDispersion: 0.14,
  accentDistinctness: 0.18,
  statusLegibility: 0.26,
  lightnessRhythm: 0.1,
  chromaCoherence: 0.14,
  primaryDeference: 0.18,
} as const

const STATUSES = ['danger', 'success', 'warning'] as const

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

const stddev = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** Pairwise hue distances of a hue set (empty for fewer than two hues). */
function pairwiseHueDistances(hues: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) out.push(hueDistance(hues[i], hues[j]))
  }
  return out
}

export function judgePalette(input: JudgeInput): JudgeVerdict {
  const { seeds, chartSeeds = [] } = input
  const synthesized = new Set<Role>(input.synthesized)

  // The hue-bearing set: every seed that actually shows a hue. Neutral is a
  // tint, not a voice — it sits out every hue feature by construction.
  const colorful: Oklch[] = [
    ...STATUSES.map((r) => seeds[r]),
    seeds.primary,
    seeds.accent,
    ...chartSeeds,
  ].filter((s) => s.c >= CHROMA_FLOOR)
  const hues = colorful.map((s) => s.h)
  const pairs = pairwiseHueDistances(hues)
  // A mono register (mono lock, or one heavily muted family) is a deliberate
  // design, not a smeared one: hue features abstain at 0.5 instead of failing.
  const mono = pairs.length > 0 && Math.max(...pairs) <= MONO_SPREAD

  // Hue dispersion: a well-spread hue set beats a clump, but a perfectly
  // uniform smear reads as a rainbow, not a palette — mild penalty up top.
  let hueDispersion = 0.5
  if (!mono && pairs.length > 0) {
    const spread = mean(pairs)
    hueDispersion = smoothstep(spread, 20, 50) * (1 - 0.5 * smoothstep(spread, 95, 140))
  }

  // Accent distinctness: the accent is the theme's second voice — reward it
  // sitting 40..180° away from the primary, fade it out under 40, dead at 15.
  let accentDistinctness = 0.5
  if (!mono && seeds.accent.c >= CHROMA_FLOOR && seeds.primary.c >= CHROMA_FLOOR) {
    accentDistinctness = smoothstep(hueDistance(seeds.accent.h, seeds.primary.h), 15, 40)
  }

  // Status legibility: each status near its semantic anchor, and no two
  // statuses collapsing onto each other — a collision zeroes the feature.
  let statusLegibility = 0.5
  const liveStatuses = STATUSES.filter((r) => seeds[r].c >= CHROMA_FLOOR)
  if (!mono && liveStatuses.length > 0) {
    const fits = liveStatuses.map((r) => {
      const drift = hueDistance(seeds[r].h, STATUS_HUE[r])
      return 1 - smoothstep(drift, STATUS_WINDOW[r], STATUS_WINDOW[r] + 45)
    })
    let collisions = 1
    for (let i = 0; i < liveStatuses.length; i++) {
      for (let j = i + 1; j < liveStatuses.length; j++) {
        const d = hueDistance(seeds[liveStatuses[i]].h, seeds[liveStatuses[j]].h)
        collisions *= smoothstep(d, 10, STATUS_COLLISION)
      }
    }
    statusLegibility = mean(fits) * collisions
  }

  // Lightness rhythm: seeds spread across lightness rather than clumped in
  // one register — the theme needs light and dark voices to build depth from.
  const lightnessRhythm = smoothstep(
    stddev(Object.values(seeds).map((s) => s.l)),
    0.03,
    0.09,
  )

  // Chroma coherence: a consistent chroma register (all-muted or all-vivid)
  // beats a random mix. Neutral is exempt — it is muted by definition.
  const registers = [seeds.primary, seeds.accent, ...STATUSES.map((r) => seeds[r]), ...chartSeeds]
  const chromaCoherence = 1 - smoothstep(stddev(registers.map((s) => s.c)), 0.03, 0.09)

  // Primary deference: invented roles shouldn't out-chroma the primary by
  // much — the user's color leads, the synthesized cast supports.
  const deferring = [...synthesized].filter((r) => r !== 'primary' && r !== 'neutral')
  const primaryDeference =
    deferring.length === 0
      ? 1
      : mean(deferring.map((r) => 1 - smoothstep(seeds[r].c - seeds.primary.c, 0.01, 0.08)))

  const features: Record<string, number> = {
    hueDispersion,
    accentDistinctness,
    statusLegibility,
    lightnessRhythm,
    chromaCoherence,
    primaryDeference,
  }
  const score = clamp(
    Object.entries(JUDGE_WEIGHTS).reduce((s, [k, w]) => s + w * features[k], 0),
    0,
    1,
  )
  return { score, features }
}
