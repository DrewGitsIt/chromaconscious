import { describe, expect, it } from 'vitest'
import { candidatesFromList, generateTheme, parseColor, toHex } from './engine'
import type { ColorCandidate } from './engine'
import {
  benchCandidate,
  deriveRole,
  hasDerivedSeats,
  keepRole,
  placeInRole,
  readBoard,
  dropCandidate,
  readableInk,
  remapAfterRemove,
  resetPlacements,
  unbenchCandidate,
  wellOn,
} from './board'

const theme = (candidates: ColorCandidate[]) =>
  generateTheme({ candidates, fidelity: 0.5 })
const board = (candidates: ColorCandidate[]) =>
  readBoard(theme(candidates), candidates, 'light')

const seat = (candidates: ColorCandidate[], role: string) =>
  board(candidates).slots.find((s) => s.role === role)!

describe('readBoard', () => {
  it('fills every role seat, always', () => {
    const c = candidatesFromList(['#7832c3'])
    const v = board(c)
    expect(v.slots).toHaveLength(6)
    expect(v.slots.every((s) => /^#[0-9a-f]{6}$/i.test(s.hex))).toBe(true)
    expect(v.series).toHaveLength(5)
  })

  it('marks a user color "yours" and an engine seat "derived"', () => {
    const c = candidatesFromList(['#7832c3'])
    const v = board(c)
    expect(seat(c, 'primary').provenance).toBe('yours')
    // one purple can't fill six seats
    expect(v.slots.filter((s) => s.provenance === 'derived').length).toBeGreaterThan(0)
  })

  it('a promoted invented seed reads "kept", not "yours"', () => {
    const c = candidatesFromList(['#7832c3'])
    const danger = seat(c, 'danger')
    expect(danger.provenance).toBe('derived')
    const next = keepRole(c, 'danger', parseColor(danger.hex)!, danger.hex)
    const after = seat(next, 'danger')
    expect(after.provenance).toBe('kept')
    // and the color itself did not move — keeping freezes, it does not re-pick
    expect(after.hex).toBe(danger.hex)
  })
})

describe('verbs', () => {
  it('placeInRole seats the color and benches whoever it displaced', () => {
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const v = board(c)
    const primaryHolder = v.slots.find((s) => s.role === 'primary')!.candidateIndex!
    const other = [0, 1, 2].find((i) => i !== primaryHolder)!
    const next = placeInRole(c, other, 'primary', v)
    expect(next[other].pin).toBe('primary')
    expect(next[primaryHolder].benched).toBe(true)
    expect(seat(next, 'primary').candidateIndex).toBe(other)
    expect(board(next).bench.map((b) => b.candidateIndex)).toContain(primaryHolder)
  })

  it('deriveRole frees the seat; another of your colors may step in', () => {
    // The contract is "this color leaves the seat", NOT "the seat becomes
    // derived" — with colors to spare the engine simply casts the next best.
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const before = seat(c, 'primary')
    expect(before.provenance).toBe('yours')
    const next = deriveRole(c, 'primary', board(c))
    const after = seat(next, 'primary')
    expect(after.hex).not.toBe(before.hex)
    expect(after.candidateIndex).not.toBe(before.candidateIndex)
    expect(board(next).bench.map((x) => x.candidateIndex)).toContain(before.candidateIndex)
  })

  it('deriveRole yields a truly derived seat when nothing else can fill it', () => {
    const c = candidatesFromList(['#7832c3'])
    expect(seat(c, 'primary').provenance).toBe('yours')
    const next = deriveRole(c, 'primary', board(c))
    const after = seat(next, 'primary')
    expect(after.provenance).toBe('derived')
    expect(after.candidateIndex).toBeNull()
  })

  it('benching removes a color from every seat and surfaces it on the bench', () => {
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const held = board(c).slots.find((s) => s.candidateIndex != null)!.candidateIndex!
    const next = benchCandidate(c, held)
    const v = board(next)
    expect(v.slots.every((s) => s.candidateIndex !== held)).toBe(true)
    expect(v.series.every((s) => s.candidateIndex !== held)).toBe(true)
    const entry = v.bench.find((b) => b.candidateIndex === held)
    expect(entry?.parked).toBe(true)
  })

  it('unbenching lets the engine cast it again', () => {
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const held = board(c).slots.find((s) => s.candidateIndex != null)!.candidateIndex!
    const parked = benchCandidate(c, held)
    const restored = unbenchCandidate(parked, held)
    const v = readBoard(theme(restored), restored, 'light')
    expect(v.slots.some((s) => s.candidateIndex === held)).toBe(true)
  })

  it('resetPlacements returns the engine its own casting', () => {
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const moved = placeInRole(c, 2, 'primary', board(c))
    const back = resetPlacements(moved)
    expect(back.every((x) => x.pin === undefined && x.benched === false)).toBe(true)
    const a = board(c).slots.map((s) => s.hex)
    const b = board(back).slots.map((s) => s.hex)
    expect(b).toEqual(a)
  })
})

describe('riff surface', () => {
  it('a fully placed board leaves riff nothing to move', () => {
    const c = candidatesFromList(['#7832c3'])
    expect(hasDerivedSeats(board(c))).toBe(true)
  })

  it('riff moves derived seats and leaves yours/kept alone', () => {
    const c = candidatesFromList(['#7832c3'])
    const at = (seed: number) => readBoard(
      generateTheme({ candidates: c, fidelity: 0.5, seed }), c, 'light',
    )
    const a = at(0)
    const b = at(4)
    for (const role of ['primary', 'accent', 'neutral', 'danger', 'success', 'warning'] as const) {
      const s0 = a.slots.find((s) => s.role === role)!
      const s1 = b.slots.find((s) => s.role === role)!
      if (s0.provenance === 'yours') expect(s1.hex).toBe(s0.hex)
    }
    // and something actually moved
    expect(b.slots.map((s) => s.hex).join()).not.toBe(a.slots.map((s) => s.hex).join())
  })
})

describe('engine invariants the board relies on', () => {
  it('benched candidates never take a seat but stay visible', () => {
    const c: ColorCandidate[] = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const parked = benchCandidate(c, 0)
    const r = theme(parked)
    expect(r.assignments.every((a) => a.candidateIndex !== 0)).toBe(true)
    expect(r.chartCandidateIndexes).not.toContain(0)
    expect(r.unusedCandidateIndexes).toContain(0)
  })

  it('a benched mono base does not crown itself primary', () => {
    const c = benchCandidate(candidatesFromList(['#e63946', '#457b9d']), 0)
    const r = generateTheme({ candidates: c, fidelity: 0.5, monoBase: 0 })
    const primary = r.assignments.find((a) => a.role === 'primary')!
    expect(primary.candidateIndex).not.toBe(0)
  })

  it('order still breaks ties between bench-eligible colors', () => {
    // near-identical purples: nothing but position can separate them
    const a = candidatesFromList(['#7832c3', '#7a35c6', '#f1faee'])
    const b = candidatesFromList(['#7a35c6', '#7832c3', '#f1faee'])
    expect(toHex(theme(a).assignments.find((x) => x.role === 'primary')!.seed))
      .not.toBe(toHex(theme(b).assignments.find((x) => x.role === 'primary')!.seed))
  })
})

describe('readableInk', () => {
  it('picks dark ink on light surfaces and light ink on dark ones', () => {
    expect(readableInk('#ffffff')).toContain('0,0,0')
    expect(readableInk('#f1faee')).toContain('0,0,0')
    expect(readableInk('#000000')).toContain('255,255,255')
    expect(readableInk('#316264')).toContain('255,255,255')
  })
  it('wellOn matches the ink it sits under', () => {
    expect(wellOn('#ffffff')).toContain('0,0,0')
    expect(wellOn('#316264')).toContain('255,255,255')
  })
})

describe('remapAfterRemove — the mono lock is an index', () => {
  it('shifts an index down when something before it is removed', () => {
    expect(remapAfterRemove(2, 0)).toBe(1)
    expect(remapAfterRemove(2, 1)).toBe(1)
  })
  it('leaves an index alone when something after it is removed', () => {
    expect(remapAfterRemove(1, 2)).toBe(1)
    expect(remapAfterRemove(0, 2)).toBe(0)
  })
  it('clears the index when the named candidate is the one removed', () => {
    expect(remapAfterRemove(1, 1)).toBeNull()
  })
  it('passes null through', () => {
    expect(remapAfterRemove(null, 0)).toBeNull()
  })
  it('keeps the base pointing at the same color across a drop', () => {
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const base = 2
    const kept = toHex(c[base].color)
    const next = dropCandidate(c, 0)
    const rebased = remapAfterRemove(base, 0)!
    expect(toHex(next[rebased].color)).toBe(kept)
  })
})
