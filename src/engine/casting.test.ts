import { describe, expect, it } from 'vitest'
import { candidatesFromList, generateTheme, parseColor } from './index'
import { hueDistance } from './color'
import { extractCandidates } from './extract'
import { chartAdjust } from './roles'

// Casting is a function of (color properties, list order, pins) with one
// monotonic order prior: higher in the list = stronger claim on every seat.
// These tests are the gate on that contract — especially that deleting the
// old accent rarity term didn't cost us rare-vivid-accent behavior.

const PICNIC = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff']

const byRole = (result: ReturnType<typeof generateTheme>) =>
  Object.fromEntries(result.assignments.map((a) => [a.role, a.candidateIndex]))

describe('order prior', () => {
  it('casts the pastel picnic preset in default order', () => {
    const result = generateTheme({ candidates: candidatesFromList(PICNIC) })
    const roles = byRole(result)
    expect(roles.primary).toBe(0) // #ffadad
    expect(roles.warning).toBe(1) // #ffd6a5
    expect(roles.success).toBe(3) // #caffbf
    expect(roles.accent).toBe(5) // #a0c4ff
    // yellow + cyan are leftovers → chart
    expect([...result.chartCandidateIndexes].sort()).toEqual([2, 4])
  })

  it('moving the accent UP keeps it accent — prominence can never demote', () => {
    // #a0c4ff dragged from last to position 2: under the old weight scoring
    // this demoted it to chart (rarity bonus lost). That must be impossible.
    const moved = ['#ffadad', '#a0c4ff', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff']
    const result = generateTheme({ candidates: candidatesFromList(moved) })
    const roles = byRole(result)
    expect(roles.accent).toBe(1) // #a0c4ff, still accent
    expect(roles.primary).toBe(0) // #ffadad still leads
    expect(result.chartCandidateIndexes).not.toContain(1)
  })
})

describe('primary never synthesizes while a free candidate exists', () => {
  it('a lone gray leads the theme instead of an invented blue', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#808080']) })
    const primary = result.assignments.find((a) => a.role === 'primary')!
    expect(primary.candidateIndex).toBe(0)
  })

  it('an all-muted palette is led by its best muted color', () => {
    // Drew's murk palette head: none of these clear the primary threshold on
    // fit alone, but the theme must still derive from the user's colors.
    const result = generateTheme({ candidates: candidatesFromList(['#837c6f', '#4e5c73', '#a2975c']) })
    const primary = result.assignments.find((a) => a.role === 'primary')!
    expect(primary.candidateIndex).not.toBeNull()
  })
})

describe('image extraction → casting', () => {
  const buffer = (parts: Array<[rgb: [number, number, number], n: number]>) => {
    const px: number[] = []
    for (const [rgb, n] of parts) {
      for (let i = 0; i < n; i++) px.push(rgb[0], rgb[1], rgb[2], 255)
    }
    return new Uint8ClampedArray(px)
  }

  // ~85% desaturated slate blue, ~12% warm gray, ~3% vivid orange.
  const slateScene = () =>
    buffer([
      [[90, 114, 144], 850], // #5a7290 slate blue, chromatic but muted
      [[138, 129, 120], 120], // #8a8178 warm gray
      [[249, 115, 22], 30], // #f97316 vivid orange
    ])

  it('sorts extracted candidates most-populous-first with display-only share', () => {
    const out = extractCandidates(slateScene())
    expect(out).toHaveLength(3)
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].share!).toBeGreaterThanOrEqual(out[i].share!)
    }
    expect(out[0].share!).toBeGreaterThan(0.8) // the slate mass
    expect(out[2].share!).toBeLessThan(0.05) // the rare orange
  })

  it('the rare vivid orange wins accent on hue distance + chroma alone', () => {
    const out = extractCandidates(slateScene())
    const result = generateTheme({ candidates: out })
    const roles = byRole(result)
    // dominant muted slate leads, dominant gray seeds neutral
    expect(roles.primary).toBe(0)
    expect(roles.neutral).toBe(1)
    const accent = out[roles.accent as number]
    expect(accent.color.c).toBeGreaterThan(0.15)
    expect(hueDistance(accent.color.h, 47.6)).toBeLessThan(5) // the orange
  })

  it('a rare vivid pink against dominant greens: pink is the accent', () => {
    const result = generateTheme({
      candidates: extractCandidates(
        buffer([
          [[85, 122, 80], 850], // #557a50 muted green mass
          [[67, 102, 63], 120], // #43663f darker green, same hue neighborhood
          [[236, 72, 153], 30], // #ec4899 vivid pink
        ]),
      ),
    })
    const roles = byRole(result)
    expect(roles.primary).toBe(0) // the dominant green leads
    const accent = result.assignments.find((a) => a.role === 'accent')!
    expect(accent.candidateIndex).not.toBeNull()
    const seed = accent.seed
    expect(hueDistance(seed.h, 354.3)).toBeLessThan(20) // the pink
  })
})

describe('pin to chart', () => {
  // Drew's murk mid-list: #4e5c73 has chroma ≈ 0.041, under the 0.05 chart gate.
  const MURK_HEAD = ['#837c6f', '#030508', '#4e5c73', '#a2975c']

  it('a chart-pinned candidate skips role scoring and leads the series', () => {
    const candidates = candidatesFromList(['#e63946', '#f1faee', '#a8dadc', '#457b9d'])
    candidates[3].pin = 'chart'
    const result = generateTheme({ candidates })
    expect(result.chartCandidateIndexes[0]).toBe(3)
    expect(result.assignments.every((a) => a.candidateIndex !== 3)).toBe(true)
  })

  it('the pin bypasses the chroma gate a leftover would fail', () => {
    const candidates = candidatesFromList(MURK_HEAD)
    // unpinned: #4e5c73 is unused (chroma 0.041 < 0.05)
    const before = generateTheme({ candidates: candidatesFromList(MURK_HEAD) })
    expect(before.unusedCandidateIndexes).toContain(2)
    candidates[2].pin = 'chart'
    const result = generateTheme({ candidates })
    expect(result.chartCandidateIndexes).toContain(2)
    expect(result.unusedCandidateIndexes).not.toContain(2)
    expect(result.casting[2]).toMatchObject({ outcome: 'chart', via: 'pin' })
  })

  it('chartAdjust nudges a sub-gate chroma into visibility at fidelity 0.5', () => {
    const input = parseColor('#4e5c73')!
    expect(input.c).toBeLessThan(0.05)
    const adjusted = chartAdjust(input, 0.5)
    expect(adjusted.c).toBeGreaterThan(0.06) // clearly a colored series, not gray
    expect(adjusted.l).toBeGreaterThanOrEqual(0.45)
    expect(adjusted.l).toBeLessThanOrEqual(0.8)
  })

  it('the pinned series color stays visible end-to-end in the theme tokens', () => {
    const candidates = candidatesFromList(MURK_HEAD)
    candidates[2].pin = 'chart'
    const result = generateTheme({ candidates, fidelity: 0.5 })
    const k = result.chartCandidateIndexes.indexOf(2) + 1
    const series = parseColor(result.light.tokens[`chart-${k}`])!
    expect(series.c).toBeGreaterThan(0.05)
  })
})

describe('casting report', () => {
  it('is emitted per candidate, parallel to the input list', () => {
    const result = generateTheme({ candidates: candidatesFromList(PICNIC) })
    expect(result.casting).toHaveLength(PICNIC.length)
    const outcomes = Object.fromEntries(result.casting.map((c, i) => [PICNIC[i], c.outcome]))
    expect(outcomes['#ffadad']).toBe('primary')
    expect(outcomes['#a0c4ff']).toBe('accent')
    expect(outcomes['#fdffb6']).toBe('chart')
  })

  it('records a near-missed chart gate with actual vs needed chroma', () => {
    const murk = ['#837c6f', '#030508', '#4e5c73', '#a2975c', '#a1e501', '#794b4b', '#846d99']
    const result = generateTheme({ candidates: candidatesFromList(murk) })
    const slate = result.casting[2] // #4e5c73, chroma ≈ 0.041
    expect(slate.outcome).toBe('unused')
    const gate = slate.gates.find((g) => g.gate === 'chart-chroma')!
    expect(gate.needed).toBe(0.05)
    expect(gate.actual).toBeGreaterThan(0.03)
    expect(gate.actual).toBeLessThan(0.05)
  })

  it('names the winner and margin for a seat a candidate lost', () => {
    const murk = ['#837c6f', '#030508', '#4e5c73', '#a2975c', '#a1e501', '#794b4b', '#846d99']
    const result = generateTheme({ candidates: candidatesFromList(murk) })
    const black = result.casting[1] // #030508 lost neutral to #837c6f (order prior)
    const lostNeutral = black.lost.find((l) => l.role === 'neutral')!
    expect(lostNeutral.winnerIndex).toBe(0)
    expect(lostNeutral.margin).toBeGreaterThan(0)
  })

  it('reports scores as data, not strings', () => {
    const result = generateTheme({ candidates: candidatesFromList(PICNIC) })
    const primary = result.casting[0]
    expect(primary.via).toBe('score')
    expect(primary.score!.total).toBeGreaterThan(0)
    expect(primary.score!.orderPrior).toBeGreaterThan(0)
  })
})
