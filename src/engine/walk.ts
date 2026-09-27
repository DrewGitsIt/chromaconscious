import type { Oklch, Role } from './types'
import { clamp, toGamut } from './color'
import { draw, subSeed } from './random'

/**
 * Riff as a walk, not a re-roll.
 *
 * One hop proposes K neighbours of the palette *as it currently stands*,
 * judges each, and keeps the argmax. Locality is structural — every proposal
 * sits inside a small per-role envelope — so three hops keep the family and
 * ten leave it. Quality stays the judge's job, exactly as before.
 *
 * The predecessor drew each hop i.i.d. from a seeded repertoire, so hop n bore
 * no relation to hop n-1: the palette teleported (a terracotta theme reached
 * violet in one press), and because the canonical option carried ~40% of the
 * repertoire's weight it kept landing back where it started. There was no such
 * thing as distance travelled, so "recognizable within 3 hops" could not be
 * expressed, let alone held.
 *
 * Who may move is decided entirely by the lock. Not by provenance, not by
 * fidelity: a colour you supplied and did not lock walks like anything else,
 * and hop 0 is always your input verbatim, one `back` away.
 */

/** How many neighbours a single hop tastes before committing to one. */
const POOL = 8

/**
 * One hop's stride. Conservative by design: three hops stay inside the family
 * and ~10 carry the palette out of it.
 */
const HOP = { h: 9, l: 0.022, c: 0.014 }

/**
 * Every subject carries a heading — a direction it is travelling — that
 * persists across hops and re-aims only slowly. Without one the walk is pure
 * diffusion: drift grows as √n, and the judge's restoring force (a palette
 * near an optimum scores worse in every direction) cancels most of what is
 * left. Measured, an undirected walk moved primary 7° in twelve hops, so
 * "repeatedly riffed out of recognition" could never happen.
 *
 * WANDER is how far a heading may re-aim per hop: small enough that three
 * consecutive hops travel the same way, large enough that thirty do not.
 */
const WANDER = 0.3

/** Spread of the pool around the heading — the variation the judge chooses between. */
const JITTER = 0.6

/** Hard bounds a walked seed may not leave, per axis. */
export interface Envelope {
  l: [number, number]
  c: [number, number]
}

/**
 * Where each role is allowed to roam: the region in which it still does its
 * job, NOT the tighter window `fidelityAdjust` normalizes toward. Those are
 * different things — at fidelity 0.5 a pastel input legitimately resolves
 * above the normalization window, and treating that window as a wall pinned
 * the seed to the boundary where it could only ever walk one way.
 *
 * Hue is deliberately unbounded. A status drifting off its anchor is a
 * legibility question, and the judge already prices it (`statusLegibility`,
 * the heaviest weight it carries); a second hard clamp here would just fight
 * the judge and pin danger to a single red forever.
 */
const ROLE_ENVELOPE: Record<Role, Envelope> = {
  primary: { l: [0.4, 0.8], c: [0.05, 0.26] },
  neutral: { l: [0.42, 0.58], c: [0, 0.035] },
  accent: { l: [0.45, 0.82], c: [0.05, 0.2] },
  danger: { l: [0.4, 0.7], c: [0.09, 0.24] },
  success: { l: [0.4, 0.78], c: [0.07, 0.2] },
  warning: { l: [0.6, 0.9], c: [0.07, 0.22] },
}

/** Matches chartAdjust's own clamps — a series colour must stay visible. */
const CHART_ENVELOPE: Envelope = { l: [0.45, 0.8], c: [0.09, 0.2] }

/**
 * How far a role travels per hop, relative to the stride. The identity roles
 * are what a riff is *for* — they carry the theme somewhere new. The statuses
 * are not: red means danger to a user no matter how many times the palette has
 * been riffed, so they drift slowly around their anchors instead of setting
 * off. Letting them travel at full stride cost ~0.24 of judge score by hop 3,
 * almost all of it `statusLegibility`.
 */
const TRAVEL: Record<Role, number> = {
  primary: 1,
  accent: 1,
  neutral: 1,
  danger: 0.25,
  success: 0.25,
  warning: 0.25,
}

export const travelFor = (role: Role): number => TRAVEL[role]

/**
 * A hop may not leave the palette worse than this. Requirement #1 in one
 * number: whatever a user reaches by riffing is at least as good as the theme
 * they'd have had without riffing at all, and never below an absolute bar.
 */
const ABSOLUTE_FLOOR = 0.8

/** Attempts a hop makes to clear the floor before settling for its best. */
const ATTEMPTS = 3

export const envelopeFor = (role: Role): Envelope => ROLE_ENVELOPE[role]
export const chartEnvelope = (): Envelope => CHART_ENVELOPE

export interface WalkSubject {
  /** Stable key for the keyed draws and the returned map: a role or `chart-N`. */
  id: string
  color: Oklch
  envelope: Envelope
  /** Locked by the user. It never moves, at any hop. The only such rule. */
  locked: boolean
  /** Mono lock: this seed may move in lightness only, never hue or chroma. */
  lightnessOnly: boolean
  /** Stride multiplier — see TRAVEL. Chart seeds travel at full stride. */
  travel: number
}

/**
 * Widen a bound to admit a value already outside it, leaving `room` on the far
 * side. Without the room a seed that starts past the boundary sits exactly on
 * its own ceiling, and every forward step clamps back to where it stood — a
 * ratchet that lets the colour move one way only.
 */
const admit = ([lo, hi]: [number, number], v: number, room: number): [number, number] => [
  Math.min(lo, v - room),
  Math.max(hi, v + room),
]

/** A direction of travel, one component per axis, each in [-1, 1]. */
interface Heading {
  h: number
  l: number
  c: number
}

/** Centre a [0,1) draw on zero. */
const centre = (u: number) => u * 2 - 1

const reaim = (v: number, u: number) => clamp(v + WANDER * centre(u), -1, 1)

function stepped(s: WalkSubject, c: Oklch, env: Envelope, aim: Heading, jit: Heading): Oklch {
  const move = (axis: 'h' | 'l' | 'c') => (aim[axis] * s.travel + JITTER * jit[axis]) * HOP[axis]
  const l = clamp(c.l + move('l'), env.l[0], env.l[1])
  if (s.lightnessOnly) return toGamut({ ...c, l })
  return toGamut({
    l,
    c: clamp(c.c + move('c'), env.c[0], env.c[1]),
    h: (c.h + move('h') + 360) % 360,
  })
}

/**
 * Walk `hops` steps from where the subjects stand. `hops === 0` returns the
 * starting colours untouched, so seed 0 remains the canonical cookbook
 * bit-for-bit. `judge` scores a whole proposed palette; the walk itself knows
 * nothing about what makes one good — it only decides where the palette may
 * go, never whether the destination is worth having.
 */
export function walkPalette(
  subjects: WalkSubject[],
  hops: number,
  judge: (colors: Map<string, Oklch>) => number,
): Map<string, Oklch> {
  let current = new Map(subjects.map((s) => [s.id, s.color]))
  if (hops <= 0) return current

  const movable = subjects.filter((s) => !s.locked)
  if (movable.length === 0) return current

  // Envelopes are fixed at hop 0 and widened to admit the colour they start
  // from. A verbatim input outside its role's region is therefore never yanked
  // into it — it simply cannot wander further out than it already sits.
  const envelopes = new Map(
    subjects.map((s) => [
      s.id,
      {
        l: admit(s.envelope.l, s.color.l, HOP.l),
        c: admit(s.envelope.c, s.color.c, HOP.c),
      },
    ]),
  )

  // Initial headings, keyed per subject so the roles set off in different
  // directions rather than the whole palette sliding as one block.
  const heading = new Map<string, Heading>(
    movable.map((s) => {
      const aim = (axis: string) => {
        const u = draw(0, s.id, `heading ${axis}`)
        // Bias away from zero: a heading near 0 is no heading at all, and the
        // axis would sit still for the whole walk.
        return (u < 0.5 ? -1 : 1) * (0.6 + 0.4 * Math.abs(centre(u)))
      }
      return [s.id, { h: aim('h'), l: aim('l'), c: aim('c') }]
    }),
  )

  // A hop may not leave the palette below where it began, nor below the bar.
  const floor = Math.min(judge(current), ABSOLUTE_FLOOR)

  for (let hop = 1; hop <= hops; hop++) {
    // Keyed on the hop index alone, so hop n is reproducible and `back` is
    // exact. The offsets a hop offers are fixed; which one wins is not,
    // because the judge scores them against this particular palette.
    const hopSeed = subSeed(hop, 'riff hop')
    for (const s of movable) {
      const a = heading.get(s.id)!
      heading.set(s.id, {
        h: reaim(a.h, draw(hopSeed, s.id, 'reaim h')),
        l: reaim(a.l, draw(hopSeed, s.id, 'reaim l')),
        c: reaim(a.c, draw(hopSeed, s.id, 'reaim c')),
      })
    }

    // Taste the pool along the current heading. If the whole pool is below the
    // floor, the palette is walking into a wall — reflect and try the other
    // way, then try barely moving at all. The reflected heading is kept, so a
    // bounce changes where the walk goes next rather than just this hop.
    let best = current
    let bestScore = -Infinity
    let bestAim: Map<string, Heading> | null = null
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const scale = attempt === 0 ? 1 : attempt === 1 ? -1 : 0.25
      const aims = new Map(
        movable.map((s) => {
          const a = heading.get(s.id)!
          return [s.id, { h: a.h * scale, l: a.l * scale, c: a.c * scale }] as const
        }),
      )
      for (let k = 0; k < POOL; k++) {
        const proposal = new Map(current)
        for (const s of movable) {
          const jit = {
            h: centre(draw(hopSeed, s.id, `h ${k}`)),
            l: centre(draw(hopSeed, s.id, `l ${k}`)),
            c: centre(draw(hopSeed, s.id, `c ${k}`)),
          }
          proposal.set(s.id, stepped(s, current.get(s.id)!, envelopes.get(s.id)!, aims.get(s.id)!, jit))
        }
        const score = judge(proposal)
        if (score > bestScore) {
          bestScore = score
          best = proposal
          bestAim = aims
        }
      }
      if (bestScore >= floor) break
    }
    if (bestAim) for (const [id, a] of bestAim) heading.set(id, a)
    current = best
  }
  return current
}
