import type { ColorCandidate, Oklch, Role, RoleAssignment } from './types'
import { clamp, deltaEok, hueDistance, lerp, lerpHue } from './color'

/**
 * Role assignment: score every candidate against every role's target region in
 * OKLCH, then assign greedily in role-priority order. Weight (image population
 * or list position) interacts with the role: backgrounds favor dominant muted
 * colors, accents favor rare vivid ones. Roles whose best score is below a
 * threshold get synthesized instead of eating an ill-fitting input.
 */

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))

const smoothstep = (x: number, lo: number, hi: number) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1)
  return t * t * (3 - 2 * t)
}

// Hue anchors for status roles (OKLCH degrees).
const STATUS_HUE: Record<'danger' | 'success' | 'warning', number> = {
  danger: 27,
  success: 150,
  warning: 80,
}

function scoreForRole(c: ColorCandidate, role: Role, primaryHue: number | null): number {
  const { l, c: chroma, h } = c.color
  switch (role) {
    case 'primary':
      // Weight matters most here: the user's first/dominant color leads.
      return (
        smoothstep(chroma, 0.03, 0.11) * 0.45 +
        gauss(l, 0.55, 0.18) * 0.2 +
        c.weight * 0.35
      )
    case 'neutral':
      return (1 - smoothstep(chroma, 0.02, 0.09)) * 0.7 + c.weight * 0.3
    case 'accent': {
      const hueFit = primaryHue == null ? 0.5 : smoothstep(hueDistance(h, primaryHue), 15, 60)
      // Chroma gate: a washed-out color can't be the accent regardless of hue.
      return (
        (hueFit * 0.45 + smoothstep(chroma, 0.04, 0.11) * 0.4 + (1 - c.weight) * 0.15) *
        smoothstep(chroma, 0.03, 0.07)
      )
    }
    case 'danger':
    case 'success':
    case 'warning': {
      const sigma = role === 'warning' ? 25 : 32
      // Chroma gate: status colors must read as colored, not as tinted gray.
      return (
        (gauss(hueDistance(h, STATUS_HUE[role]), 0, sigma) * 0.55 +
          smoothstep(chroma, 0.04, 0.12) * 0.35 +
          c.weight * 0.1) *
        smoothstep(chroma, 0.03, 0.08)
      )
    }
  }
}

// Below this score a role is synthesized rather than assigned a poor fit.
const ASSIGN_THRESHOLD: Record<Role, number> = {
  primary: 0.35,
  neutral: 0.45,
  accent: 0.45,
  danger: 0.55,
  success: 0.55,
  warning: 0.55,
}

// Assignment order: identity roles first, then statuses.
const ASSIGN_ORDER: Role[] = ['primary', 'neutral', 'accent', 'danger', 'success', 'warning']

/** Material-style harmonize: rotate hue up to 15 degrees toward the theme hue. */
function harmonize(color: Oklch, towardHue: number): Oklch {
  const dist = hueDistance(color.h, towardHue)
  const amount = Math.min(dist / 2, 15)
  return { ...color, h: lerpHue(color.h, towardHue, dist === 0 ? 0 : amount / dist) }
}

/**
 * Under the mono lock every invented role is the base wearing a different
 * lightness — hue is copied, chroma only ever scaled down. An achromatic
 * base (c ≈ 0) therefore yields a pure value scale. Semantics that hue
 * normally carries (danger = red…) fall to iconography; the user can layer
 * real colors on top at any time, which bypass synthesis entirely.
 */
function monoSynthesize(role: Role, base: Oklch): Oklch {
  const h = base.h
  switch (role) {
    case 'primary':
      return { l: 0.55, c: Math.min(base.c, 0.23), h }
    case 'neutral':
      return { l: 0.5, c: Math.min(0.03, base.c * 0.25), h }
    case 'accent':
      return { l: 0.62, c: Math.min(base.c * 0.6, 0.12), h }
    case 'danger':
      return { l: 0.38, c: Math.min(base.c, 0.16), h }
    case 'success':
      return { l: 0.55, c: Math.min(base.c * 0.8, 0.14), h }
    case 'warning':
      return { l: 0.75, c: Math.min(base.c * 0.8, 0.14), h }
  }
}

function synthesize(role: Role, primary: Oklch): Oklch {
  switch (role) {
    case 'primary':
      return { l: 0.55, c: 0.15, h: 250 } // no usable input at all: default blue
    case 'neutral':
      return { l: 0.5, c: Math.min(0.03, primary.c * 0.25), h: primary.h }
    case 'accent':
      return { l: 0.6, c: Math.max(primary.c * 0.8, 0.1), h: (primary.h + 60) % 360 }
    case 'danger':
      return harmonize({ l: 0.55, c: 0.19, h: 27 }, primary.h)
    case 'success':
      return harmonize({ l: 0.55, c: 0.11, h: 150 }, primary.h)
    case 'warning':
      return harmonize({ l: 0.75, c: 0.16, h: 80 }, primary.h)
  }
}

/**
 * Fidelity: at 0, the seed is normalized into the role's canonical window
 * (so ramps and contrast targets always work); at 1 the input is kept verbatim.
 */
function fidelityAdjust(input: Oklch, role: Role, fidelity: number, monoLocked = false): Oklch {
  // The mono base keeps its chroma identity: the usual lower clamp would
  // inject chroma into a locked gray, tinting a deliberate grayscale theme.
  let target: Oklch
  if (role === 'neutral') {
    target = { l: input.l, c: Math.min(input.c, 0.025), h: input.h }
  } else if (role === 'warning') {
    target = { l: clamp(input.l, 0.6, 0.8), c: clamp(input.c, 0.07, 0.2), h: input.h }
  } else if (monoLocked) {
    target = { l: clamp(input.l, 0.45, 0.68), c: Math.min(input.c, 0.23), h: input.h }
  } else {
    target = { l: clamp(input.l, 0.45, 0.68), c: clamp(input.c, 0.07, 0.23), h: input.h }
  }
  return {
    l: lerp(target.l, input.l, fidelity),
    c: lerp(target.c, input.c, fidelity),
    h: input.h,
  }
}

/**
 * Chart seeds are leftovers, but "leftover" is a provenance, not a quality
 * bar. Hue and chroma follow the fidelity contract like every role; lightness
 * gets a hard readability clamp even at full fidelity — a data series must be
 * visible, the same way text contrast is solver-enforced regardless of
 * fidelity. (A photo's shadow blob may keep its hue, never its darkness.)
 */
export function chartAdjust(input: Oklch, fidelity: number): Oklch {
  const target: Oklch = {
    l: clamp(input.l, 0.5, 0.75),
    c: clamp(input.c, 0.09, 0.2),
    h: input.h,
  }
  return {
    l: clamp(lerp(target.l, input.l, fidelity), 0.45, 0.8),
    c: lerp(target.c, input.c, fidelity),
    h: input.h,
  }
}

export interface AssignmentResult {
  assignments: RoleAssignment[]
  chartCandidateIndexes: number[]
  unusedCandidateIndexes: number[]
}

export function assignRoles(
  candidates: ColorCandidate[],
  fidelity: number,
  monoBase: number | null = null,
): AssignmentResult {
  const taken = new Set<number>()
  const roleSeeds = new Map<Role, { index: number | null; input: Oklch | null }>()

  // 0. Mono lock: the base is crowned primary — unless the user pinned another
  // color there. A pin is the user's strongest word and outranks the lock (the
  // lock constrains what the engine invents, never what the user hands it), so
  // pinning navy primary inside salmon-tinted chrome is a supported design.
  // Either way the base donates its hue to every invented role (monoSynthesize).
  const baseInput = monoBase != null && candidates[monoBase] ? candidates[monoBase].color : null
  if (baseInput && !candidates.some((c, i) => i !== monoBase && c.pin === 'primary')) {
    roleSeeds.set('primary', { index: monoBase, input: baseInput })
    taken.add(monoBase!)
  }

  // 1. Pins win outright.
  candidates.forEach((c, i) => {
    if (c.pin && !roleSeeds.has(c.pin)) {
      roleSeeds.set(c.pin, { index: i, input: c.color })
      taken.add(i)
    }
  })

  // 2. Primary first (its hue anchors accent scoring), greedily.
  const n = candidates.length
  const orderBonus = (i: number) => (n > 1 ? ((n - 1 - i) / (n - 1)) * 0.06 : 0)
  if (!roleSeeds.has('primary')) {
    let best = -1
    let bestScore = -Infinity
    candidates.forEach((c, i) => {
      if (taken.has(i)) return
      const s = scoreForRole(c, 'primary', null) + orderBonus(i)
      if (s > bestScore) {
        bestScore = s
        best = i
      }
    })
    if (best >= 0 && bestScore >= ASSIGN_THRESHOLD.primary) {
      roleSeeds.set('primary', { index: best, input: candidates[best].color })
      taken.add(best)
    } else {
      roleSeeds.set('primary', { index: null, input: null })
    }
  }
  const primaryHue = roleSeeds.get('primary')!.input?.h ?? null

  // 3. Remaining roles: global matching, not greedy — a red should go to
  // danger when another color can serve as accent, even if red also scores
  // well for accent. Each role keeps its top options above threshold; small
  // exhaustive search over combinations picks the max-total assignment.
  const remaining = ASSIGN_ORDER.filter((r) => !roleSeeds.has(r))
  const options = remaining.map((role) => {
    const opts: Array<{ index: number; score: number }> = []
    candidates.forEach((c, i) => {
      if (taken.has(i)) return
      const s = scoreForRole(c, role, primaryHue) + orderBonus(i)
      if (s >= ASSIGN_THRESHOLD[role]) opts.push({ index: i, score: s })
    })
    opts.sort((a, b) => b.score - a.score)
    return opts.slice(0, 4)
  })
  let bestPick: Array<number | null> = remaining.map(() => null)
  let bestValue = -Infinity
  const pick: Array<number | null> = [...bestPick]
  const search = (roleIdx: number, used: Set<number>, value: number) => {
    if (roleIdx === remaining.length) {
      if (value > bestValue) {
        bestValue = value
        bestPick = [...pick]
      }
      return
    }
    pick[roleIdx] = null
    search(roleIdx + 1, used, value)
    for (const opt of options[roleIdx]) {
      if (used.has(opt.index)) continue
      pick[roleIdx] = opt.index
      used.add(opt.index)
      search(roleIdx + 1, used, value + opt.score)
      used.delete(opt.index)
      pick[roleIdx] = null
    }
  }
  search(0, new Set(), 0)
  remaining.forEach((role, ri) => {
    const idx = bestPick[ri]
    if (idx != null) {
      roleSeeds.set(role, { index: idx, input: candidates[idx].color })
      taken.add(idx)
    } else {
      roleSeeds.set(role, { index: null, input: null })
    }
  })

  // 3. Resolve seeds: fidelity-adjust assigned inputs, synthesize the rest.
  const primaryInput = roleSeeds.get('primary')!
  const baseIsPrimary = baseInput != null && primaryInput.index === monoBase
  const primarySeed =
    primaryInput.input != null
      ? fidelityAdjust(primaryInput.input, 'primary', fidelity, baseIsPrimary)
      : synthesize('primary', { l: 0.55, c: 0.15, h: 250 })
  // The donor every invented role inherits hue + chroma from. Usually the
  // primary seed itself; when a pin took primary, the base still donates.
  const monoDonor = baseInput
    ? baseIsPrimary
      ? primarySeed
      : fidelityAdjust(baseInput, 'primary', fidelity, true)
    : null

  const assignments: RoleAssignment[] = ASSIGN_ORDER.map((role) => {
    const entry = roleSeeds.get(role)!
    if (entry.input != null) {
      const seed = role === 'primary' ? primarySeed : fidelityAdjust(entry.input, role, fidelity)
      return { role, candidateIndex: entry.index, seed, deltaE: deltaEok(entry.input, seed) }
    }
    return {
      role,
      candidateIndex: null,
      seed: monoDonor ? monoSynthesize(role, monoDonor) : synthesize(role, primarySeed),
      deltaE: 0,
    }
  })

  // 4. Leftovers: vivid ones become chart colors, rest unused.
  const chart: number[] = []
  const unused: number[] = []
  candidates.forEach((c, i) => {
    if (taken.has(i)) return
    if (c.color.c >= 0.05 && chart.length < 5) chart.push(i)
    else unused.push(i)
  })

  return { assignments, chartCandidateIndexes: chart, unusedCandidateIndexes: unused }
}
