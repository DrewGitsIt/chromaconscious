import { describe, expect, it } from 'vitest'
import { ROLES, candidatesFromList } from './engine'
import type { ThemeState } from './ops'
import { applyOp, buildTheme, emptyThemeState } from './ops'
import { lockSeries, readBoard } from './board'
import { PRESETS } from './presets'

const coastal = (): ThemeState => ({
  ...emptyThemeState(),
  candidates: candidatesFromList(PRESETS[0].colors),
  preset: PRESETS[0].name,
})
const light = { mode: 'light' as const }
const viewOf = (s: ThemeState) => readBoard(buildTheme(s)!, s.candidates, 'light')

describe('ops', () => {
  it('add appends parseable colours, skips the rest, and clears the preset', () => {
    const s = applyOp(coastal(), { op: 'add', colors: ['#ff0000', 'not a colour', 'oklch(0.7 0.1 200)'] }, light)
    expect(s.candidates).toHaveLength(7)
    expect(s.candidates.slice(-2).map((c) => c.raw)).toEqual(['#ff0000', 'oklch(0.7 0.1 200)'])
    expect(s.preset).toBeNull()
  })

  it('an op that changes nothing returns the same state object', () => {
    const s = coastal()
    expect(applyOp(s, { op: 'add', colors: ['nope'] }, light)).toBe(s)
    expect(applyOp(s, { op: 'drop', index: 99 }, light)).toBe(s)
    expect(applyOp(s, { op: 'mono', index: 99 }, light)).toBe(s)
    expect(applyOp(s, { op: 'unlock', role: 'primary' }, light)).toBe(s) // not locked
    // the preset tag survives a no-op — it only clears when the set diverges
    expect(applyOp(s, { op: 'unlock', role: 'primary' }, light).preset).toBe(PRESETS[0].name)
  })

  it('start and preset replace the set and reset riff + mono, keeping taste and separation', () => {
    const s = { ...coastal(), seed: 7, monoBase: 2, fidelity: 0.8, separation: 'lifted' as const }
    const p = applyOp(s, { op: 'preset', name: 'Ink & sky', colors: ['#0f172a', '#38bdf8'] }, light)
    expect(p).toMatchObject({ seed: 0, monoBase: null, fidelity: 0.8, separation: 'lifted', preset: 'Ink & sky' })
    expect(p.candidates.map((c) => c.raw)).toEqual(['#0f172a', '#38bdf8'])
  })

  it('drop remaps the mono base so the lock keeps naming the same colour', () => {
    const s = { ...coastal(), monoBase: 3 }
    expect(applyOp(s, { op: 'drop', index: 1 }, light).monoBase).toBe(2)
    expect(applyOp(s, { op: 'drop', index: 3 }, light).monoBase).toBeNull()
    expect(applyOp(s, { op: 'drop', index: 4 }, light).monoBase).toBe(3)
  })

  it('riff and back move the hop count, never below 0', () => {
    let s = coastal()
    s = applyOp(s, { op: 'riff' }, light)
    s = applyOp(s, { op: 'riff', hops: 4 }, light)
    expect(s.seed).toBe(5)
    expect(applyOp(s, { op: 'back', hops: 9 }, light).seed).toBe(0)
  })

  it('place seats a colour and benches the holder it displaced', () => {
    const s = coastal()
    const view = viewOf(s)
    const holder = view.slots.find((x) => x.role === 'primary')!.candidateIndex!
    const mover = s.candidates.findIndex((_, i) => i !== holder && !view.slots.some((x) => x.candidateIndex === i))
    const target = mover >= 0 ? mover : (holder + 1) % s.candidates.length
    const next = applyOp(s, { op: 'place', index: target, role: 'primary' }, light)
    expect(next.candidates[target].pin).toBe('primary')
    expect(next.candidates[holder]).toMatchObject({ benched: true })
    expect(viewOf(next).slots.find((x) => x.role === 'primary')!.candidateIndex).toBe(target)
  })

  it('lock on a derived seat keeps it, at exactly the colour on screen', () => {
    const s = { ...emptyThemeState(), candidates: candidatesFromList(['#3b82f6']) }
    const derived = viewOf(s).slots.find((x) => x.provenance === 'derived')!
    const next = applyOp(s, { op: 'lock', role: derived.role }, light)
    const kept = next.candidates.at(-1)!
    expect(kept).toMatchObject({ pin: derived.role, origin: 'invented', locked: true, raw: derived.hex })
    const slot = viewOf(next).slots.find((x) => x.role === derived.role)!
    expect(slot).toMatchObject({ provenance: 'kept', locked: true, hex: derived.hex })
  })

  it('a locked seat holds still through riffs; unlocking lets it walk again', () => {
    let s = coastal()
    s = applyOp(s, { op: 'lock', role: 'primary' }, light)
    const held = viewOf(s).slots.find((x) => x.role === 'primary')!.hex
    s = applyOp(s, { op: 'riff', hops: 6 }, light)
    expect(viewOf(s).slots.find((x) => x.role === 'primary')!.hex).toBe(held)
    s = applyOp(s, { op: 'unlock', role: 'primary' }, light)
    expect(viewOf(s).slots.find((x) => x.role === 'primary')!.locked).toBe(false)
  })

  it('lockSeries reads the board in the frame\'s mode, exactly as board.lockSeries does', () => {
    // NOTE (known, pre-existing): a locked series colour does not hold the hex
    // it showed — dark-mode tokens are re-derived from the locked seed, and a
    // riffed light board can reorder slots. Tracked separately; this test pins
    // only that the op is a faithful wrapper.
    const s = { ...emptyThemeState(), candidates: candidatesFromList(PRESETS[3].colors) }
    const dark = readBoard(buildTheme(s)!, s.candidates, 'dark')
    const entry = dark.series.find((x) => x.candidateIndex != null)!
    const next = applyOp(s, { op: 'lockSeries', slot: entry.slot }, { mode: 'dark' })
    expect(next.candidates).toEqual(lockSeries(s.candidates, entry.slot, dark))
    expect(next.candidates[entry.candidateIndex!].locked).toBe(true)
  })

  it('building the board itself gives the same answer as being handed one (API vs UI)', () => {
    const s = { ...coastal(), seed: 3 }
    const view = viewOf(s)
    for (const role of ROLES) {
      for (const op of [
        { op: 'lock', role },
        { op: 'derive', role },
        { op: 'adjust', role, color: '#123456' },
      ] as const) {
        expect(applyOp(s, op, light)).toEqual(applyOp(s, op, { ...light, view }))
      }
    }
  })
})
