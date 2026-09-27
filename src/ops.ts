/**
 * The verb set: every change a person can make to a theme, as data.
 *
 * The UI dispatches these and the remote API will too, so the two cannot grow
 * two ideas of what "riff" or "lock" means. Each op is a pure function of the
 * theme's state; board.ts still owns the candidate-level mechanics, and this
 * module is the one place that decides which of them a verb runs and what else
 * it resets (the preset tag, the mono index, the riff count).
 *
 * Candidates are addressed by index here, as the board does. Resolving a
 * friendlier reference — a role, a chart slot, a hex — to an index is the
 * caller's job (the API's query parser), because an index is only meaningful
 * against the exact state it was read from.
 */
import type { ColorCandidate, Role, Separation, ThemeResult } from './engine'
import { candidatesFromList, generateTheme, parseColor } from './engine'
import type { BoardView } from './board'
import {
  adjustRole,
  benchCandidate,
  deriveRole,
  dropCandidate,
  keepRole,
  lockRole,
  lockSeries,
  placeInRole,
  placeInSeries,
  readBoard,
  remapAfterRemove,
  resetPlacements,
  unbenchCandidate,
  unlockRole,
  unlockSeries,
} from './board'

export type Mode = 'light' | 'dark'

/** Everything the engine needs to forge a theme — and nothing about how it is viewed. */
export interface ThemeState {
  candidates: ColorCandidate[]
  fidelity: number
  /** Mono lock: candidate index whose hue rules the theme, or null. */
  monoBase: number | null
  /** Riff hops from the cookbook; 0 = the cookbook. */
  seed: number
  separation: Separation
  /** Name of the applied preset; cleared once candidates diverge from it. */
  preset: string | null
}

export const emptyThemeState = (): ThemeState => ({
  candidates: [],
  fidelity: 0.5,
  monoBase: null,
  seed: 0,
  separation: 'layered',
  preset: null,
})

export type Op =
  /** Append colours (any CSS colour strings; unparseable ones are skipped). */
  | { op: 'add'; colors: string[] }
  /** Replace the whole set — a preset, an image's colours, or nothing. Resets riff and mono. */
  | { op: 'start'; candidates: ColorCandidate[]; preset: string | null }
  | { op: 'preset'; name: string; colors: string[] }
  | { op: 'drop'; index: number }
  | { op: 'place'; index: number; role: Role }
  | { op: 'series'; index: number }
  | { op: 'bench'; index: number }
  | { op: 'unbench'; index: number }
  /** Free a seat: its holder goes to the bench and the engine derives the role. */
  | { op: 'derive'; role: Role }
  /** Set a seat's colour directly (the picker). A derived seat is kept first. */
  | { op: 'adjust'; role: Role; color: string }
  /** Lock a seat where it stands. A derived seat is kept, which locks it. */
  | { op: 'lock'; role: Role }
  | { op: 'unlock'; role: Role }
  | { op: 'lockSeries'; slot: number }
  | { op: 'unlockSeries'; slot: number }
  /** Clear every explicit placement — back to the engine's own casting. */
  | { op: 'reset' }
  | { op: 'riff'; hops?: number }
  | { op: 'back'; hops?: number }
  | { op: 'mono'; index: number | null }
  | { op: 'fidelity'; value: number }
  | { op: 'separation'; value: Separation }

export interface OpContext {
  /**
   * Which mode the board is read in. It matters: a series slot's colour is
   * its mode's token, so locking one freezes the colour you are looking at.
   */
  mode: Mode
  /** The board for `state`, if the caller already has it; built otherwise. */
  view?: BoardView | null
}

export function buildTheme(state: ThemeState): ThemeResult | null {
  if (state.candidates.length === 0) return null
  return generateTheme({
    candidates: state.candidates,
    fidelity: state.fidelity,
    monoBase: state.monoBase ?? undefined,
    seed: state.seed,
    separation: state.separation,
  })
}

/**
 * Apply one op. Returns `state` itself when the op changes nothing (an index
 * that names no colour, a lock on a seat that cannot hold one), so callers can
 * compare by identity.
 */
export function applyOp<S extends ThemeState>(state: S, op: Op, ctx: OpContext): S {
  const withCandidates = (candidates: ColorCandidate[]): S =>
    candidates === state.candidates ? state : { ...state, candidates, preset: null }
  const board = (): BoardView | null => {
    if (ctx.view !== undefined) return ctx.view
    const result = buildTheme(state)
    return result ? readBoard(result, state.candidates, ctx.mode) : null
  }
  const has = (i: number) => i >= 0 && i < state.candidates.length

  switch (op.op) {
    case 'add': {
      const added = candidatesFromList(op.colors)
      return added.length ? withCandidates([...state.candidates, ...added]) : state
    }
    case 'start':
      return { ...state, candidates: op.candidates, preset: op.preset, monoBase: null, seed: 0 }
    case 'preset':
      return applyOp(state, { op: 'start', candidates: candidatesFromList(op.colors), preset: op.name }, ctx)
    case 'drop':
      if (!has(op.index)) return state
      // The mono base is an INDEX — it must be remapped with the splice or the
      // lock silently re-points at another colour.
      return {
        ...state,
        candidates: dropCandidate(state.candidates, op.index),
        preset: null,
        monoBase: remapAfterRemove(state.monoBase, op.index),
      }
    case 'place': {
      const view = board()
      return view && has(op.index) ? withCandidates(placeInRole(state.candidates, op.index, op.role, view)) : state
    }
    case 'series':
      return has(op.index) ? withCandidates(placeInSeries(state.candidates, op.index)) : state
    case 'bench':
      return has(op.index) ? withCandidates(benchCandidate(state.candidates, op.index)) : state
    case 'unbench':
      return has(op.index) ? withCandidates(unbenchCandidate(state.candidates, op.index)) : state
    case 'derive': {
      const view = board()
      return view ? withCandidates(deriveRole(state.candidates, op.role, view)) : state
    }
    case 'adjust': {
      const view = board()
      const parsed = parseColor(op.color)
      return view && parsed ? withCandidates(adjustRole(state.candidates, op.role, parsed, op.color, view)) : state
    }
    case 'lock': {
      // The lock is the only thing that stops riff moving a colour. A derived
      // seat has no candidate to carry one, so locking it means keeping it —
      // which materialises a candidate at exactly the colour on screen.
      const view = board()
      const slot = view?.slots.find((s) => s.role === op.role)
      if (!view || !slot || slot.locked) return state
      if (slot.provenance === 'derived') {
        const parsed = parseColor(slot.hex)
        return parsed ? withCandidates(keepRole(state.candidates, op.role, parsed, slot.hex)) : state
      }
      return withCandidates(lockRole(state.candidates, op.role, view))
    }
    case 'unlock': {
      const view = board()
      const slot = view?.slots.find((s) => s.role === op.role)
      return view && slot?.locked ? withCandidates(unlockRole(state.candidates, op.role, view)) : state
    }
    case 'lockSeries':
    case 'unlockSeries': {
      // A derived chart fill has no candidate and no `keep` to make one.
      const view = board()
      const entry = view?.series.find((s) => s.slot === op.slot)
      if (!view || !entry || entry.candidateIndex == null) return state
      if ((op.op === 'lockSeries') === entry.locked) return state
      return withCandidates(
        op.op === 'lockSeries'
          ? lockSeries(state.candidates, op.slot, view)
          : unlockSeries(state.candidates, op.slot, view),
      )
    }
    case 'reset':
      return withCandidates(resetPlacements(state.candidates))
    case 'riff':
      return { ...state, seed: state.seed + (op.hops ?? 1) }
    case 'back':
      return { ...state, seed: Math.max(0, state.seed - (op.hops ?? 1)) }
    case 'mono':
      if (op.index != null && !has(op.index)) return state
      return { ...state, monoBase: op.index }
    case 'fidelity':
      return { ...state, fidelity: op.value }
    case 'separation':
      return { ...state, separation: op.value }
  }
}
