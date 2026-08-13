import { describe, expect, it } from 'vitest'
import type { Role, ThemeResult } from './index'
import { candidatesFromList, generateTheme, parseColor } from './index'
import { hueDistance } from './color'

const PASTEL = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff']

const seedOf = (t: ThemeResult, role: Role) => t.assignments.find((a) => a.role === role)!.seed
const castOf = (t: ThemeResult, role: Role) =>
  t.assignments.find((a) => a.role === role)!.candidateIndex

describe('seeded repertoire', () => {
  it('the theme is a pure function of (candidates, seed)', () => {
    const a = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 3 })
    const b = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 3 })
    expect(b.light.tokens).toEqual(a.light.tokens)
    expect(b.dark.tokens).toEqual(a.dark.tokens)
    expect(b.assignments).toEqual(a.assignments)
  })

  it('seed 0 is the canonical cookbook — identical to a no-seed call', () => {
    const a = generateTheme({ candidates: candidatesFromList(PASTEL) })
    const b = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 0 })
    expect(a.seed).toBe(0)
    expect(b.light.tokens).toEqual(a.light.tokens)
    expect(b.dark.tokens).toEqual(a.dark.tokens)
    expect(b.assignments).toEqual(a.assignments)
  })

  it('two seeds re-imagine at least one synthesized seed for a single color', () => {
    const zero = generateTheme({ candidates: candidatesFromList(['#7c3aed']), seed: 0 })
    const one = generateTheme({ candidates: candidatesFromList(['#7c3aed']), seed: 1 })
    const synthesized = zero.assignments.filter((a) => a.candidateIndex == null)
    expect(synthesized.length).toBeGreaterThan(0)
    const moved = synthesized.filter((a) => {
      const riffed = seedOf(one, a.role)
      return riffed.l !== a.seed.l || riffed.c !== a.seed.c || riffed.h !== a.seed.h
    })
    expect(moved.length).toBeGreaterThan(0)
  })

  it('user-cast roles hold still across seeds 0..5 while invented roles riff', () => {
    const themes = [0, 1, 2, 3, 4, 5].map((seed) =>
      generateTheme({ candidates: candidatesFromList(PASTEL), seed }),
    )
    // pastel picnic casts these four from the user's colors …
    for (const role of ['primary', 'accent', 'success', 'warning'] as const) {
      expect(castOf(themes[0], role), `${role} is user-cast`).not.toBeNull()
      for (const t of themes) {
        expect(seedOf(t, role), `${role} at seed ${t.seed}`).toEqual(seedOf(themes[0], role))
      }
    }
    // … and invents these two, which must actually vary with the seed
    for (const role of ['danger', 'neutral'] as const) {
      expect(castOf(themes[0], role), `${role} is invented`).toBeNull()
      const distinct = new Set(themes.map((t) => JSON.stringify(seedOf(t, role))))
      expect(distinct.size, `${role} riffs`).toBeGreaterThan(1)
    }
  })

  it('mono lock: riffs move lightness/chroma only, never the locked hue', () => {
    const base = parseColor('#fa8072')!
    const themes = [0, 1, 2, 3, 4, 5].map((seed) =>
      generateTheme({ candidates: candidatesFromList(['#fa8072']), monoBase: 0, seed }),
    )
    for (const t of themes) {
      for (const a of t.assignments) {
        if (a.seed.c > 0.01) {
          expect(hueDistance(a.seed.h, base.h), `${a.role} at seed ${t.seed}`).toBeLessThan(2)
        }
      }
    }
    const distinct = new Set(
      themes.map((t) => JSON.stringify(t.assignments.map((a) => a.seed))),
    )
    expect(distinct.size, 'mono riffs still vary placement').toBeGreaterThan(1)
  })

  it('best-of-K sampling never collapses variety: seeds 1..8 explore distinct accent relationships', () => {
    // The judge plateaus across the strong hue relations, so argmax must keep
    // walking the repertoire instead of converging on one favorite.
    const rels = new Set<number>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const t = generateTheme({ candidates: candidatesFromList(['#7c3aed']), seed })
      const delta =
        (((seedOf(t, 'accent').h - seedOf(t, 'primary').h) % 360) + 360) % 360
      const signed = delta > 180 ? delta - 360 : delta
      // bucket to the repertoire's named relations (repair may nudge a few degrees)
      rels.add(
        [30, -30, 60, -60, 120, -120, 150, -150, 180].reduce((a, b) =>
          Math.abs(signed - a) < Math.abs(signed - b) ? a : b,
        ),
      )
    }
    expect(rels.size).toBeGreaterThanOrEqual(3)
  })

  it('riffed themes still pass every text-contrast check', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = generateTheme({ candidates: candidatesFromList(['#7c3aed']), seed })
      for (const mode of [result.light, result.dark]) {
        for (const r of mode.report.filter((r) => r.requiredWcag === 4.5)) {
          expect(r.wcag, `seed ${seed}: ${r.token} on ${r.background}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
