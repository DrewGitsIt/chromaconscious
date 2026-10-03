import { describe, expect, it } from 'vitest'
import { ROLES, candidatesFromList, generateTheme, parseColor, toHex } from './engine'
import { applyOp, emptyThemeState } from './ops'
import { PRESETS } from './presets'
import type { ColorCandidate } from './engine'
import {
  adjustRole,
  benchCandidate,
  deriveRole,
  hasRiffableSeats,
  keepRole,
  lockRole,
  lockedFailure,
  seatDelta,
  setRoleInput,
  setSeriesColor,
  lockSeries,
  placeInRole,
  describePlacement,
  readBoard,
  wouldTakeOver,
  dropCandidate,
  readableInk,
  remapAfterRemove,
  resetPlacements,
  unbenchCandidate,
  unlockRole,
  unlockSeries,
  wellOn,
} from './board'

const theme = (candidates: ColorCandidate[], seed = 0) =>
  generateTheme({ candidates, fidelity: 0.5, seed })
const board = (candidates: ColorCandidate[], seed = 0) =>
  readBoard(theme(candidates, seed), candidates, 'light')

const seat = (candidates: ColorCandidate[], role: string) =>
  board(candidates).slots.find((s) => s.role === role)!
/** The same seat three riff hops along — where a lock has something to catch. */
const seat3 = (candidates: ColorCandidate[], role: string) =>
  board(candidates, 3).slots.find((s) => s.role === role)!

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

  it('a seat shows the colour in the theme, and keeps the input as sourceHex', () => {
    // The engine normalizes a user colour toward its role below fidelity 1, so
    // the seed and the input legitimately differ. The chip must track the seed
    // — it sits next to the preview the seed painted — and name the input too.
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const primary = seat(c, 'primary')
    expect(primary.hex).not.toBe('#e63946')
    expect(primary.sourceHex).toBe('#e63946')
    expect(primary.hex).toBe(toHex(theme(c).assignments.find((a) => a.role === 'primary')!.seed))
    // when they agree there is nothing to disclose
    const accent = seat(c, 'accent')
    expect(accent.hex).toBe('#457b9d')
    expect(accent.sourceHex).toBeNull()
    // a derived seat has no input to name
    expect(seat(c, 'danger').sourceHex).toBeNull()
  })

  it('a promoted invented seed reads "kept", not "yours" — and comes locked', () => {
    const c = candidatesFromList(['#7832c3'])
    const danger = seat(c, 'danger')
    expect(danger.provenance).toBe('derived')
    expect(danger.locked).toBe(false)
    const next = keepRole(c, 'danger', parseColor(danger.hex)!, danger.hex)
    const after = seat(next, 'danger')
    expect(after.provenance).toBe('kept')
    // and the color itself did not move — keeping freezes, it does not re-pick
    expect(after.hex).toBe(danger.hex)
    // "keep this one" has always meant "riff stops changing it"; that is the
    // lock now, not the provenance it happens to gain alongside it
    expect(after.locked).toBe(true)
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

describe('locks — the only thing that stops riff', () => {
  const FULL = ['#e63946', '#457b9d', '#f1faee', '#ef4444', '#22c55e', '#eab308']

  it('lockRole locks the colour in the seat, and unlockRole frees it again', () => {
    const c = candidatesFromList(FULL)
    const held = seat(c, 'accent').candidateIndex!
    const locked = lockRole(c, 'accent', board(c))
    expect(locked[held].locked).toBe(true)
    expect(seat(locked, 'accent').locked).toBe(true)
    // unlocking is NOT a bench and NOT an unpin: the colour stays put
    const back = unlockRole(locked, 'accent', board(locked))
    expect(back[held].locked).toBe(false)
    expect(back[held].pin).toBe(c[held].pin)
    expect(back[held].benched).toBe(c[held].benched)
    expect(seat(back, 'accent').candidateIndex).toBe(held)
  })

  it('lock freezes the colour you are looking at, not the one you typed', () => {
    // The loop this feature exists for: riff until you like something, lock
    // what you like, riff on. Setting the flag on the untouched candidate
    // looked right and broke exactly this — a seat three hops along rewound to
    // its input under the click meant to freeze it, so nothing the riff found
    // could ever be kept. Measured then: #aa6824 snapped back to #c1663f.
    const c = candidatesFromList(['#c1663f'])
    const walked = seat3(c, 'primary').hex
    expect(walked, 'three hops must actually move it, or this proves nothing').not.toBe(
      seat(c, 'primary').hex,
    )

    const locked = lockRole(c, 'primary', board(c, 3))
    expect(readBoard(theme(locked, 3), locked, 'light').slots.find((s) => s.role === 'primary')!.hex)
      .toBe(walked)
    // …and it holds there as the rest of the palette keeps walking
    for (const seed of [4, 6, 12, 30]) {
      const v = readBoard(theme(locked, seed), locked, 'light')
      expect(v.slots.find((s) => s.role === 'primary')!.hex, `hop ${seed}`).toBe(walked)
      expect(v.slots.find((s) => s.role === 'accent')!.hex, `hop ${seed} accent`).not.toBe(
        seat3(c, 'accent').hex,
      )
    }
  })

  it('unlocking resumes the walk rather than rewinding it', () => {
    // `color` is never overwritten — the snapshot lives beside it in
    // `lockedColor` — so unlock needs no inverse: the walk simply runs again
    // and lands where it would have been. Overwriting `color` instead lost the
    // user's typed hex for good, which is why the field is separate.
    const c = candidatesFromList(['#c1663f'])
    const locked = lockRole(c, 'primary', board(c, 3))
    const back = unlockRole(locked, 'primary', readBoard(theme(locked, 3), locked, 'light'))

    expect(back[0].lockedColor).toBeUndefined()
    expect(back[0].color).toEqual(c[0].color)
    // hop 8 unlocked is hop 8 as if the lock had never happened
    const b = readBoard(theme(back, 8), back, 'light')
    expect(b.slots.map((s) => s.hex)).toEqual(board(c, 8).slots.map((s) => s.hex))
  })

  it('lockRole is a no-op on a derived seat — there is no candidate to lock', () => {
    const c = candidatesFromList(['#7832c3'])
    expect(seat(c, 'danger').candidateIndex).toBeNull()
    expect(lockRole(c, 'danger', board(c))).toBe(c)
    // keepRole is the verb that handles it, by materialising one first
    const kept = keepRole(c, 'danger', parseColor(seat(c, 'danger').hex)!, seat(c, 'danger').hex)
    expect(seat(kept, 'danger').locked).toBe(true)
  })

  it('lockSeries / unlockSeries do the same for a chart slot', () => {
    const c = candidatesFromList(FULL)
    const entry = board(c).series.find((s) => s.candidateIndex != null)!
    const locked = lockSeries(c, entry.slot, board(c))
    expect(locked[entry.candidateIndex!].locked).toBe(true)
    expect(board(locked).series.find((s) => s.slot === entry.slot)!.locked).toBe(true)
    const back = unlockSeries(locked, entry.slot, board(locked))
    expect(back[entry.candidateIndex!].locked).toBe(false)
  })

  it('a colour you placed is riffable until you lock it — a pin is not a lock', () => {
    // The whole point of the rewrite: dragging a colour into a seat says where
    // it sits, not that you never want to explore from it.
    const c = placeInRole(candidatesFromList(FULL), 1, 'primary', board(candidatesFromList(FULL)))
    expect(seat(c, 'primary').provenance).toBe('yours')
    expect(seat(c, 'primary').locked).toBe(false)
    expect(board(c, 3).slots.find((s) => s.role === 'primary')!.hex).not.toBe(
      seat(c, 'primary').hex,
    )
  })

  it('a locked seat is byte-identical at every hop, while its neighbours walk', () => {
    // Byte-identical, not merely close: the lock has to survive the pairwise
    // repair that runs after the walk, or a frozen colour drifts a little every
    // time a neighbour moves and the freeze is worth nothing.
    const base = candidatesFromList(['#e63946', '#457b9d', '#f1faee', '#a8dadc', '#1d3557'])
    const c = lockRole(base, 'primary', board(base))
    const hex = (seed: number, role: string) =>
      board(c, seed).slots.find((s) => s.role === role)!.hex
    for (const seed of [1, 2, 5, 12]) expect(hex(seed, 'primary')).toBe(hex(0, 'primary'))
    // …and the unlocked seats around it really did move, so that means something
    expect(hex(5, 'accent')).not.toBe(hex(0, 'accent'))
    expect(hex(5, 'danger')).not.toBe(hex(0, 'danger'))
  })

  it('hasRiffableSeats is true for a board with no locks at all', () => {
    // The headline defect of the old rule: eleven colours filled every seat, so
    // `hasDerivedSeats` said "nothing to riff" on the palette a user had just
    // pulled out of an image and most wanted to explore.
    const full = candidatesFromList([
      ...FULL, '#3b82f6', '#a855f7', '#14b8a6', '#ec4899', '#84cc16',
    ])
    const v = board(full)
    expect(v.slots.every((s) => s.provenance !== 'derived')).toBe(true)
    expect(v.series.every((s) => s.provenance !== 'derived')).toBe(true)
    expect(hasRiffableSeats(v)).toBe(true)
  })

  it('hasRiffableSeats is false only once every seat and slot is locked', () => {
    let c = candidatesFromList(['#7832c3'])
    // materialise + lock the five derived seats, then lock the one that is yours
    for (const role of ['accent', 'neutral', 'danger', 'success', 'warning'] as const) {
      const s = board(c).slots.find((x) => x.role === role)!
      c = s.candidateIndex == null ? keepRole(c, role, parseColor(s.hex)!, s.hex) : lockRole(c, role, board(c))
    }
    expect(hasRiffableSeats(board(c))).toBe(true)
    c = lockRole(c, 'primary', board(c))
    const v = board(c)
    expect(v.slots.every((s) => s.locked)).toBe(true)
    // nothing of yours is loose in the tray either: chart-1 is the accent's
    // claim (locked with it) and the rest are invented hue-spins off the
    // primary, which cannot move once the roles are still
    expect(v.series.every((s) => s.candidateIndex == null || s.locked)).toBe(true)
    expect(hasRiffableSeats(v)).toBe(false)
    // and with nothing movable, the walk genuinely stands still
    expect(board(c, 7).slots.map((s) => s.hex)).toEqual(v.slots.map((s) => s.hex))
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

describe('adjustRole — hand-picking a new colour for a seat', () => {
  it('edits the seated candidate in place and rebuilds around it', () => {
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const v = board(c)
    const before = v.slots.find((s) => s.role === 'accent')!
    const next = adjustRole(c, 'accent', parseColor('#00a651')!, '#00a651', v)
    // same candidate, new colour — nobody benched, nothing added
    expect(next).toHaveLength(c.length)
    expect(toHex(next[before.candidateIndex!].color)).toBe('#00a651')
    expect(next[before.candidateIndex!].raw).toBe('#00a651')
    // and the board reads the new colour through the engine
    const after = seat(next, 'accent')
    expect(after.candidateIndex).toBe(before.candidateIndex)
    expect(after.provenance).toBe('yours')
    // pinned to the seat it was adjusted in — otherwise the next solve is free
    // to re-cast the new colour into whichever seat it now suits best
    expect(next[before.candidateIndex!].pin).toBe('accent')
  })

  it('moves a locked seat\'s snapshot with it — the engine reads lockedColor verbatim', () => {
    const c = candidatesFromList(['#e63946', '#457b9d', '#f1faee'])
    const locked = lockRole(c, 'accent', board(c))
    const v = board(locked)
    const next = adjustRole(locked, 'accent', parseColor('#00a651')!, '#00a651', v)
    const after = seat(next, 'accent')
    expect(after.locked).toBe(true)
    // exact, end to end: a locked colour skips fidelity, repair and the walk
    expect(after.hex).toBe('#00a651')
  })

  it('adjusting a derived seat materialises a kept candidate at the picked colour', () => {
    const c = candidatesFromList(['#7832c3'])
    const v = board(c)
    expect(v.slots.find((s) => s.role === 'danger')!.provenance).toBe('derived')
    const next = adjustRole(c, 'danger', parseColor('#b3261e')!, '#b3261e', v)
    expect(next).toHaveLength(c.length + 1)
    const after = seat(next, 'danger')
    expect(after.provenance).toBe('kept')
    expect(after.locked).toBe(true)
    expect(after.hex).toBe('#b3261e')
  })

  it('flips source to manual — the picked colour is no longer the image\'s', () => {
    const c: ColorCandidate[] = [
      { color: parseColor('#e63946')!, source: 'image', raw: '#e63946' },
    ]
    const v = board(c)
    const role = v.slots.find((s) => s.candidateIndex === 0)!.role
    const next = adjustRole(c, role, parseColor('#00a651')!, '#00a651', v)
    expect(next[0].source).toBe('manual')
  })
})

describe('the two edits — your colour derives, the shipped colour locks as typed', () => {
  const coastal = () => candidatesFromList(PRESETS[0].colors)

  it('editing YOUR seat\'s output locks it as typed — taste, riff and repair can no longer pull it', () => {
    // The bug: a seat holding your colour got the pin and nothing else, while
    // a derived seat got kept (locked). Same gesture, two promises.
    const c = coastal()
    const v = board(c)
    const accent = v.slots.find((s) => s.role === 'accent')!
    expect(accent.provenance).toBe('yours')
    const next = adjustRole(c, 'accent', parseColor('#3f8f6a')!, '#3f8f6a', v)
    const cand = next[accent.candidateIndex!]
    expect(cand.locked).toBe(true)
    expect(toHex(cand.lockedColor!)).toBe('#3f8f6a')
    // the input takes the same value, so the row reads "="
    expect(toHex(cand.color)).toBe('#3f8f6a')
    for (const fidelity of [0, 0.5]) {
      for (const seed of [0, 4]) {
        const r = generateTheme({ candidates: next, fidelity, seed })
        const after = readBoard(r, next, 'light').slots.find((s) => s.role === 'accent')!
        expect(after.hex, `taste ${fidelity}, hop ${seed}`).toBe('#3f8f6a')
        expect(seatDelta(after.inputHex!, after.hex).same).toBe(true)
      }
    }
  })

  it('editing a DERIVED seat\'s output does the same: kept, locked, exact', () => {
    const c = candidatesFromList(['#7832c3'])
    const v = board(c)
    const next = adjustRole(c, 'warning', parseColor('#c98a12')!, '#c98a12', v)
    const after = seat(next, 'warning')
    expect(after.locked).toBe(true)
    expect(after.hex).toBe('#c98a12')
    expect(after.inputHex).toBe('#c98a12')
  })

  it('editing your INPUT re-derives — and releases a lock, or the edit would change nothing that ships', () => {
    const c = coastal()
    const locked = lockRole(c, 'primary', board(c, 3))
    const v = board(locked)
    const i = v.slots.find((s) => s.role === 'primary')!.candidateIndex!
    // a colour far outside primary's window, so taste has something to do
    const next = setRoleInput(locked, 'primary', parseColor('#f4c2c2')!, '#f4c2c2', v)
    expect(next[i].locked).toBe(false)
    expect(next[i].lockedColor).toBeUndefined()
    expect(next[i].pin).toBe('primary')
    const after = seat(next, 'primary')
    expect(after.inputHex).toBe('#f4c2c2')
    expect(after.candidateIndex).toBe(i)
    // at taste 0.5 the engine moves it, and the middle cell says so
    expect(seatDelta(after.inputHex!, after.hex).same).toBe(false)
  })

  it('"+ add" on a derived seat creates a colour of yours there, unlocked', () => {
    const c = candidatesFromList(['#7832c3'])
    const v = board(c)
    expect(v.slots.find((s) => s.role === 'success')!.inputHex).toBeNull()
    const next = setRoleInput(c, 'success', parseColor('#2f9e5b')!, '#2f9e5b', v)
    expect(next).toHaveLength(2)
    const after = seat(next, 'success')
    expect(after.provenance).toBe('yours')
    expect(after.locked).toBe(false)
    expect(after.inputHex).toBe('#2f9e5b')
  })

  it('a kept seat whose input you then edit becomes yours', () => {
    const c = candidatesFromList(['#7832c3'])
    const kept = adjustRole(c, 'danger', parseColor('#b3261e')!, '#b3261e', board(c))
    const next = setRoleInput(kept, 'danger', parseColor('#c0392b')!, '#c0392b', board(kept))
    expect(seat(next, 'danger').provenance).toBe('yours')
  })

  it('the ops run the same verbs: adjust locks as typed, input derives', () => {
    const s = { ...emptyThemeState(), candidates: coastal() }
    const ctx = { mode: 'light' as const }
    const a = applyOp(s, { op: 'adjust', role: 'accent', color: '#3f8f6a' }, ctx)
    const idx = board(s.candidates).slots.find((x) => x.role === 'accent')!.candidateIndex!
    expect(a.candidates[idx].locked).toBe(true)
    const b = applyOp(a, { op: 'input', role: 'accent', color: '#3f8f6a' }, ctx)
    expect(b.candidates[idx].locked).toBe(false)
  })

  it('chart rows: input derives, output locks as typed, a role-led slot is left alone', () => {
    const c = candidatesFromList(PRESETS[0].colors)
    const v = board(c)
    const own = v.series.find((e) => e.candidateIndex != null && e.leadsFrom == null)!
    const out = setSeriesColor(c, own.slot, 'output', parseColor('#2a9d8f')!, '#2a9d8f', v)
    expect(out[own.candidateIndex!].locked).toBe(true)
    expect(out[own.candidateIndex!].pin).toBe('chart')
    const back = setSeriesColor(out, own.slot, 'input', parseColor('#2a9d8f')!, '#2a9d8f', board(out))
    expect(back[own.candidateIndex!].locked).toBe(false)
    const led = v.series.find((e) => e.leadsFrom != null)
    if (led) expect(setSeriesColor(c, led.slot, 'output', parseColor('#000000')!, '#000', v)).toBe(c)
    const derived = v.series.find((e) => e.candidateIndex == null && e.leadsFrom == null)
    if (derived) {
      const added = setSeriesColor(c, derived.slot, 'input', parseColor('#e9c46a')!, '#e9c46a', v)
      expect(added).toHaveLength(c.length + 1)
      expect(added.at(-1)!.pin).toBe('chart')
    }
  })
})

describe('seatDelta — the middle cell, in words', () => {
  it('reads "same" for one colour, or anything under ΔE .004', () => {
    expect(seatDelta('#457b9d', '#457b9d')).toMatchObject({ same: true, text: 'same' })
    expect(seatDelta('#457b9d', '#457b9e').same).toBe(true)
  })

  it('names the dominant direction beside the ΔE', () => {
    const lighter = seatDelta('#7a2b2b', '#b04040')
    expect(lighter.same).toBe(false)
    expect(lighter.words).toBe('lighter')
    expect(lighter.text).toMatch(/^ΔE \.\d{3} · lighter$/)
    expect(seatDelta('#b04040', '#7a2b2b').words).toBe('darker')
  })

  it('says "more vivid" / "softer" when chroma is what moved', () => {
    const grey = 'oklch(0.6 0.04 250)'
    const vivid = 'oklch(0.6 0.15 250)'
    expect(seatDelta(toHex(parseColor(grey)!), toHex(parseColor(vivid)!)).words).toBe('more vivid')
    expect(seatDelta(toHex(parseColor(vivid)!), toHex(parseColor(grey)!)).words).toBe('softer')
  })

  it('says the hue turn in degrees, signed, with a real minus', () => {
    const a = toHex(parseColor('oklch(0.62 0.15 30)')!)
    const b = toHex(parseColor('oklch(0.62 0.15 49)')!)
    expect(seatDelta(a, b).words).toMatch(/^hue \+1[89]°$/)
    expect(seatDelta(b, a).words).toMatch(/^hue −1[89]°$/)
  })

  it('never names a hue on a near-grey, where there is none to see', () => {
    const a = toHex(parseColor('oklch(0.6 0.01 30)')!)
    const b = toHex(parseColor('oklch(0.6 0.01 200)')!)
    expect(seatDelta(a, b).words).not.toMatch(/hue/)
  })

  it('formats ΔE without the leading zero', () => {
    expect(seatDelta('#000000', '#ffffff').text).toBe('ΔE 1.000 · lighter')
    expect(seatDelta('#e63946', '#f34a36').text).toMatch(/^ΔE \.0\d\d · /)
  })
})

describe('lockedFailure — a lock that fails a check, and "derive safely"', () => {
  // A near-white primary locked as typed: at taste 0.5 the engine can only
  // spend so much lightness on standing it off the page, and the lock keeps
  // taste from pulling it into primary's window — so the pop pair fails.
  const failing = () => {
    const c = candidatesFromList(PRESETS[0].colors)
    return adjustRole(c, 'primary', parseColor('#f8f8f8')!, '#f8f8f8', board(c))
  }

  it('reads the failing report row descending from the seat, with ratio and reason', () => {
    const c = failing()
    const r = theme(c)
    const f = lockedFailure(r, 'primary', 'dark')!
    expect(f).not.toBeNull()
    const row = r.light.report.find((x) => x.token === 'primary' && x.background === 'background')!
    expect(row.pass).toBe(false)
    expect(f.short).toBe(`${(Math.floor(row.wcag * 10) / 10).toFixed(1)}:1`)
    // it fails in light; the frame is dark, so the reason names the mode
    expect(f.reason).toBe(`${f.short} on the light page; a primary fill needs 3:1`)
  })

  it('stays quiet on a seat that passes', () => {
    const c = candidatesFromList(PRESETS[0].colors)
    const r = theme(c)
    for (const role of ROLES) expect(lockedFailure(r, role, 'light'), role).toBeNull()
  })

  it('names a pair the repair pass could not hold apart', () => {
    const c = candidatesFromList(PRESETS[0].colors)
    // danger locked on primary's own red: the engine can't separate them
    const next = adjustRole(c, 'danger', parseColor('#e63946')!, '#e63946', board(c))
    const f = lockedFailure(theme(next), 'danger', 'light')!
    expect(f.short).toBe('≈ primary')
    expect(f.reason).toMatch(/^danger must not read as primary: ΔE \.\d{3} apart, needs \.100$/)
  })

  it('"derive safely" is the unlock: the engine re-derives from your colour and the check passes', () => {
    const c = failing()
    const i = board(c).slots.find((s) => s.role === 'primary')!.candidateIndex!
    const s = { ...emptyThemeState(), candidates: c }
    const safe = applyOp(s, { op: 'unlock', role: 'primary' }, { mode: 'light' })
    expect(safe.candidates[i].locked).toBe(false)
    // your colour is still the input…
    expect(toHex(safe.candidates[i].color)).toBe('#f8f8f8')
    const r = theme(safe.candidates)
    // …the engine moved the output, and every primary row passes
    const after = readBoard(r, safe.candidates, 'light').slots.find((x) => x.role === 'primary')!
    expect(seatDelta(after.inputHex!, after.hex).same).toBe(false)
    expect(r.light.report.filter((x) => x.token === 'primary').every((x) => x.pass)).toBe(true)
    expect(lockedFailure(r, 'primary', 'light')).toBeNull()
  })
})

describe('placement probes are riff-independent', () => {
  // App probes at seed 0 (probeCasting) because casting runs before the walk.
  // If that ever stops being true, the popover would describe a different
  // board than the one on screen — this pins it.
  it('describePlacement and wouldTakeOver read the same at seed 0 and seed N', () => {
    for (const p of PRESETS) {
      const candidates = candidatesFromList(p.colors)
      for (const seed of [3, 20]) {
        for (const fidelity of [0, 0.5, 1]) {
          const at = (s: number) => (next: ColorCandidate[]) => generateTheme({ candidates: next, fidelity, seed: s })
          const view = readBoard(at(seed)(candidates), candidates, 'light')
          for (const role of ROLES) {
            expect(wouldTakeOver(candidates, role, view, at(0))).toEqual(wouldTakeOver(candidates, role, view, at(seed)))
            candidates.forEach((_, i) =>
              expect(describePlacement(candidates, i, role, view, at(0))).toBe(
                describePlacement(candidates, i, role, view, at(seed)),
              ),
            )
          }
        }
      }
    }
  })
})
