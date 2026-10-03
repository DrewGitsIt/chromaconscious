/**
 * The role board's view model and its verbs.
 *
 * The board shows roles as labeled seats you fill, rather than a list of colors
 * you assign roles to. Nothing about the engine's input shape changes: a color
 * sitting in a seat is just a candidate with `pin: role`, and the bench is
 * `benched: true`. This module is the whole translation, so components never
 * reason about candidate indexes directly.
 *
 * Three provenances, because "where did this colour come from?" is worth
 * showing on its own:
 *   yours   — you supplied it and placed it
 *   kept    — the engine derived it, you claimed it as yours
 *   derived — the engine computed it
 *
 * Provenance no longer answers "will riff change this?". The LOCK answers it,
 * and it is the only thing that does (see `locked` in engine/types.ts): a
 * colour of yours that you did not lock walks like any other. A derived seat
 * has no candidate to carry a lock, so it is always riffable — locking one
 * means keeping it first, which materialises a candidate to hang the lock on.
 */
import type { ColorCandidate, Oklch, Role, ThemeResult } from './engine'
import { ROLES, apcaLc, parseColor, toHex, tokenAncestry } from './engine'

export type Provenance = 'yours' | 'kept' | 'derived'

/**
 * The drag channel every board surface writes and reads — seats, bench chips
 * and series swatches all speak this one shape over `application/json`.
 * It lives here rather than in a component so the three cannot drift apart.
 */
export type DragPayload =
  | { kind: 'bench'; candidateIndex: number }
  | { kind: 'slot'; role: Role }
  | { kind: 'series'; slot: number }

/** The dataTransfer key. */
export const DRAG_MIME = 'application/json'

/** Chart is a pooled seat set, not a single seat — hence a tray, not a slot. */
export const SERIES_SEATS = 5

export interface BoardSlot {
  role: Role
  /** The colour actually in the theme — the seed, not what you typed. */
  hex: string
  /**
   * The colour you typed, when the seed moved off it (fidelity, repair, or a
   * riff hop). Null when they agree, so a component can render it as "from …"
   * without having to compare.
   */
  sourceHex: string | null
  /**
   * Your colour for this seat — the left column of its row — always, even when
   * it agrees with `hex`. Null on a derived seat, whose left cell is the add
   * verb. (`sourceHex` answers a different question: "did they part?")
   */
  inputHex: string | null
  provenance: Provenance
  /** You locked this colour: riff may not move it. Derived seats: false. */
  locked: boolean
  /** Index into candidates, or null when the engine derived this seat. */
  candidateIndex: number | null
}

export interface SeriesEntry {
  /** 1-based chart slot, matching the `chart-N` tokens. */
  slot: number
  hex: string
  /** Your colour behind this slot (its row's left column); null when derived. */
  inputHex: string | null
  /**
   * The role whose ramp leads this slot, when it isn't a chart colour of its
   * own — chart-1 is the accent's to claim (see tokens.ts). Such a slot is
   * edited through that role's seat, never as a series colour: editing it
   * here would pull the accent out of its seat.
   */
  leadsFrom: Role | null
  provenance: Provenance
  /** You locked this colour: riff may not move it. Derived fills: false. */
  locked: boolean
  candidateIndex: number | null
}

export interface BenchEntry {
  candidateIndex: number
  hex: string
  /** True when the user parked it; false when it simply didn't win a seat. */
  parked: boolean
}

export interface BoardView {
  slots: BoardSlot[]
  series: SeriesEntry[]
  bench: BenchEntry[]
}

const provenanceOf = (c: ColorCandidate | undefined): Provenance =>
  c == null ? 'derived' : c.origin === 'invented' ? 'kept' : 'yours'

/** Read the engine's result as a board. Pure — no candidate indexes escape. */
export function readBoard(
  result: ThemeResult,
  candidates: ColorCandidate[],
  mode: 'light' | 'dark',
): BoardView {
  const byRole = new Map(result.assignments.map((a) => [a.role, a]))

  // The seat shows the SEED — the colour that is really in the theme — not the
  // string you typed. The two were already allowed to differ (below fidelity 1
  // a user colour is normalized toward its role), and under the walk they
  // differ after every hop: a chip pinned to the input would simply stop
  // tracking the preview it sits next to. The input survives as `sourceHex`.
  const slots: BoardSlot[] = ROLES.map((role) => {
    const a = byRole.get(role)
    const ci = a?.candidateIndex ?? null
    const c = ci != null ? candidates[ci] : undefined
    const hex = a ? toHex(a.seed) : '#000000'
    const source = c ? toHex(c.color) : null
    return {
      role,
      hex,
      sourceHex: source != null && source !== hex ? source : null,
      inputHex: source,
      provenance: provenanceOf(c),
      locked: c?.locked === true,
      candidateIndex: ci,
    }
  })

  // The tray reads the chart tokens' ancestry rather than chartCandidateIndexes,
  // so an invented fill shows up as `derived` in the seat it actually occupies.
  const ancestry = tokenAncestry(result, mode)
  const series: SeriesEntry[] = Array.from({ length: SERIES_SEATS }, (_, k) => {
    const ci = ancestry[`chart-${k + 1}`] ?? null
    const c = ci != null ? candidates[ci] : undefined
    const anc = result[mode].ancestry[`chart-${k + 1}`]
    return {
      slot: k + 1,
      hex: result[mode].tokens[`chart-${k + 1}`],
      inputHex: c ? toHex(c.color) : null,
      leadsFrom: anc?.kind === 'role' ? anc.role : null,
      provenance: provenanceOf(c),
      locked: c?.locked === true,
      candidateIndex: ci,
    }
  })

  const bench: BenchEntry[] = result.unusedCandidateIndexes.map((i) => ({
    candidateIndex: i,
    hex: toHex(candidates[i].color),
    parked: candidates[i].benched === true,
  }))

  return { slots, series, bench }
}

// ---------------------------------------------------------------------------
// Verbs. Every one takes and returns ColorCandidate[], so App state stays
// exactly what the engine already consumes.

const patch = (
  candidates: ColorCandidate[],
  i: number,
  next: Partial<ColorCandidate>,
): ColorCandidate[] => candidates.map((c, j) => (j === i ? { ...c, ...next } : c))

/**
 * Put a color in a seat. Whoever held that seat is parked on the bench —
 * a seat holds one color, and the displaced one shouldn't silently vanish.
 */
export function placeInRole(
  candidates: ColorCandidate[],
  candidateIndex: number,
  role: Role,
  view: BoardView,
): ColorCandidate[] {
  const holder = view.slots.find((s) => s.role === role)?.candidateIndex ?? null
  let next = candidates
  if (holder != null && holder !== candidateIndex) {
    next = patch(next, holder, { pin: undefined, benched: true })
  }
  return patch(next, candidateIndex, { pin: role, benched: false })
}

/** Add a color to the chart series tray. */
export function placeInSeries(
  candidates: ColorCandidate[],
  candidateIndex: number,
): ColorCandidate[] {
  return patch(candidates, candidateIndex, { pin: 'chart', benched: false })
}

/**
 * Free a seat: the color holding it goes to the bench. Unpinning alone would
 * let it win the same seat straight back, which is why `benched` exists.
 *
 * NOTE the contract is "this color leaves", not "the seat becomes derived".
 * With colors to spare the engine simply casts the next best one into it, so
 * UI must not promise "let the engine derive it" — name the color that would
 * take over instead (see `wouldTakeOver`).
 */
export function deriveRole(
  candidates: ColorCandidate[],
  role: Role,
  view: BoardView,
): ColorCandidate[] {
  const holder = view.slots.find((s) => s.role === role)?.candidateIndex ?? null
  if (holder == null) return candidates
  return patch(candidates, holder, { pin: undefined, benched: true })
}

/**
 * Freeze a derived seat as your own ("keep as your color"). The color does not
 * change — only who owns it, and the lock that comes with the claim.
 *
 * The lock is the point: "keep this one" has always meant "riff stops changing
 * it", and that is now spelled with `locked` rather than implied by provenance.
 * A derived seat has no candidate to hang a lock on, so materialising one is
 * the only way to lock it at all — which is why `lockRole` defers here.
 */
export function keepRole(
  candidates: ColorCandidate[],
  role: Role,
  color: Oklch,
  raw: string,
): ColorCandidate[] {
  return [
    ...candidates,
    { color, source: 'manual', raw, pin: role, origin: 'invented', locked: true },
  ]
}

/**
 * Set the colour a seat SHIPS — the right-hand column of its row. It is locked
 * as typed: the input takes the same value, so the row reads "=" and taste,
 * riff and repair all leave it exactly where you put it.
 *
 * This is the lock, not a new state. A lock already exempts a colour from all
 * three stages that would move it (fidelity, the walk, repair), so "edit the
 * output" is spelled `adjust` + `lock` and the lock stays the only freeze.
 *
 * It used to lock only some of the time. Editing a derived seat kept it (which
 * locks), but editing a seat holding YOUR colour only set the pin, so the
 * colour you had just typed was handed back to taste, riff and repair to pull
 * away — the same gesture, two different promises depending on provenance.
 *
 *   yours/kept — the candidate is rewritten in place, colour and lock snapshot
 *     together (the engine takes `lockedColor` verbatim).
 *   derived    — no candidate to edit, so one is materialised at the typed
 *     colour, exactly as keeping the seat would (pinned and locked).
 *
 * `source` flips to manual: whatever extracted the old colour, this one was
 * picked by hand. The candidate is PINNED to its seat, or the next solve could
 * re-cast it wherever it now fits best — adjust accent toward green and the
 * green lands in success — and "set this seat" would reshuffle the board.
 */
export function adjustRole(
  candidates: ColorCandidate[],
  role: Role,
  color: Oklch,
  raw: string,
  view: BoardView,
): ColorCandidate[] {
  const slot = view.slots.find((s) => s.role === role)
  if (!slot) return candidates
  if (slot.candidateIndex == null) return keepRole(candidates, role, color, raw)
  return patch(candidates, slot.candidateIndex, {
    color,
    raw,
    source: 'manual',
    pin: role,
    locked: true,
    lockedColor: color,
  })
}

/**
 * Set YOUR colour for a seat — the left-hand column of its row — and let the
 * engine derive from it at the current taste. The opposite promise to
 * `adjustRole`: whatever lock the seat held is released, because a lock would
 * pin the output to its old snapshot and the edit would change nothing you
 * can see ship. On a derived seat (the "+ add" cell) a colour of yours is
 * created and pinned there; it is yours, unlocked, and walks like any input.
 */
export function setRoleInput(
  candidates: ColorCandidate[],
  role: Role,
  color: Oklch,
  raw: string,
  view: BoardView,
): ColorCandidate[] {
  const slot = view.slots.find((s) => s.role === role)
  if (!slot) return candidates
  if (slot.candidateIndex == null) {
    return [...candidates, { color, raw, source: 'manual', pin: role }]
  }
  return patch(candidates, slot.candidateIndex, {
    color,
    raw,
    source: 'manual',
    pin: role,
    origin: undefined,
    locked: false,
    lockedColor: undefined,
  })
}

/**
 * The chart rows' two edits, mirroring the seats': `side: 'input'` sets your
 * colour behind a slot and lets the engine derive (unlocked); `side: 'output'`
 * sets the colour that ships and locks it as typed. A derived slot gets a new
 * chart colour pinned to the series. A slot led by a role (chart-1 wearing
 * the accent) is not a series colour at all and is left alone — it changes
 * through that role's seat.
 *
 * Pinned to the chart so the edit can't re-cast it into a role seat. Pins
 * order the series (pinned first), so an edited slot may move up the list.
 */
export function setSeriesColor(
  candidates: ColorCandidate[],
  slot: number,
  side: 'input' | 'output',
  color: Oklch,
  raw: string,
  view: BoardView,
): ColorCandidate[] {
  const entry = view.series.find((s) => s.slot === slot)
  if (!entry || entry.leadsFrom != null) return candidates
  const lock = side === 'output' ? { locked: true, lockedColor: color } : { locked: false, lockedColor: undefined }
  if (entry.candidateIndex == null) {
    return [
      ...candidates,
      {
        color,
        raw,
        source: 'manual',
        pin: 'chart',
        ...(side === 'output' ? { origin: 'invented' as const, locked: true } : {}),
      },
    ]
  }
  return patch(candidates, entry.candidateIndex, {
    color,
    raw,
    source: 'manual',
    pin: 'chart',
    ...(side === 'input' ? { origin: undefined } : {}),
    ...lock,
  })
}

/**
 * Lock the colour in a seat: riff may not move it. The only thing that freezes
 * a colour — not provenance, not fidelity.
 *
 * It locks the colour you are LOOKING AT, not the one you originally typed.
 * Setting the flag alone was the obvious implementation and it was wrong: a
 * seat three hops along shows the walked colour, so flagging the untouched
 * candidate rewound the swatch to the input under the very click meant to
 * freeze it — and riff→lock→riff, the loop this whole feature exists to serve,
 * could not keep anything the riff had found. Snapshotting is also what makes
 * the lock exact end to end, since the engine takes a locked candidate's
 * colour verbatim (no fidelity adjustment, no walk, no repair).
 *
 * The snapshot lands in `lockedColor`, beside the colour you gave rather than
 * over it, so unlocking needs no inverse: `color` never moved, the walk picks
 * up again and arrives back at the seed it was frozen at. It also leaves the
 * pin alone — locking says nothing about placement, and pinning is not free
 * (on the chart tray it reorders the series).
 *
 * A derived seat has no candidate to carry the lock, so this is a no-op there
 * rather than a silent half-success; `keepRole` is the verb that handles it.
 */
export function lockRole(
  candidates: ColorCandidate[],
  role: Role,
  view: BoardView,
): ColorCandidate[] {
  const slot = view.slots.find((s) => s.role === role)
  if (!slot || slot.candidateIndex == null) return candidates
  const standing = parseColor(slot.hex)
  if (!standing) return candidates
  return patch(candidates, slot.candidateIndex, { locked: true, lockedColor: standing })
}

/**
 * Unlock a seat: the colour becomes riffable again and does not otherwise move.
 *
 * Deliberately NOT a bench or an unpin. `pin` says which seat a colour sits in,
 * `locked` says whether riff may move it; collapsing the two is exactly the
 * conflation this feature exists to undo.
 */
export function unlockRole(
  candidates: ColorCandidate[],
  role: Role,
  view: BoardView,
): ColorCandidate[] {
  const holder = view.slots.find((s) => s.role === role)?.candidateIndex ?? null
  if (holder == null) return candidates
  return patch(candidates, holder, { locked: false, lockedColor: undefined })
}

/**
 * Lock a chart slot's colour, as it currently stands — see lockRole for why the
 * snapshot matters. No-op on a fill the engine invented.
 */
export function lockSeries(
  candidates: ColorCandidate[],
  slot: number,
  view: BoardView,
): ColorCandidate[] {
  const entry = view.series.find((s) => s.slot === slot)
  if (!entry || entry.candidateIndex == null) return candidates
  const standing = parseColor(entry.hex)
  if (!standing) return candidates
  return patch(candidates, entry.candidateIndex, { locked: true, lockedColor: standing })
}

/** Unlock a chart slot's colour; it stays in the tray and becomes riffable. */
export function unlockSeries(
  candidates: ColorCandidate[],
  slot: number,
  view: BoardView,
): ColorCandidate[] {
  const holder = view.series.find((s) => s.slot === slot)?.candidateIndex ?? null
  if (holder == null) return candidates
  return patch(candidates, holder, { locked: false, lockedColor: undefined })
}

/** Park a color on the bench. */
export function benchCandidate(candidates: ColorCandidate[], i: number): ColorCandidate[] {
  return patch(candidates, i, { pin: undefined, benched: true })
}

/** Return a benched color to the pool and let the engine re-cast it. */
export function unbenchCandidate(candidates: ColorCandidate[], i: number): ColorCandidate[] {
  return patch(candidates, i, { benched: false })
}

/** Drop a color entirely. */
export function dropCandidate(candidates: ColorCandidate[], i: number): ColorCandidate[] {
  return candidates.filter((_, j) => j !== i)
}

/**
 * Keep an index that names a candidate (the mono base, or the parked base)
 * pointing at the SAME color after `removed` is dropped.
 *
 * This has to travel with `dropCandidate`: the mono lock is stored as an index,
 * so splicing the array without remapping silently re-points the lock at a
 * different color and the whole theme rebuilds around a hue nobody chose.
 * Returns null when the removed candidate WAS the one being named.
 */
export function remapAfterRemove(idx: number | null, removed: number): number | null {
  if (idx == null || idx === removed) return null
  return idx > removed ? idx - 1 : idx
}

/** Clear every explicit placement — back to the engine's own casting. */
export function resetPlacements(candidates: ColorCandidate[]): ColorCandidate[] {
  return candidates.map((c) => ({ ...c, pin: undefined, benched: false }))
}

/**
 * Name a candidate by its OWN colour rather than by the seat it sits in.
 *
 * A seat shows the seed the engine resolved — fidelity-adjusted, repaired, and
 * now walked — so `slot.hex` is a colour the user never typed. The assign
 * popover is a list of *your colours*, and a colour must not have two names
 * inside one popover.
 */
export const nameOf = (candidates: ColorCandidate[], i: number | null): string | null =>
  i == null ? null : candidates[i] ? toHex(candidates[i].color) : null

/**
 * What placing `candidateIndex` into `role` would ACTUALLY do, described by
 * running the placement and reading the board back.
 *
 * This is a probe, not a prediction, and that distinction is the whole point:
 * `pinConsequence` reasons from the current casting, so it can name the very
 * colour this action is about to bench as the successor to the seat being
 * freed. Asking the engine cannot produce that contradiction.
 */
export function describePlacement(
  candidates: ColorCandidate[],
  candidateIndex: number,
  role: Role,
  view: BoardView,
  regenerate: (next: ColorCandidate[]) => ThemeResult,
): string {
  const next = placeInRole(candidates, candidateIndex, role, view)
  const after = readBoard(regenerate(next), next, 'light')
  const parts: string[] = []

  const target = view.slots.find((s) => s.role === role)
  if (target && target.candidateIndex != null && target.candidateIndex !== candidateIndex) {
    parts.push(`benches ${nameOf(candidates, target.candidateIndex)}`)
  } else if (target && target.provenance === 'derived') {
    parts.push('takes a seat the engine was inventing')
  }

  // What becomes of the seat this colour is leaving. `next` is a patch of
  // `candidates`, never a splice, so indexes still name the same colours.
  const from = view.slots.find((s) => s.candidateIndex === candidateIndex)
  if (from && from.role !== role) {
    const now = after.slots.find((s) => s.role === from.role)
    if (now?.provenance === 'derived') parts.push(`${from.role} goes to the engine`)
    else if (now) parts.push(`frees ${from.role} for ${nameOf(next, now.candidateIndex)}`)
  }

  return parts.join(' · ') || `seats it as ${role}`
}

/**
 * Who would take a seat if its current holder left — so the assign popover can
 * say "#457b9d takes over" rather than mis-promising a derived result.
 * Returns null when the engine would have to invent one.
 */
export function wouldTakeOver(
  candidates: ColorCandidate[],
  role: Role,
  view: BoardView,
  regenerate: (next: ColorCandidate[]) => ThemeResult,
): { hex: string; candidateIndex: number } | null {
  const next = deriveRole(candidates, role, view)
  if (next === candidates) return null
  const after = readBoard(regenerate(next), next, 'light').slots.find((s) => s.role === role)
  if (!after || after.candidateIndex == null) return null
  // Named as the candidate, like every option in the same popover — see nameOf.
  return { hex: nameOf(next, after.candidateIndex)!, candidateIndex: after.candidateIndex }
}

// ---------------------------------------------------------------------------
// Chrome that paints itself onto a user color needs ink that survives it. We
// ask the engine's own APCA solver rather than a luminance guess, so the
// sidebar is a live test of the thing being sold.

const INK_DARK = 'rgba(0,0,0,0.82)'
const INK_LIGHT = 'rgba(255,255,255,0.95)'

/** Readable ink for text drawn directly on `hex`. */
export function readableInk(hex: string): string {
  return Math.abs(apcaLc(INK_DARK_HEX, hex)) >= Math.abs(apcaLc(INK_LIGHT_HEX, hex))
    ? INK_DARK
    : INK_LIGHT
}
// apcaLc needs opaque hex, so solve with the solid equivalents of the inks above
const INK_DARK_HEX = '#000000'
const INK_LIGHT_HEX = '#ffffff'

/** A low-alpha "well" for hover affordances drawn on `hex`, in its own ink. */
export function wellOn(hex: string, strong = false): string {
  const dark = readableInk(hex) === INK_DARK
  const a = strong ? 0.22 : 0.12
  return dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a + 0.02})`
}

/**
 * True when riff has anything left to move.
 *
 * Riff is no longer limited to the seats the engine derived — it walks the
 * whole palette — so the question is simply "is anything unlocked". A board you
 * filled entirely yourself is fully riffable until you start locking it, which
 * is what the old `hasDerivedSeats` got exactly backwards: drop an image, fill
 * every seat, and the button went dead on the palette you most wanted to explore.
 *
 * A chart slot only counts when a colour of yours is in it. The fills the
 * engine invents for the empty slots are hue-spins off the primary seed (see
 * tokens.ts) rather than subjects of the walk in their own right, so with every
 * role locked they stand still too — counting them would leave the button live
 * and doing nothing.
 */
export const hasRiffableSeats = (view: BoardView): boolean =>
  view.slots.some((s) => !s.locked) ||
  view.series.some((s) => s.candidateIndex != null && !s.locked)

// ---------------------------------------------------------------------------
// The middle cell of a row: what the engine did between your colour and the
// one that ships, in words. You never have to see hue to read it.

/** Below this ΔE-OK the row reads "=": the engine left your colour alone. */
export const SAME_DELTA_E = 0.004

export interface SeatDelta {
  /** ΔE-OK between your colour and the one that ships. */
  e: number
  /** True below SAME_DELTA_E: the cell shows "=" and "same". */
  same: boolean
  /** The dominant direction — "lighter", "more vivid", "hue +19°" — or "nudged". */
  words: string
  /** "same", or "ΔE .046 · lighter": the whole cell as one line, for titles and tests. */
  text: string
}

const lab = ({ l, c, h }: Oklch): [number, number, number] => {
  const r = (h * Math.PI) / 180
  return [l, c * Math.cos(r), c * Math.sin(r)]
}

/** ".046" — the cell is narrow, and every ΔE here is under 1. */
export const formatDeltaE = (e: number): string => e.toFixed(3).replace(/^0/, '')

/**
 * Describe the move from `fromHex` (yours) to `toHex` (what ships). Measured
 * hex to hex, so sub-8-bit drift can't put an arrow on a row whose two chips
 * are the same colour.
 *
 * One direction only, the biggest, normalised so the axes compete fairly:
 * 0.015 of lightness, 0.015 of chroma or 5° of hue each count as one unit, and
 * a direction under one unit isn't named. Hue is only named when both colours
 * have enough chroma for a hue to be seen at all.
 */
export function seatDelta(fromHex: string, toHex: string): SeatDelta {
  const a = parseColor(fromHex)
  const b = parseColor(toHex)
  if (!a || !b) return { e: 0, same: true, words: '', text: 'same' }
  const [L1, a1, b1] = lab(a)
  const [L2, a2, b2] = lab(b)
  const e = Math.hypot(L2 - L1, a2 - a1, b2 - b1)
  if (e < SAME_DELTA_E) return { e, same: true, words: '', text: 'same' }
  const dh = ((b.h - a.h + 540) % 360) - 180
  const axes: Array<[weight: number, word: string]> = [
    [Math.abs(b.l - a.l) / 0.015, b.l > a.l ? 'lighter' : 'darker'],
    [Math.abs(b.c - a.c) / 0.015, b.c > a.c ? 'more vivid' : 'softer'],
    [a.c > 0.03 && b.c > 0.03 ? Math.abs(dh) / 5 : 0, `hue ${dh > 0 ? '+' : '−'}${Math.round(Math.abs(dh))}°`],
  ]
  const top = axes.filter(([w]) => w >= 1).sort((x, y) => y[0] - x[0])[0]
  const words = top ? top[1] : 'nudged'
  return { e, same: false, words, text: `ΔE ${formatDeltaE(e)} · ${words}` }
}

// ---------------------------------------------------------------------------
// A locked colour that fails a check. Keeping it is the default — a palette
// that fails may still ship — so this only describes the failure; the one fix
// offered is to unlock and let the engine derive.
//
// Two of the engine's own checks, nothing new:
//   1. the per-pair contrast report (`buildReport`), every failing row whose
//      foreground descends from this seat, current mode first;
//   2. the repair pass's residuals — pairs the engine could not hold apart
//      ("danger must not read as primary"), which a lock is often the cause of.
// There is no colour-vision-deficiency check here: cvd.ts is view-only by
// design (docs/colorblind-spec.md, "Not planned") and the engine runs none.

export interface SeatFailure {
  /** The middle cell's text: "1.9:1", "Lc 52" or "≈ primary". */
  short: string
  /** The line under the row, in words. */
  reason: string
}

/** Ratios read DOWN, so "3.0:1" never appears beside a 3:1 that it fails. */
const ratio = (v: number): string => `${(Math.floor(v * 10 + 1e-9) / 10).toFixed(1)}:1`
const needed = (v: number): string => `${+v.toFixed(2)}:1`

/** What a failing token is, from the seat's point of view. */
function whatFails(token: string, background: string, role: Role): string {
  if (token === 'primary') return 'a primary fill'
  if (token === 'ring' || token === 'sidebar-ring') return 'the focus ring'
  if (token === 'accent-strong') return 'an accent mark'
  if (token.endsWith('-strong')) return `a ${role} mark`
  if (token === 'link') return 'link text'
  if (token === 'border' || token === 'input' || background === 'border') return 'a hairline'
  return 'text'
}

/** Where it sits. Background tokens are named for what a person sees. */
function whereFails(token: string, background: string, mode: 'light' | 'dark'): string {
  if (background === 'background') return `on the ${mode} page`
  if (background === 'card') return `on ${mode} cards`
  if (token === `${background}-foreground`) return `for the label on its ${mode} fill`
  return `on the ${mode} ${background.replace(/-/g, ' ')}`
}

/**
 * The first check a LOCKED seat fails, or null. Unlocked seats are the
 * engine's to fix and never warn here; the status chip still counts them.
 */
export function lockedFailure(
  result: ThemeResult,
  role: Role,
  mode: 'light' | 'dark',
): SeatFailure | null {
  for (const m of mode === 'light' ? (['light', 'dark'] as const) : (['dark', 'light'] as const)) {
    const { report, ancestry } = result[m]
    for (const row of report) {
      if (row.pass) continue
      const anc = ancestry[row.token]
      if (anc?.kind !== 'role' || anc.role !== role) continue
      const what = whatFails(row.token, row.background, role)
      const where = whereFails(row.token, row.background, m)
      // WCAG is the gate at every level; above standard an APCA floor joins
      // it, and a row can fail on that alone.
      if (row.wcag < row.requiredWcag || row.requiredLc == null) {
        return {
          short: ratio(row.wcag),
          reason: `${ratio(row.wcag)} ${where}; ${what} needs ${needed(row.requiredWcag)}`,
        }
      }
      const lc = `Lc ${Math.floor(row.apca)}`
      return { short: lc, reason: `${lc} ${where}; ${what} needs Lc ${row.requiredLc}` }
    }
  }
  for (const r of result.repairs) {
    if (r.a !== role && r.b !== role) continue
    const other = r.a === role ? r.b : r.a
    return {
      short: `≈ ${other}`,
      reason: `${r.label}: ΔE ${formatDeltaE(r.deltaE)} apart, needs ${formatDeltaE(r.required)}`,
    }
  }
  return null
}
