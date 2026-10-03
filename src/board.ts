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
    return {
      slot: k + 1,
      hex: result[mode].tokens[`chart-${k + 1}`],
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
 * Change the colour sitting in a seat to one the user just picked.
 *
 * Three cases, mirroring the lock's:
 *   yours/kept — the candidate itself is edited, so the new colour flows
 *     through the engine like any input (fidelity, repair, the walk).
 *   locked     — the snapshot moves too. The engine takes `lockedColor`
 *     verbatim, so editing `color` alone would change nothing on screen —
 *     the one outcome an "adjust" control must never produce.
 *   derived    — no candidate to edit, so one is materialised at the picked
 *     colour, exactly as keeping the seat would (pinned and locked).
 *
 * `source` flips to manual: whatever extracted the old colour, this one was
 * picked by hand.
 *
 * The adjusted candidate is PINNED to the seat it was adjusted in. Without the
 * pin the next solve is free to re-cast the new colour into whichever seat it
 * now suits best — adjust accent toward green and the green lands in success —
 * and "adjust this seat" silently becomes "reshuffle the board".
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
  const holder = candidates[slot.candidateIndex]
  return patch(candidates, slot.candidateIndex, {
    color,
    raw,
    source: 'manual',
    pin: role,
    ...(holder.locked ? { lockedColor: color } : {}),
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
