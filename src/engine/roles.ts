import type {
  CastingExplanation,
  ColorCandidate,
  GateMiss,
  Oklch,
  Role,
  RoleAssignment,
} from './types'
import { clamp, deltaEok, hueDistance, lerp, lerpHue } from './color'
import { accentRepertoire, monoRepertoire, neutralRepertoire, statusRepertoire } from './repertoire'

/**
 * Role assignment: score every candidate against every role's target region in
 * OKLCH, then assign greedily in role-priority order. List position is a single
 * monotonic prior: higher in the list = stronger claim on EVERY seat — no role
 * ever benefits from a color sitting lower. Roles whose best score is below a
 * threshold get synthesized instead of eating an ill-fitting input.
 */

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))

const smoothstep = (x: number, lo: number, hi: number) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1)
  return t * t * (3 - 2 * t)
}

// Hue anchors for status roles (OKLCH degrees).
export const STATUS_HUE: Record<'danger' | 'success' | 'warning', number> = {
  danger: 27,
  success: 150,
  warning: 80,
}

function scoreForRole(c: ColorCandidate, role: Role, primaryHue: number | null): number {
  const { l, c: chroma, h } = c.color
  switch (role) {
    case 'primary':
      // Chroma fit saturates very early: any clearly-colored candidate ties on
      // it, so lightness fit and the order prior arbitrate — a dominant muted
      // lead outranks a rare vivid one (which the accent seat wants anyway).
      return smoothstep(chroma, 0.02, 0.06) * 0.55 + gauss(l, 0.55, 0.18) * 0.25
    case 'neutral':
      return (1 - smoothstep(chroma, 0.02, 0.09)) * 0.9
    case 'accent': {
      const hueFit = primaryHue == null ? 0.5 : smoothstep(hueDistance(h, primaryHue), 15, 60)
      // Chroma gate: a washed-out color can't be the accent regardless of hue.
      // Lightness gate: neither can a near-white — it reads as background tint,
      // not as the theme's second voice.
      return (
        (hueFit * 0.55 + smoothstep(chroma, 0.05, 0.1) * 0.45) *
        smoothstep(chroma, 0.03, 0.07) *
        (1 - smoothstep(l, 0.9, 0.99))
      )
    }
    case 'danger':
    case 'success':
    case 'warning': {
      const sigma = role === 'warning' ? 25 : 32
      // Chroma gate: status colors must read as colored, not as tinted gray.
      // Peaks slightly above accent's 1.0 so a dead-on status hue takes its
      // status seat instead of the accent seat when it could serve either.
      return (
        (gauss(hueDistance(h, STATUS_HUE[role]), 0, sigma) * 0.62 +
          smoothstep(chroma, 0.04, 0.12) * 0.42) *
        smoothstep(chroma, 0.03, 0.08)
      )
    }
  }
}

// Strength of the list-order prior added uniformly to every role score.
const ORDER_PRIOR_K = 0.08

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
 * Riffing a mono theme moves lightness only, in walk.ts.
 */
function monoSynthesize(role: Role, base: Oklch): Oklch {
  return monoRepertoire(role, base)
}

// Invented seeds come from the cookbook: accent = primary + 60°, neutral
// tinted toward primary, statuses on their anchors. Casting is riff-independent
// — the walk moves these seeds afterwards, it never changes who sits where.
function synthesize(role: Role, primary: Oklch): Oklch {
  switch (role) {
    case 'primary':
      return { l: 0.55, c: 0.15, h: 250 } // no usable input at all: default blue
    case 'neutral':
      return neutralRepertoire(primary)
    case 'accent':
      return accentRepertoire(primary)
    case 'danger':
    case 'success':
    case 'warning':
      return harmonize(statusRepertoire(role), primary.h)
  }
}

/**
 * The canonical window each role's seed is normalized into below fidelity 1,
 * in OKLCH. `l` absent: lightness is the role's own business (neutral).
 */
export interface RoleWindow {
  l?: readonly [number, number]
  c: readonly [number, number]
}

export function roleWindow(role: Role, monoLocked = false): RoleWindow {
  // The mono base keeps its chroma identity: the usual lower clamp would
  // inject chroma into a locked gray, tinting a deliberate grayscale theme.
  if (role === 'neutral') return { c: [0, 0.025] }
  if (role === 'warning') return { l: [0.6, 0.8], c: [0.07, 0.2] }
  if (monoLocked) return { l: [0.45, 0.68], c: [0, 0.23] }
  return { l: [0.45, 0.68], c: [0.07, 0.23] }
}

/**
 * Fidelity: at 0, the seed is normalized into the role's canonical window
 * (so ramps and contrast targets always work); at 1 the input is kept verbatim.
 */
function fidelityAdjust(input: Oklch, role: Role, fidelity: number, monoLocked = false): Oklch {
  const w = roleWindow(role, monoLocked)
  const target: Oklch = {
    l: w.l ? clamp(input.l, w.l[0], w.l[1]) : input.l,
    c: clamp(input.c, w.c[0], w.c[1]),
    h: input.h,
  }
  return {
    l: lerp(target.l, input.l, fidelity),
    c: lerp(target.c, input.c, fidelity),
    h: input.h,
  }
}

/**
 * Chart seeds' window, plus the hard lightness floor and ceiling that hold even
 * at fidelity 1.
 */
export const CHART_WINDOW = { l: [0.5, 0.75], c: [0.09, 0.2], hardL: [0.45, 0.8] } as const

/**
 * Chart seeds are leftovers, but "leftover" is a provenance, not a quality
 * bar. Hue and chroma follow the fidelity contract like every role; lightness
 * gets a hard readability clamp even at full fidelity — a data series must be
 * visible, the same way text contrast is solver-enforced regardless of
 * fidelity. (A photo's shadow blob may keep its hue, never its darkness.)
 */
export function chartAdjust(input: Oklch, fidelity: number): Oklch {
  const { l, c, hardL } = CHART_WINDOW
  const target: Oklch = {
    l: clamp(input.l, l[0], l[1]),
    c: clamp(input.c, c[0], c[1]),
    h: input.h,
  }
  return {
    l: clamp(lerp(target.l, input.l, fidelity), hardL[0], hardL[1]),
    c: lerp(target.c, input.c, fidelity),
    h: input.h,
  }
}

export interface AssignmentResult {
  assignments: RoleAssignment[]
  chartCandidateIndexes: number[]
  unusedCandidateIndexes: number[]
  casting: CastingExplanation[]
}

// The leftover chroma bar: below this a candidate can't chart (unless pinned).
export const CHART_CHROMA_GATE = 0.05
const CHART_SEATS = 5

export function assignRoles(
  candidates: ColorCandidate[],
  fidelity: number,
  monoBase: number | null = null,
): AssignmentResult {
  const taken = new Set<number>()
  const roleSeeds = new Map<Role, { index: number | null; input: Oklch | null }>()

  // -1. Benched: colors the user parked. Marked taken so no seat can claim
  // them, and re-added to `unused` at the end so they still surface as the
  // bench. This is the only way to hand a seat back to the engine — dropping
  // a pin alone can't, since the same color would win the same seat again.
  const benched = new Set<number>()
  candidates.forEach((c, i) => {
    if (c.benched) {
      benched.add(i)
      taken.add(i)
    }
  })

  // 0. Mono lock: the base donates its hue to the whole theme from wherever it
  // already sits. It used to be crowned primary as well, which reshuffled the
  // board under the user — pick the accent as your base and your accent colour
  // silently became the primary and displaced whatever was there. Casting is
  // left alone; the lock now says what the colours ARE, never where they sit.
  const baseInput =
    monoBase != null && candidates[monoBase] && !benched.has(monoBase)
      ? candidates[monoBase].color
      : null

  // 1. Pins win outright. A chart pin claims a chart seat directly: the
  // candidate skips role scoring entirely and bypasses the leftover chroma
  // gate (chartAdjust normalizes chroma downstream, so even a near-gray
  // stays a visible series color).
  const chartPinned: number[] = []
  candidates.forEach((c, i) => {
    if (benched.has(i)) return
    if (c.pin === 'chart') {
      if (!taken.has(i)) {
        chartPinned.push(i)
        taken.add(i)
      }
      return
    }
    if (c.pin && !roleSeeds.has(c.pin)) {
      roleSeeds.set(c.pin, { index: i, input: c.color })
      taken.add(i)
    }
  })

  // 2. Primary first (its hue anchors accent scoring), greedily.
  // The one order prior: linear in list position, same K for every role, so
  // dragging a color up can only strengthen its claim — on any seat.
  const n = candidates.length
  const orderPrior = (i: number) => (n > 1 ? ((n - 1 - i) / (n - 1)) * ORDER_PRIOR_K : 0)
  if (!roleSeeds.has('primary')) {
    let best = -1
    let bestScore = -Infinity
    candidates.forEach((c, i) => {
      if (taken.has(i)) return
      const s = scoreForRole(c, 'primary', null) + orderPrior(i)
      if (s > bestScore) {
        bestScore = s
        best = i
      }
    })
    // Primary never synthesizes while a free candidate exists: an all-muted
    // palette must be led by its best muted color, not by an invented blue —
    // the theme always derives from something the user actually gave us.
    if (best >= 0) {
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
      const s = scoreForRole(c, role, primaryHue) + orderPrior(i)
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
  //
  // A locked colour skips the adjustment entirely. "Locked" has to mean the
  // exact colour the user is looking at, or the promise is worthless: locking
  // a seat at low fidelity would otherwise normalize the very colour being
  // frozen, and the swatch would change under the click that froze it. This is
  // the first of three stages a lock exempts a seed from — the walk and the
  // repair pass are the others.
  /** The frozen seed of a locked candidate, or null when it is free to move. */
  const frozen = (i: number | null): Oklch | null =>
    i != null && candidates[i].locked === true ? (candidates[i].lockedColor ?? candidates[i].color) : null

  const primaryInput = roleSeeds.get('primary')!
  const baseIsPrimary = baseInput != null && primaryInput.index === monoBase
  const primarySeed =
    primaryInput.input != null
      ? (frozen(primaryInput.index) ??
        fidelityAdjust(primaryInput.input, 'primary', fidelity, baseIsPrimary))
      : synthesize('primary', { l: 0.55, c: 0.15, h: 250 })
  // The donor every mono'd role inherits hue + chroma from: the base's own
  // colour, adjusted once, wherever on the board it happens to sit.
  const monoDonor = baseInput
    ? baseIsPrimary
      ? primarySeed
      : fidelityAdjust(baseInput, 'primary', fidelity, true)
    : null

  /**
   * Under the mono lock, an UNLOCKED seat is treated as derived — the base's
   * hue at this role's own lightness — whether or not a colour of yours is
   * holding it. A colour that keeps its own hue here would defeat the lock:
   * with four of six seats filled by the user, "mono" previously coerced two
   * and the result was not monochrome in any sense the word carries.
   *
   * The lock is the ONE exemption, exactly as it is for riff. Not even the
   * base is spared: it donates hue and chroma and then takes its seat's rung
   * like everything else. Exempting it was tried and it collided — the base
   * keeps whatever lightness it happened to have, which lands on another
   * role's rung often enough to clash in 45 of 126 sampled mono themes, almost
   * all primary-against-accent. It was also a second, undocumented freeze
   * sitting beside the real one. If you want the base verbatim, lock it.
   */
  const monoOverride = (role: Role, index: number | null): Oklch | null =>
    monoDonor && frozen(index) == null ? monoSynthesize(role, monoDonor) : null

  const assignments: RoleAssignment[] = ASSIGN_ORDER.map((role) => {
    const entry = roleSeeds.get(role)!
    if (entry.input != null) {
      const seed =
        frozen(entry.index) ??
        monoOverride(role, entry.index) ??
        (role === 'primary' ? primarySeed : fidelityAdjust(entry.input, role, fidelity))
      return { role, candidateIndex: entry.index, seed, deltaE: deltaEok(entry.input, seed) }
    }
    return {
      role,
      candidateIndex: null,
      seed: monoDonor ? monoSynthesize(role, monoDonor) : synthesize(role, primarySeed),
      deltaE: 0,
    }
  })

  // 4. Leftovers: vivid ones become chart colors, rest unused. Chart-pinned
  // candidates lead the series, gate-free.
  const chart: number[] = [...chartPinned]
  const unused: number[] = []
  candidates.forEach((c, i) => {
    if (benched.has(i)) {
      unused.push(i)
      return
    }
    if (taken.has(i)) return
    if (c.color.c >= CHART_CHROMA_GATE && chart.length < CHART_SEATS) chart.push(i)
    else unused.push(i)
  })

  const casting = buildCasting(candidates, roleSeeds, chart, monoBase, primaryHue, orderPrior)

  return { assignments, chartCandidateIndexes: chart, unusedCandidateIndexes: unused, casting }
}

// ---------------------------------------------------------------------------
// Casting report: recompute the same scores the passes above used and distill
// them into per-candidate facts (winning margins, contested seats, failed
// gates). Pure observation — assignment is already decided by this point.
// ---------------------------------------------------------------------------

// A gate multiplier at or below its midpoint reads as "failed" for reporting.
const GATE_SPECS: Array<{
  gate: GateMiss['gate']
  value: (c: Oklch) => number
  passesAbove: boolean
  needed: number
}> = [
  // smoothstep(c, 0.03, 0.07) midpoint — below this the accent seat is shut
  { gate: 'accent-chroma', value: (c) => c.c, passesAbove: true, needed: 0.05 },
  // smoothstep(c, 0.03, 0.08) midpoint — same for the three status seats
  { gate: 'status-chroma', value: (c) => c.c, passesAbove: true, needed: 0.055 },
  // 1 - smoothstep(l, 0.9, 0.99): a near-white reads as background tint
  { gate: 'accent-lightness', value: (c) => c.l, passesAbove: false, needed: 0.9 },
]

function buildCasting(
  candidates: ColorCandidate[],
  roleSeeds: Map<Role, { index: number | null; input: Oklch | null }>,
  chart: number[],
  monoBase: number | null,
  primaryHue: number | null,
  orderPrior: (i: number) => number,
): CastingExplanation[] {
  const seatOf = new Map<number, Role>()
  for (const role of ASSIGN_ORDER) {
    const idx = roleSeeds.get(role)?.index
    if (idx != null) seatOf.set(idx, role)
  }
  const chartSet = new Set(chart)

  // Same scoring calls the assignment passes make: primary is scored hue-blind,
  // every other role against the final primary hue, order prior on top.
  const score = (i: number, role: Role) =>
    scoreForRole(candidates[i], role, role === 'primary' ? null : primaryHue) + orderPrior(i)
  // A candidate that was never in the scoring pool can't contest a seat.
  const contends = (i: number) => !candidates[i].pin && i !== monoBase

  return candidates.map((c, i): CastingExplanation => {
    const seat = seatOf.get(i)
    const outcome = seat ?? (chartSet.has(i) ? ('chart' as const) : ('unused' as const))
    const via: CastingExplanation['via'] =
      c.pin === outcome || (c.pin === 'chart' && outcome === 'chart')
        ? 'pin'
        : i === monoBase && seat === 'primary'
          ? 'mono-base'
          : seat
            ? 'score'
            : 'leftover'

    const out: CastingExplanation = { outcome, via, lost: [], gates: [] }

    if (primaryHue != null && seat !== 'primary') {
      out.hueDistToPrimary = hueDistance(c.color.h, primaryHue)
    }

    if (via === 'score' && seat) {
      out.score = { total: score(i, seat), orderPrior: orderPrior(i) }
      // Who else wanted this seat: the best contender above the seat's bar.
      let rival: CastingExplanation['rival']
      candidates.forEach((_, j) => {
        if (j === i || !contends(j)) return
        const s = score(j, seat)
        if (s < ASSIGN_THRESHOLD[seat]) return
        if (!rival || out.score!.total - s < rival.margin) {
          rival = { index: j, margin: out.score!.total - s }
        }
      })
      if (rival) out.rival = rival
    }

    if (contends(i)) {
      // Seats this candidate had a real claim on, held by someone else.
      for (const role of ASSIGN_ORDER) {
        if (role === seat) continue
        const winner = roleSeeds.get(role)?.index
        if (winner == null || winner === i) continue
        const mine = score(i, role)
        if (mine < ASSIGN_THRESHOLD[role]) continue
        out.lost.push({ role, winnerIndex: winner, margin: score(winner, role) - mine })
      }
      // Gates that shut seats regardless of hue fit.
      for (const spec of GATE_SPECS) {
        const v = spec.value(c.color)
        const fails = spec.passesAbove ? v < spec.needed : v > spec.needed
        if (fails) out.gates.push({ gate: spec.gate, actual: v, needed: spec.needed })
      }
    }
    if (outcome === 'unused') {
      if (c.color.c < CHART_CHROMA_GATE) {
        out.gates.push({ gate: 'chart-chroma', actual: c.color.c, needed: CHART_CHROMA_GATE })
      } else {
        out.chartFull = true
      }
    }
    return out
  })
}
