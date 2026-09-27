import { describe, expect, it } from 'vitest'
import type { ColorCandidate, JudgeInput, Oklch, Role } from './index'
import { candidatesFromList, generateTheme, judgePalette } from './index'
import { assignRoles, chartAdjust } from './roles'

const PASTEL = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff']

/** The judge input at hop 0: the cookbook, before any riff walks away from it. */
function cookbook(candidates: ColorCandidate[], monoBase: number | null = null): JudgeInput {
  const r = assignRoles(candidates, 0.5, monoBase)
  return {
    seeds: Object.fromEntries(r.assignments.map((a) => [a.role, a.seed])) as Record<Role, Oklch>,
    synthesized: r.assignments.filter((a) => a.candidateIndex == null).map((a) => a.role),
    chartSeeds: r.chartCandidateIndexes.map((ci) => chartAdjust(candidates[ci].color, 0.5)),
  }
}

describe('palette judge', () => {
  it('is deterministic: same seeds in, same verdict out', () => {
    const input = cookbook(candidatesFromList(['#7c3aed']))
    expect(judgePalette(input)).toEqual(judgePalette(input))
    const a = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 3 })
    const b = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 3 })
    expect(b.judge).toEqual(a.judge)
  })

  it('every feature and the score stay in [0,1] across varied inputs', () => {
    const inputs: JudgeInput[] = []
    for (const list of [['#7c3aed'], PASTEL, ['#837c6f', '#4e5c73', '#a2975c']]) {
      inputs.push(cookbook(candidatesFromList(list)))
    }
    // mono lock: the whole cast shares one hue — hue features must abstain, not blow up
    inputs.push(cookbook(candidatesFromList(['#fa8072']), 0))
    for (const input of inputs) {
      const { score, features } = judgePalette(input)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
      for (const [name, f] of Object.entries(features)) {
        expect(f, name).toBeGreaterThanOrEqual(0)
        expect(f, name).toBeLessThanOrEqual(1)
      }
    }
  })

  it('the canonical cookbook for a mid-chroma single color is a sane baseline', () => {
    const verdict = judgePalette(cookbook(candidatesFromList(['#7c3aed'])))
    expect(verdict.score).toBeGreaterThanOrEqual(0.6)
  })

  it('a deliberately clashing set scores clearly below canonical', () => {
    const canonical = cookbook(candidatesFromList(['#7c3aed']))
    const clash: JudgeInput = {
      ...canonical,
      seeds: {
        ...canonical.seeds,
        // two statuses on the same hue, accent 10° from primary
        success: { ...canonical.seeds.success, h: canonical.seeds.danger.h },
        accent: { ...canonical.seeds.accent, h: (canonical.seeds.primary.h + 10) % 360 },
      },
    }
    const base = judgePalette(canonical).score
    expect(judgePalette(clash).score).toBeLessThan(base - 0.2)
  })

  it('no reachable seed falls through the quality floor', () => {
    // Each hop keeps the argmax of its pool and bounces off a wall it cannot
    // clear, so quality is defended at every step rather than only at the end.
    // The guarantee is a floor — min(cookbook, 0.8) — not "never worse than
    // the cookbook": a walk that may only improve could not travel at all,
    // and travelling is the point.
    for (const list of [['#7c3aed'], ['#c1663f'], ['#3a7ca5'], PASTEL]) {
      const candidates = candidatesFromList(list)
      const floor = Math.min(generateTheme({ candidates, seed: 0 }).judge.score, 0.8)
      for (let seed = 1; seed <= 25; seed++) {
        const { score } = generateTheme({ candidates, seed }).judge
        expect(score, `${list.join(' ')} @ ${seed}`).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('seed 0 is the cookbook itself, judged unwalked', () => {
    const candidates = candidatesFromList(['#7c3aed'])
    const result = generateTheme({ candidates, seed: 0 })
    expect(result.judge).toEqual(judgePalette(cookbook(candidates)))
  })
})
