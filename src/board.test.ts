import { describe, expect, it } from 'vitest'
import { candidatesFromList, generateTheme, parseColor, toHex } from './engine'
import type { ColorCandidate } from './engine'
import {
  adjustRole,
  benchCandidate,
  deriveRole,
  hasRiffableSeats,
  keepRole,
  lockRole,
  lockSeries,
  placeInRole,
  readBoard,
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
  it('edits the seated candidate in place and re-forges around it', () => {
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
