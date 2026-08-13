import { describe, expect, it } from 'vitest'
import type { ColorCandidate, JudgeInput, Oklch, Role } from './index'
import { candidatesFromList, generateTheme, judgePalette } from './index'
import { assignRoles, chartAdjust } from './roles'
import { subSeed } from './random'

const PASTEL = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff']

/** The same judge input generateTheme feeds the sampler: one raw repertoire draw. */
function rawDraw(candidates: ColorCandidate[], seed: number, monoBase: number | null = null): JudgeInput {
  const r = assignRoles(candidates, 0.5, monoBase, seed)
  return {
    seeds: Object.fromEntries(r.assignments.map((a) => [a.role, a.seed])) as Record<Role, Oklch>,
    synthesized: r.assignments.filter((a) => a.candidateIndex == null).map((a) => a.role),
    chartSeeds: r.chartCandidateIndexes.map((ci) => chartAdjust(candidates[ci].color, 0.5)),
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

describe('palette judge', () => {
  it('is deterministic: same seeds in, same verdict out', () => {
    const input = rawDraw(candidatesFromList(['#7c3aed']), 4)
    expect(judgePalette(input)).toEqual(judgePalette(input))
    const a = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 3 })
    const b = generateTheme({ candidates: candidatesFromList(PASTEL), seed: 3 })
    expect(b.judge).toEqual(a.judge)
  })

  it('every feature and the score stay in [0,1] across varied inputs', () => {
    const inputs: JudgeInput[] = []
    for (const list of [['#7c3aed'], PASTEL, ['#837c6f', '#4e5c73', '#a2975c']]) {
      for (const seed of [0, 1, 5, 9]) inputs.push(rawDraw(candidatesFromList(list), seed))
    }
    // mono lock: the whole cast shares one hue — hue features must abstain, not blow up
    inputs.push(rawDraw(candidatesFromList(['#fa8072']), 2, 0))
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
    const verdict = judgePalette(rawDraw(candidatesFromList(['#7c3aed']), 0))
    expect(verdict.score).toBeGreaterThanOrEqual(0.6)
  })

  it('a deliberately clashing set scores clearly below canonical', () => {
    const canonical = rawDraw(candidatesFromList(['#7c3aed']), 0)
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

  it('best-of-K lifts every riff above the median raw draw', () => {
    const candidates = candidatesFromList(['#7c3aed'])
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
    const rawScores = seeds.map((s) => judgePalette(rawDraw(candidates, s)).score)
    const bar = median(rawScores)
    for (const s of seeds) {
      const sampled = generateTheme({ candidates, seed: s }).judge.score
      expect(sampled, `seed ${s}`).toBeGreaterThanOrEqual(bar)
    }
  })

  it('seed 0 bypasses sampling: judge reports the canonical draw itself', () => {
    const candidates = candidatesFromList(['#7c3aed'])
    const result = generateTheme({ candidates, seed: 0 })
    expect(result.judge).toEqual(judgePalette(rawDraw(candidates, 0)))
    // and the winning variant at seed s is exactly one keyed sub-draw of s
    const riffed = generateTheme({ candidates, seed: 2 })
    const pool = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (k) => judgePalette(rawDraw(candidates, subSeed(2, `variant ${k}`))).score,
    )
    expect(riffed.judge.score).toBe(Math.max(...pool))
  })
})
