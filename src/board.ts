/**
 * The role board's view model and its verbs.
 *
 * The board shows roles as labeled seats you fill, rather than a list of colors
 * you assign roles to. Nothing about the engine's input shape changes: a color
 * sitting in a seat is just a candidate with `pin: role`, and the bench is
 * `benched: true`. This module is the whole translation, so components never
 * reason about candidate indexes directly.
 *
 * Three provenances, because the question a user needs answered is "will riff
 * change this?":
 *   yours   — you supplied it and placed it        (riff never touches it)
 *   kept    — the engine derived it, you froze it  (riff never touches it)
 *   derived — the engine computed it               (riff re-rolls it)
 */
import type { ColorCandidate, Oklch, Role, ThemeResult } from './engine'
import { ROLES, apcaLc, toHex, tokenAncestry } from './engine'

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
  hex: string
  provenance: Provenance
  /** Index into candidates, or null when the engine derived this seat. */
  candidateIndex: number | null
}

export interface SeriesEntry {
  /** 1-based chart slot, matching the `chart-N` tokens. */
  slot: number
  hex: string
  provenance: Provenance
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

  const slots: BoardSlot[] = ROLES.map((role) => {
    const a = byRole.get(role)
    const ci = a?.candidateIndex ?? null
    return {
      role,
      hex: ci != null ? toHex(candidates[ci].color) : a ? toHex(a.seed) : '#000000',
      provenance: provenanceOf(ci != null ? candidates[ci] : undefined),
      candidateIndex: ci,
    }
  })

  // The tray reads the chart tokens' ancestry rather than chartCandidateIndexes,
  // so an invented fill shows up as `derived` in the seat it actually occupies.
  const ancestry = tokenAncestry(result, mode)
  const series: SeriesEntry[] = Array.from({ length: SERIES_SEATS }, (_, k) => {
    const ci = ancestry[`chart-${k + 1}`] ?? null
    return {
      slot: k + 1,
      hex: result[mode].tokens[`chart-${k + 1}`],
      provenance: provenanceOf(ci != null ? candidates[ci] : undefined),
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
 * UI must not promise "let the smith derive it" — name the color that would
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
 * change — only its provenance, and therefore whether riff may move it.
 */
export function keepRole(
  candidates: ColorCandidate[],
  role: Role,
  color: Oklch,
  raw: string,
): ColorCandidate[] {
  return [...candidates, { color, source: 'manual', raw, pin: role, origin: 'invented' }]
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
 * different color and the whole theme re-forges around a hue nobody chose.
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
    parts.push(`benches ${target.hex}`)
  } else if (target && target.provenance === 'derived') {
    parts.push('takes a seat the engine was inventing')
  }

  // What becomes of the seat this colour is leaving.
  const from = view.slots.find((s) => s.candidateIndex === candidateIndex)
  if (from && from.role !== role) {
    const now = after.slots.find((s) => s.role === from.role)
    if (now?.provenance === 'derived') parts.push(`${from.role} goes to the smith`)
    else if (now) parts.push(`frees ${from.role} for ${now.hex}`)
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
  return { hex: after.hex, candidateIndex: after.candidateIndex }
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

/** Riff can only move seats the engine derived; true when any seat is derived. */
export const hasDerivedSeats = (view: BoardView): boolean =>
  view.slots.some((s) => s.provenance === 'derived') ||
  view.series.some((s) => s.provenance === 'derived')
