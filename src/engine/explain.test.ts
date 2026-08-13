import { describe, expect, it } from 'vitest'
import type { CastingExplanation, ColorCandidate } from './types'
import { parseColor } from './color'
import { pinConsequence, whyLines } from './explain'

// Copy layer only: every fixture is a hand-built report — the strings must
// come out of the data, never out of the engine.

const cand = (
  hex: string,
  extra: Partial<ColorCandidate> = {},
): ColorCandidate => ({ raw: hex, color: parseColor(hex)!, source: 'manual', ...extra })

const seated = (outcome: CastingExplanation['outcome']): CastingExplanation => ({
  outcome,
  via: 'score',
  score: { total: 0.7, orderPrior: 0.08 },
  lost: [],
  gates: [],
})

describe('whyLines', () => {
  it('the list leader gets the leads line', () => {
    const candidates = [cand('#e63946'), cand('#457b9d')]
    const casting: CastingExplanation[] = [seated('primary'), seated('accent')]
    expect(whyLines(0, casting, candidates)[0]).toBe(
      'leads: strongest claim at the top of your list',
    )
  })

  it('a non-leading primary cites its score instead', () => {
    const candidates = [cand('#f1faee'), cand('#e63946')]
    const casting: CastingExplanation[] = [seated('neutral'), seated('primary')]
    expect(whyLines(1, casting, candidates)[0]).toBe(
      'strongest primary claim in the list (score 0.70)',
    )
  })

  it('accent cites hue distance from primary', () => {
    const candidates = [cand('#e63946'), cand('#457b9d')]
    const casting: CastingExplanation[] = [
      seated('primary'),
      { ...seated('accent'), hueDistToPrimary: 118.4 },
    ]
    expect(whyLines(1, casting, candidates)[0]).toBe(
      'most hue-distant vivid color from primary (Δh 118°)',
    )
  })

  it('a status role cites its anchor with the real hue delta', () => {
    const candidates = [cand('#457b9d'), cand('#ffd6a5')] // #ffd6a5 h≈71.6, warning anchor 80
    const casting: CastingExplanation[] = [seated('primary'), seated('warning')]
    expect(whyLines(1, casting, candidates)[0]).toBe('close to the amber warning hue (Δh 8°)')
  })

  it('a muted unused color explains both shut gates and the chart bar', () => {
    const candidates = [cand('#837c6f'), cand('#4e5c73')] // chroma ≈ 0.041
    const casting: CastingExplanation[] = [
      seated('neutral'),
      {
        outcome: 'unused',
        via: 'leftover',
        lost: [],
        gates: [
          { gate: 'accent-chroma', actual: 0.041, needed: 0.05 },
          { gate: 'status-chroma', actual: 0.041, needed: 0.055 },
          { gate: 'chart-chroma', actual: 0.041, needed: 0.05 },
        ],
      },
    ]
    const lines = whyLines(1, casting, candidates)
    expect(lines[0]).toBe('too muted for accent or a status — reads as tinted gray')
    expect(lines[1]).toBe('missed chart by a hair (chroma 0.041, needs 0.05)')
  })

  it('a clear chart-bar miss is stated flat, without the hair phrasing', () => {
    const candidates = [cand('#e63946'), cand('#f5f5f5')]
    const casting: CastingExplanation[] = [
      seated('primary'),
      {
        outcome: 'unused',
        via: 'leftover',
        lost: [],
        gates: [{ gate: 'chart-chroma', actual: 0.002, needed: 0.05 }],
      },
    ]
    expect(whyLines(1, casting, candidates)[0]).toBe('chroma 0.002 — under the chart bar (0.05)')
  })

  it('a lost neutral seat names the winner and calls out the purer gray', () => {
    const candidates = [cand('#030508'), cand('#837c6f')] // 0.011 vs 0.021 chroma
    const casting: CastingExplanation[] = [
      seated('neutral'),
      {
        outcome: 'unused',
        via: 'leftover',
        lost: [{ role: 'neutral', winnerIndex: 0, margin: 0.01 }],
        gates: [
          { gate: 'accent-chroma', actual: 0.021, needed: 0.05 },
          { gate: 'status-chroma', actual: 0.021, needed: 0.055 },
          { gate: 'chart-chroma', actual: 0.021, needed: 0.05 },
        ],
      },
    ]
    expect(whyLines(1, casting, candidates)).toContain('neutral went to #030508, a purer gray')
  })

  it('a narrowly lost seat is news; a settled race is not', () => {
    const candidates = [cand('#e63946'), cand('#ffd6a5')]
    const close: CastingExplanation[] = [
      seated('primary'),
      { ...seated('warning'), lost: [{ role: 'primary', winnerIndex: 0, margin: 0.05 }] },
    ]
    expect(whyLines(1, close, candidates)).toContain('primary went to #e63946 (ahead by 0.05)')
    const settled: CastingExplanation[] = [
      seated('primary'),
      { ...seated('warning'), lost: [{ role: 'primary', winnerIndex: 0, margin: 0.4 }] },
    ]
    expect(whyLines(1, settled, candidates)).toHaveLength(1)
  })

  it('a seat holder cites the rival it edged out when the race was close', () => {
    const candidates = [cand('#837c6f'), cand('#030508')]
    const casting: CastingExplanation[] = [
      { ...seated('neutral'), rival: { index: 1, margin: 0.01 } },
      seated('unused') as CastingExplanation,
    ]
    expect(whyLines(0, casting, candidates)).toContain('edged out #030508 by 0.01')
  })

  it('image-extracted candidates cite their pixel share', () => {
    const candidates = [cand('#5a7290', { source: 'image', share: 0.31 })]
    const casting: CastingExplanation[] = [seated('primary')]
    expect(whyLines(0, casting, candidates)).toContain('31% of your image')
  })

  it('a pinned candidate says so; a sub-gate chart pin discloses the nudge', () => {
    const candidates = [cand('#e63946'), cand('#4e5c73')]
    const casting: CastingExplanation[] = [
      { outcome: 'accent', via: 'pin', lost: [], gates: [] },
      { outcome: 'chart', via: 'pin', lost: [], gates: [] },
    ]
    expect(whyLines(0, casting, candidates)[0]).toBe(
      'pinned to accent by you — outranks all scoring',
    )
    const chartPin = whyLines(1, casting, candidates)
    expect(chartPin[0]).toBe('pinned to the chart series by you')
    expect(chartPin[1]).toBe(
      'below the chart bar — chroma gets nudged up so the series stays visible',
    )
  })

  it('never returns more than three lines', () => {
    const candidates = [
      cand('#030508', { source: 'image', share: 0.42 }),
      cand('#837c6f'),
    ]
    const casting: CastingExplanation[] = [
      {
        outcome: 'unused',
        via: 'leftover',
        lost: [{ role: 'neutral', winnerIndex: 1, margin: 0.01 }],
        gates: [
          { gate: 'accent-chroma', actual: 0.011, needed: 0.05 },
          { gate: 'status-chroma', actual: 0.011, needed: 0.055 },
          { gate: 'chart-chroma', actual: 0.011, needed: 0.05 },
        ],
      },
      seated('neutral'),
    ]
    expect(whyLines(0, casting, candidates)).toHaveLength(3)
  })
})

describe('pinConsequence', () => {
  const candidates = [cand('#e63946'), cand('#457b9d'), cand('#4e5c73')]
  const casting: CastingExplanation[] = [
    seated('primary'),
    { ...seated('accent'), rival: { index: 2, margin: 0.2 } },
    { outcome: 'unused', via: 'leftover', lost: [], gates: [] },
  ]

  it('taking an occupied seat benches the holder', () => {
    expect(pinConsequence(2, 'accent', casting, candidates)).toBe('benches #457b9d')
  })

  it('an empty (synthesized) seat is called out as invented', () => {
    expect(pinConsequence(2, 'danger', casting, candidates)).toBe(
      'takes a seat the engine was inventing',
    )
  })

  it('pinning a seat holder elsewhere frees its seat for the runner-up', () => {
    expect(pinConsequence(1, 'danger', casting, candidates)).toBe(
      'takes a seat the engine was inventing · frees accent for #4e5c73',
    )
  })

  it('pinning to the seat already held keeps it there', () => {
    expect(pinConsequence(0, 'primary', casting, candidates)).toBe(
      'keeps primary here through any reorder',
    )
  })

  it('chart pin on a sub-gate color discloses the chroma nudge', () => {
    expect(pinConsequence(2, 'chart', casting, candidates)).toBe(
      'nudges chroma up so the series stays visible',
    )
  })

  it('chart pin on a vivid color simply joins the series', () => {
    const vivid = [cand('#e63946'), cand('#f97316')]
    const cast: CastingExplanation[] = [seated('primary'), seated('unused') as CastingExplanation]
    expect(pinConsequence(1, 'chart', cast, vivid)).toBe('joins the chart series')
  })

  it('unpin goes back to the engine', () => {
    expect(pinConsequence(0, null, casting, candidates)).toBe('back to the engine’s choice')
  })
})
