import { describe, expect, it } from 'vitest'
import type { ColorCandidate, Oklch, Role, ThemeResult } from './index'
import { candidatesFromList, generateTheme, parseColor } from './index'
import { deltaEok, hueDistance } from './color'
import type { WalkSubject } from './walk'
import { chartEnvelope, envelopeFor, walkPalette } from './walk'

/**
 * Riff is a directed walk (walk.ts), and these are the three promises it makes
 * to the user:
 *
 *   R1  every palette you can reach looks good and respects WCAG 2.1 contrast
 *   R2  a lock — and only a lock — freezes a colour; everything else riffs
 *   R3  three hops keep the palette recognizable; repeated hops carry it away
 *
 * R3 needs BOTH halves to mean anything. The predecessor drew each seed i.i.d.
 * from a weighted repertoire, so its drift oscillated (0.205, 0.048, 0.196,
 * 0.192, 0.039 — it kept falling back onto the canonical option): "close at
 * three hops" was true of it by accident, and "further after twelve" was never
 * true at all. Every threshold below is chosen so the accumulation half fails
 * loudly on that behaviour.
 */

const PASTEL = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff']
const FLAG = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557']
/** The muddy-photo palette: four olives 4° of hue apart plus skin tones. */
const HEADSHOT = ['#60742e', '#9b6d55', '#050200', '#3d5118', '#152002', '#293b05']

/**
 * A board that fills every seat and every chart series with a user colour and
 * leaves nothing over: six roles cast from the first six, five chart series
 * from the rest. Nothing here is synthesized, so if provenance were still
 * quietly freezing colours this board would not riff at all.
 */
const BOARD_11 = [
  '#c1663f',
  '#3a7ca5',
  '#8a8f98',
  '#d33f3f',
  '#2f9e6b',
  '#e0a63c',
  '#7c3aed',
  '#d946a0',
  '#0ea5a5',
  '#84cc16',
  '#f97316',
]

/** Starters spanning single colours, full boards, pastels and muddy photos. */
const STARTERS: Array<[string, string[]]> = [
  ['terracotta', ['#c1663f']],
  ['violet', ['#7c3aed']],
  ['steel', ['#3a7ca5']],
  ['forest', ['#2f6f4e']],
  ['crimson', ['#b81d3a']],
  ['mustard', ['#c99700']],
  ['ink & sky', ['#0f172a', '#38bdf8']],
  ['earth', ['#8c5a3c', '#d9a066', '#4f3824']],
  ['pastel picnic', PASTEL],
  ['flag', FLAG],
  ['headshot', HEADSHOT],
  ['full board', BOARD_11],
]

const ROLES: Role[] = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning']
const IDENTITY: Role[] = ['primary', 'accent', 'neutral']
const STATUSES: Role[] = ['danger', 'success', 'warning']

const seedOf = (t: ThemeResult, role: Role) => t.assignments.find((a) => a.role === role)!.seed
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** How far a palette has travelled from another: mean ΔE-OK over the six seats. */
const drift = (a: ThemeResult, b: ThemeResult) =>
  mean(ROLES.map((r) => deltaEok(seedOf(a, r), seedOf(b, r))))

/**
 * Hops 0..n of one starter, so a whole trajectory can be measured at once.
 * Memoized and extended in place: the drift tests walk the same starters to
 * different depths, and re-walking 25 hops per assertion tripled the runtime.
 */
const WALKS = new Map<string, ThemeResult[]>()
function trajectory(list: string[], n: number, fidelity?: number): ThemeResult[] {
  const key = `${list.join(',')}|${fidelity ?? ''}`
  const walked = WALKS.get(key) ?? []
  if (walked.length <= n) {
    const candidates = candidatesFromList(list)
    for (let seed = walked.length; seed <= n; seed++) {
      walked.push(generateTheme({ candidates, fidelity, seed }))
    }
    WALKS.set(key, walked)
  }
  return walked.slice(0, n + 1)
}

const lockAll = (candidates: ColorCandidate[]) =>
  candidates.map((c) => ({ ...c, locked: true }) satisfies ColorCandidate)

describe('the walk: hop 0, purity, and going back', () => {
  it('the theme is a pure function of (candidates, fidelity, monoBase, separation, seed)', () => {
    // Nothing else is an input: no clock, no module-level state, no counter
    // that advances per call. Two runs of the same arguments are the same
    // theme, which is what makes hop n reproducible and `back` exact.
    const shapes = [
      { fidelity: 0.35, separation: 'lifted' as const, seed: 7 },
      { fidelity: 1, separation: 'flat' as const, seed: 12, monoBase: 0 },
      { fidelity: 0, separation: 'layered' as const, seed: 0 },
    ]
    for (const shape of shapes) {
      const a = generateTheme({ candidates: candidatesFromList(PASTEL), ...shape })
      const b = generateTheme({ candidates: candidatesFromList(PASTEL), ...shape })
      const label = JSON.stringify(shape)
      expect(b.light.tokens, label).toEqual(a.light.tokens)
      expect(b.dark.tokens, label).toEqual(a.dark.tokens)
      expect(b.assignments, label).toEqual(a.assignments)
      expect(b.judge, label).toEqual(a.judge)
    }
  })

  it('seed 0 is the canonical cookbook — identical to a no-seed call', () => {
    const a = generateTheme({ candidates: candidatesFromList(PASTEL) })
    const b = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 0 })
    expect(a.seed).toBe(0)
    expect(b.light.tokens).toEqual(a.light.tokens)
    expect(b.dark.tokens).toEqual(a.dark.tokens)
    expect(b.assignments).toEqual(a.assignments)
  })

  it('walkPalette with no hops returns its input untouched', () => {
    const subjects = roleSubjects()
    for (const hops of [0, -1]) {
      const out = walkPalette(subjects, hops, () => 0.5)
      expect([...out.entries()]).toEqual(subjects.map((s) => [s.id, s.color]))
    }
  })

  it('`back` is exact: hop n-1 is the palette you stood on before hopping', () => {
    // The seed IS the hop count and each hop is keyed on its index alone, so
    // stepping back is a re-generate, not an undo stack.
    const candidates = candidatesFromList(FLAG)
    const before = generateTheme({ candidates, seed: 4 })
    generateTheme({ candidates, seed: 5 })
    const back = generateTheme({ candidates, seed: 4 })
    expect(back.assignments).toEqual(before.assignments)
    expect(back.light.tokens).toEqual(before.light.tokens)
    expect(back.dark.tokens).toEqual(before.dark.tokens)
  })

  it('casting is seed-independent: the riff never re-shuffles the board', () => {
    const candidates = candidatesFromList(BOARD_11)
    const zero = generateTheme({ candidates, seed: 0 })
    for (const seed of [1, 3, 7, 15, 30]) {
      const t = generateTheme({ candidates, seed })
      expect(t.assignments.map((a) => [a.role, a.candidateIndex])).toEqual(
        zero.assignments.map((a) => [a.role, a.candidateIndex]),
      )
      expect(t.chartCandidateIndexes).toEqual(zero.chartCandidateIndexes)
      expect(t.unusedCandidateIndexes).toEqual(zero.unusedCandidateIndexes)
    }
  })
})

describe('R1: every palette a riff can reach looks good', () => {
  it('no seed at any working fidelity produces a single contrast failure', () => {
    // 12 starters × 4 fidelities × hops 0..12, both modes: ~12,000 audited
    // pairs. Measured 0 failures, so this is an exact zero — one regression
    // anywhere in the reachable set trips it.
    let checks = 0
    for (const [name, list] of STARTERS) {
      for (const fidelity of [0, 0.25, 0.5, 0.75]) {
        for (const [seed, t] of trajectory(list, 12, fidelity).entries()) {
          for (const mode of [t.light, t.dark]) {
            for (const r of mode.report) {
              checks++
              expect(
                r.pass,
                `${name} f=${fidelity} hop=${seed}: ${r.token} on ${r.background} — ${r.wcag.toFixed(2)} < ${r.requiredWcag} (${r.fg} on ${r.bg})`,
              ).toBe(true)
            }
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(10000)
  })

  it('at verbatim fidelity text contrast still never fails, and no riff invents a new failure', () => {
    // Fidelity 1 is a promise to keep the user's colours, so a pale primary
    // can legitimately fail its 3:1 *non-text* pop — the engine discloses that
    // rather than forcing it (see the pinned-yellow case in engine.test.ts).
    // Measured across the same sweep: 0 failures on the 4.5 text rows, and
    // every 3:1 failure is one the cookbook at hop 0 already reported. What
    // must never happen is a riff walking into a failure of its own.
    for (const [name, list] of STARTERS) {
      const hops = trajectory(list, 12, 1)
      const cookbook = new Set<string>()
      for (const m of ['light', 'dark'] as const) {
        for (const r of hops[0][m].report) if (!r.pass) cookbook.add(`${m}:${r.token}/${r.background}`)
      }
      for (const [seed, t] of hops.entries()) {
        for (const m of ['light', 'dark'] as const) {
          for (const r of t[m].report) {
            if (r.requiredWcag === 4.5) {
              expect(r.wcag, `${name} hop=${seed}: ${r.token} on ${r.background}`).toBeGreaterThanOrEqual(4.5)
            } else if (!r.pass) {
              expect(
                cookbook,
                `${name} hop=${seed}: the riff invented a failure at ${r.token}/${r.background}`,
              ).toContain(`${m}:${r.token}/${r.background}`)
            }
          }
        }
      }
    }
  })

  it('no reachable seed drops below min(cookbook, 0.8), at any fidelity', () => {
    // The walk bounces off this floor rather than walking through it (see
    // ABSOLUTE_FLOOR in walk.ts). judge.test.ts pins the same guarantee at the
    // default fidelity; this widens it, because fidelity changes where the
    // cookbook starts and so where the floor sits. Measured worst margin over
    // the sweep: +0.008 above the floor, never below it.
    for (const [name, list] of STARTERS.slice(0, 8)) {
      const candidates = candidatesFromList(list)
      for (const fidelity of [0, 0.5, 1]) {
        const floor = Math.min(generateTheme({ candidates, fidelity, seed: 0 }).judge.score, 0.8)
        for (let seed = 1; seed <= 15; seed++) {
          const { score } = generateTheme({ candidates, fidelity, seed }).judge
          expect(score, `${name} f=${fidelity} hop=${seed}`).toBeGreaterThanOrEqual(floor)
        }
      }
    }
  })

  it('statuses travel at a quarter of the stride, so red keeps meaning danger', () => {
    // TRAVEL in walk.ts: the identity roles are what a riff is for, the
    // statuses are not. Measured mean hue drift of the three statuses against
    // the three identity roles: 0.39 of it at hop 6, 0.27 at hop 12, worst
    // starter of twelve. 0.6 leaves room without admitting equal travel.
    for (const hop of [6, 12]) {
      for (const [name, list] of STARTERS) {
        const hops = trajectory(list, hop)
        const [zero, t] = [hops[0], hops[hop]]
        const rotation = (roles: Role[]) =>
          mean(roles.map((r) => hueDistance(seedOf(zero, r).h, seedOf(t, r).h)))
        expect(
          rotation(STATUSES),
          `${name} at hop ${hop}: statuses rotated ${rotation(STATUSES).toFixed(1)}°, identity ${rotation(IDENTITY).toFixed(1)}°`,
        ).toBeLessThan(0.6 * rotation(IDENTITY))
      }
    }
  })
})

/** Six role subjects at plausible seeds, for exercising walkPalette directly. */
function roleSubjects(): WalkSubject[] {
  const at: Record<Role, Oklch> = {
    primary: { l: 0.6, c: 0.13, h: 43 },
    accent: { l: 0.62, c: 0.11, h: 103 },
    neutral: { l: 0.5, c: 0.02, h: 43 },
    danger: { l: 0.55, c: 0.19, h: 27 },
    success: { l: 0.55, c: 0.11, h: 150 },
    warning: { l: 0.75, c: 0.16, h: 80 },
  }
  return ROLES.map((role) => ({
    id: role,
    color: at[role],
    envelope: envelopeFor(role),
    locked: false,
    lightnessOnly: false,
    travel: 1,
  }))
}

describe('R2: a lock is the only thing that freezes a colour', () => {
  it('walkPalette never moves a locked subject, however far the rest travel', () => {
    // Straight at the walk, with a judge that has no opinion — so nothing but
    // the lock itself can be holding the colour still. Forty hops is far past
    // any distance a user reaches by pressing riff.
    const subjects = roleSubjects().map((s) => ({ ...s, locked: s.id === 'primary' }))
    const out = walkPalette(subjects, 40, () => 0.5)
    expect(out.get('primary')).toEqual(subjects[0].color)
    for (const s of subjects.slice(1)) {
      expect(deltaEok(out.get(s.id)!, s.color), `${s.id} must walk`).toBeGreaterThan(0.02)
    }
  })

  it('walkPalette with every subject locked is a no-op, not an error', () => {
    const subjects = roleSubjects().map((s) => ({ ...s, locked: true }))
    const out = walkPalette(subjects, 25, () => 0.5)
    expect([...out.entries()]).toEqual(subjects.map((s) => [s.id, s.color]))
  })

  it('a chart subject walks inside the chart envelope, not a role envelope', () => {
    const env = chartEnvelope()
    const subjects: WalkSubject[] = [
      {
        id: 'chart-1',
        color: { l: 0.6, c: 0.14, h: 200 },
        envelope: env,
        locked: false,
        lightnessOnly: false,
        travel: 1,
      },
    ]
    for (let hops = 1; hops <= 20; hops++) {
      const c = walkPalette(subjects, hops, () => 0.5).get('chart-1')!
      expect(c.l, `hop ${hops} lightness`).toBeGreaterThanOrEqual(env.l[0] - 1e-9)
      expect(c.l, `hop ${hops} lightness`).toBeLessThanOrEqual(env.l[1] + 1e-9)
      expect(c.c, `hop ${hops} chroma`).toBeLessThanOrEqual(env.c[1] + 1e-9)
    }
  })

  it('locking every colour makes riff a no-op rather than an error', () => {
    const candidates = lockAll(candidatesFromList(BOARD_11))
    const zero = generateTheme({ candidates, seed: 0 })
    for (const seed of [1, 2, 5, 12, 30]) {
      const t = generateTheme({ candidates, seed })
      expect(t.light.tokens, `hop ${seed}`).toEqual(zero.light.tokens)
      expect(t.dark.tokens, `hop ${seed}`).toEqual(zero.dark.tokens)
      expect(t.assignments, `hop ${seed}`).toEqual(zero.assignments)
    }
  })

  it('a locked seat is byte-identical across every hop, at every fidelity', () => {
    // Fidelity has nothing to say about a lock. It governs how hard the engine
    // works to preserve a colour it is free to move; a locked colour is not one
    // of those, so hop 40 at fidelity 0 is the same seed as hop 0 at fidelity 1.
    // Every stage downstream of the walk obeys this, repair included.
    for (const [name, list] of [
      ['full board', BOARD_11],
      ['flag', FLAG],
      ['headshot', HEADSHOT],
    ] as const) {
      for (const fidelity of [0, 0.25, 0.5, 0.75, 1]) {
        const candidates = candidatesFromList(list)
        candidates[0].locked = true
        const zero = generateTheme({ candidates, fidelity, seed: 0 })
        const held = zero.assignments.find((a) => a.candidateIndex === 0)!
        for (let seed = 1; seed <= 12; seed++) {
          const t = generateTheme({ candidates, fidelity, seed })
          expect(
            seedOf(t, held.role),
            `${name} f=${fidelity}: locked ${held.role} moved at hop ${seed}`,
          ).toEqual(seedOf(zero, held.role))
        }
      }
    }
  })

  it('a locked seat makes its neighbour pay for the pairwise minimum', () => {
    // Two violets 6° apart: #7c3aed takes primary, #8348e8 takes accent, and
    // they sit 0.021 ΔE apart — well inside the 0.12 the accent needs to not
    // read as the primary. Repair has to move somebody. Locking the primary
    // says who: the accent walks away instead, the constraint is satisfied
    // with no residual, and the frozen colour is untouched at every hop.
    //
    // This is the case the lock used to fail. Repair was fidelity-gated rather
    // than lock-gated, so it spent the locked colour's budget too and the seat
    // drifted by up to 0.046 ΔE — a colour the user froze, visibly wandering
    // as its neighbours walked past it.
    const candidates = candidatesFromList(['#7c3aed', '#8348e8'])
    candidates[0].locked = true
    const zero = generateTheme({ candidates, fidelity: 0, seed: 0 })
    expect(zero.assignments.find((a) => a.role === 'primary')!.candidateIndex).toBe(0)
    expect(zero.assignments.find((a) => a.role === 'accent')!.candidateIndex).toBe(1)

    for (let seed = 0; seed <= 15; seed++) {
      const t = generateTheme({ candidates, fidelity: 0, seed })
      expect(seedOf(t, 'primary'), `locked primary moved at hop ${seed}`).toEqual(
        seedOf(zero, 'primary'),
      )
      // The accent absorbed the whole correction: PAIR_MIN.identity is 0.12,
      // and the measured separation never fell below 0.124 across 16 hops.
      expect(
        deltaEok(seedOf(t, 'primary'), seedOf(t, 'accent')),
        `primary and accent collapsed at hop ${seed}`,
      ).toBeGreaterThanOrEqual(0.12)
      expect(t.repairs, `hop ${seed} left a constraint unsatisfied`).toEqual([])
    }

    // And the proof that the constraint was live rather than trivially met:
    // lock the accent too and nobody is free to pay, so the same pair comes
    // back as a reported residual instead of a moved colour.
    const bothLocked = lockAll(candidatesFromList(['#7c3aed', '#8348e8']))
    const stuck = generateTheme({ candidates: bothLocked, fidelity: 0, seed: 0 })
    expect(stuck.repairs.map((r) => [r.a, r.b])).toEqual([['primary', 'accent']])
  })

  it('locking one colour leaves every other seat free to riff around it', () => {
    // "Riffed around them" is the user's phrase and this is it literally: one
    // colour pinned in place, the whole rest of the board still moving.
    const candidates = candidatesFromList(BOARD_11)
    candidates[0].locked = true
    const zero = generateTheme({ candidates, seed: 0 })
    const held = zero.assignments.find((a) => a.candidateIndex === 0)!.role
    const t = generateTheme({ candidates, seed: 6 })
    for (const role of ROLES) {
      if (role === held) continue
      // Six hops move even the slowest seat well past this; the smallest
      // measured was 0.037 (a status, at a quarter stride).
      expect(deltaEok(seedOf(zero, role), seedOf(t, role)), `${role} riffs`).toBeGreaterThan(0.01)
    }
    for (let k = 1; k <= 5; k++) {
      expect(t.light.tokens[`chart-${k}`], `chart-${k} riffs`).not.toBe(zero.light.tokens[`chart-${k}`])
    }
  })

  it('a full board with no locks riffs all six roles and all five chart series', () => {
    // Every seat here is a colour the user supplied and nothing is synthesized,
    // so this is the test that provenance no longer freezes anything. Smallest
    // measured single-role move at hop 1 was 0.0108, hence the 0.005 bar.
    const candidates = candidatesFromList(BOARD_11)
    const zero = generateTheme({ candidates, seed: 0 })
    expect(zero.assignments.every((a) => a.candidateIndex != null), 'every seat is user-cast').toBe(true)
    expect(zero.chartCandidateIndexes).toHaveLength(5)
    for (const seed of [1, 3, 6, 12]) {
      const t = generateTheme({ candidates, seed })
      for (const role of ROLES) {
        expect(deltaEok(seedOf(zero, role), seedOf(t, role)), `${role} at hop ${seed}`).toBeGreaterThan(0.005)
      }
      for (let k = 1; k <= 5; k++) {
        expect(t.light.tokens[`chart-${k}`], `chart-${k} at hop ${seed}`).not.toBe(
          zero.light.tokens[`chart-${k}`],
        )
      }
    }
  })

  it('an unlocked colour the user supplied walks like any other, at every fidelity', () => {
    // The old contract froze user-cast seats outright. Measured move of the
    // user's own primary over three hops: 0.097 at fidelity 0 and 0.5, 0.069
    // at verbatim — all far above the 0.02 bar.
    for (const fidelity of [0, 0.5, 1]) {
      const candidates = candidatesFromList(['#c1663f', '#3a7ca5'])
      const zero = generateTheme({ candidates, fidelity, seed: 0 })
      const t = generateTheme({ candidates, fidelity, seed: 3 })
      const primary = zero.assignments.find((a) => a.role === 'primary')!
      expect(primary.candidateIndex, 'primary is the user colour').not.toBeNull()
      expect(
        deltaEok(seedOf(zero, 'primary'), seedOf(t, 'primary')),
        `unlocked user primary at fidelity ${fidelity}`,
      ).toBeGreaterThan(0.02)
    }
  })

  it('mono lock: riffs move lightness and chroma only, never the locked hue', () => {
    const base = parseColor('#fa8072')!
    const candidates = candidatesFromList(['#fa8072'])
    const themes = [0, 1, 2, 3, 5, 8, 12].map((seed) =>
      generateTheme({ candidates, monoBase: 0, seed }),
    )
    for (const t of themes) {
      for (const a of t.assignments) {
        // hue is meaningless on near-achromatic seeds (the neutral)
        if (a.seed.c > 0.01) {
          expect(hueDistance(a.seed.h, base.h), `${a.role} at hop ${t.seed}`).toBeLessThan(2)
        }
      }
    }
    const distinct = new Set(themes.map((t) => JSON.stringify(t.assignments.map((a) => a.seed))))
    expect(distinct.size, 'a mono theme still riffs').toBe(themes.length)
  })
})

describe('R3: three hops keep the family, repeated hops leave it', () => {
  it('three hops leave every starter recognizable', () => {
    // Measured over 12 starters × 5 fidelities: mean role drift at hop 3 never
    // exceeded 0.075 (headshot at fidelity 0) and primary never rotated more
    // than 43° (headshot again — every other starter stayed under 35°). The
    // bars below sit ~1.5× and ~1.3× above those worst cases.
    for (const [name, list] of STARTERS) {
      for (const fidelity of [0, 0.5, 1]) {
        const hops = trajectory(list, 3, fidelity)
        for (let n = 1; n <= 3; n++) {
          expect(drift(hops[0], hops[n]), `${name} f=${fidelity} at hop ${n}`).toBeLessThan(0.11)
          expect(
            hueDistance(seedOf(hops[0], 'primary').h, seedOf(hops[n], 'primary').h),
            `${name} f=${fidelity}: primary hue at hop ${n}`,
          ).toBeLessThan(55)
        }
      }
    }
  })

  it('a terracotta palette is still earth-toned after three hops', () => {
    // #c1663f resolves to a primary at hue 43°. Measured, the first three hops
    // take it to 51°, 62°, 65° — rust to amber to olive, all still earth. The
    // band [25, 90] is the earth register: below it is pink-red, above it is
    // green. Lightness moves 0.61 → 0.56 over the same three hops.
    const hops = trajectory(['#c1663f'], 3)
    const start = seedOf(hops[0], 'primary')
    for (let n = 1; n <= 3; n++) {
      const primary = seedOf(hops[n], 'primary')
      expect(primary.h, `hop ${n} left the earth band`).toBeGreaterThan(25)
      expect(primary.h, `hop ${n} left the earth band`).toBeLessThan(90)
      expect(hueDistance(primary.h, start.h), `hop ${n} hue`).toBeLessThan(30)
      expect(Math.abs(primary.l - start.l), `hop ${n} lightness`).toBeLessThan(0.1)
      expect(drift(hops[0], hops[n]), `hop ${n} palette drift`).toBeLessThan(0.07)
    }
  })

  it('drift accumulates instead of oscillating back to the start', () => {
    // THE test the old engine fails. Its drift bounced (0.205, 0.048, 0.196,
    // 0.192, 0.039) because each seed was an independent draw that kept
    // landing back on the canonical option. A walk cannot do that: over the
    // 12 starters × 2 fidelities below the largest single-hop backslide across
    // 25 hops was 0.0071 (0.0136 over a wider fidelity sweep), so 0.025 is a
    // bound the old behaviour misses by an order of magnitude — its worst
    // backslide was 0.157.
    for (const [name, list] of STARTERS) {
      for (const fidelity of [0, 0.5]) {
        const hops = trajectory(list, 25, fidelity)
        const d = hops.map((t) => drift(hops[0], t))
        for (let n = 1; n < d.length; n++) {
          expect(
            d[n],
            `${name} f=${fidelity}: hop ${n} fell back toward the start (${d[n - 1].toFixed(3)} → ${d[n].toFixed(3)})`,
          ).toBeGreaterThan(d[n - 1] - 0.025)
        }
        // And every late hop is further out than every early one: the walk has
        // a direction, not a home. Measured worst ratio of min(hops 8..25) to
        // max(hops 1..3) was 1.51 here, 1.40 over a wider fidelity sweep; an
        // i.i.d. sampler scores ~1, and the old engine scored below 1.
        const early = Math.max(...d.slice(1, 4))
        const late = Math.min(...d.slice(8))
        expect(
          late,
          `${name} f=${fidelity}: late hops (min ${late.toFixed(3)}) must all outrun early ones (max ${early.toFixed(3)})`,
        ).toBeGreaterThan(early * 1.2)
      }
    }
  })

  it('twelve hops carry a palette substantially further than three', () => {
    // Measured d12/d3 over 12 starters × 5 fidelities: minimum 1.58 (headshot
    // at fidelity 0.25), 1.66 over the two fidelities run here, typical
    // 2.5–3.4. 1.4 is the bar. The absolute floor matters too — a walk could
    // satisfy the ratio while barely moving — and the smallest measured d12
    // was 0.093.
    for (const [name, list] of STARTERS) {
      for (const fidelity of [0, 0.5]) {
        const hops = trajectory(list, 12, fidelity)
        const d3 = drift(hops[0], hops[3])
        const d12 = drift(hops[0], hops[12])
        expect(d12, `${name} f=${fidelity}: ${d12.toFixed(3)} vs ${d3.toFixed(3)}`).toBeGreaterThan(d3 * 1.4)
        expect(d12, `${name} f=${fidelity}: twelve hops barely moved`).toBeGreaterThan(0.06)
      }
    }
  })

  it('repeatedly riffed, terracotta leaves the earth band and does not come back', () => {
    // The other half of R3: recognizable at three hops must not mean stuck.
    // Measured, terracotta's primary hue reads 117° at hop 12 and 129–163°
    // from there to hop 25 — green, and never once back inside [25, 90].
    const hops = trajectory(['#c1663f'], 25)
    for (let n = 12; n <= 25; n++) {
      expect(seedOf(hops[n], 'primary').h, `hop ${n} is still earth-toned`).toBeGreaterThan(95)
    }
    expect(drift(hops[0], hops[25]), 'hop 25 is a different palette').toBeGreaterThan(0.12)
  })

  it('the primary keeps rotating with the hops rather than circling one spot', () => {
    // Per-starter proof that the heading persists: at hop 20 the primary has
    // rotated at least 77° from where it started in every starter measured
    // (worst: the flag palette). An undirected walk managed 7° in twelve hops.
    for (const [name, list] of STARTERS) {
      const hops = trajectory(list, 20)
      expect(
        hueDistance(seedOf(hops[0], 'primary').h, seedOf(hops[20], 'primary').h),
        `${name}: primary hue at hop 20`,
      ).toBeGreaterThan(50)
    }
  })
})
