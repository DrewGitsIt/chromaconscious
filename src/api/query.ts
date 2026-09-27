/**
 * URL parameters → ops.
 *
 * Agents address colours the way a person would point at the board — by role,
 * chart slot or the colour itself — never by candidate index, because an index
 * shifts when a colour is dropped and would silently name the wrong one on the
 * next call. Resolution to an index happens here, against the exact state the
 * op will run on.
 */
import type { ColorCandidate, Role } from '../engine'
import { ROLES, SEPARATIONS, candidatesFromList, parseColor, toHex } from '../engine'
import type { BoardView } from '../board'
import { readBoard } from '../board'
import type { Op, ThemeState } from '../ops'
import { applyOp, buildTheme } from '../ops'
import { PRESETS } from '../presets'

export class QueryError extends Error {}

/** Hops per request. Cost is linear in hops the trail hasn't walked yet. */
export const MAX_HOPS = 50
export const MAX_CANDIDATES = 32

const isRole = (s: string): s is Role => (ROLES as string[]).includes(s)
const list = (v: string | null) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [])
/** Bare hex is the documented form (`#` starts a URL fragment); anything culori reads works. */
const colorText = (s: string) => (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s) ? `#${s}` : s)
const ROLE_LIST = `${ROLES.join(', ')}, chart`

/** `primary:1d3557,e63946,chart:8a6fd1` → candidates, pins applied. */
export function parseColors(value: string): ColorCandidate[] {
  const seen = new Set<string>()
  return list(value).map((entry) => {
    const [head, ...rest] = entry.split(':')
    const pinned = rest.length > 0
    const pin = pinned ? head.toLowerCase() : null
    const text = colorText(pinned ? rest.join(':') : entry)
    if (pin && pin !== 'chart' && !isRole(pin)) throw new QueryError(`unknown role "${pin}" in colors — roles are ${ROLE_LIST}`)
    if (pin && pin !== 'chart') {
      if (seen.has(pin)) throw new QueryError(`two colors pinned to ${pin} — a seat holds one`)
      seen.add(pin)
    }
    const [c] = candidatesFromList([text])
    if (!c) throw new QueryError(`can't read "${text}" as a color — use bare hex like 1d3557, or any CSS color`)
    return pin ? { ...c, pin: pin as Role | 'chart' } : c
  })
}

export function presetByName(name: string) {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const p = PRESETS.find((x) => slug(x.name) === slug(name))
  if (!p) throw new QueryError(`no preset "${name}" — see /presets`)
  return p
}

const boardOf = (s: ThemeState): BoardView | null => {
  const r = buildTheme(s)
  return r ? readBoard(r, s.candidates, 'light') : null
}

/** A role, `chart-N`, or a colour → the candidate index it names right now. */
function indexOf(s: ThemeState, ref: string): number {
  const view = boardOf(s)
  const lower = ref.toLowerCase()
  if (isRole(lower)) {
    const i = view?.slots.find((x) => x.role === lower)?.candidateIndex
    if (i == null) throw new QueryError(`${lower} is derived by the engine — no color of yours sits there`)
    return i
  }
  const chart = /^chart-(\d)$/.exec(lower)
  if (chart) {
    const i = view?.series.find((x) => x.slot === Number(chart[1]))?.candidateIndex
    if (i == null) throw new QueryError(`${lower} is an engine fill, not a color of yours`)
    return i
  }
  const color = parseColor(colorText(ref))
  if (!color) throw new QueryError(`"${ref}" is not a role, chart-N, or color`)
  const hex = toHex(color)
  const i = s.candidates.findIndex((c) => toHex(c.color) === hex)
  if (i < 0) throw new QueryError(`${hex} is not one of this theme's colors`)
  return i
}

const number01 = (name: string, v: string) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new QueryError(`${name} must be between 0 and 1`)
  return n
}

export function hopsParam(q: URLSearchParams): number {
  const v = q.get('hops')
  if (v == null) return 1
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > MAX_HOPS) throw new QueryError(`hops must be a whole number from 1 to ${MAX_HOPS}`)
  return n
}

/** Run ops one at a time, each against the state the previous one left. */
function run(s: ThemeState, ops: Array<Op | ((s: ThemeState) => Op)>): ThemeState {
  for (const op of ops) s = applyOp(s, typeof op === 'function' ? op(s) : op, { mode: 'light' })
  return s
}

/**
 * The edits every theme-producing call accepts, applied in a fixed order:
 * set the colours, then settings, then placements, then locks. Locks go last
 * so they freeze colours where the other edits left them.
 */
export function applyEdits(start: ThemeState, q: URLSearchParams, fromExisting: boolean): ThemeState {
  let s = start
  const colors = q.get('colors')
  if (colors != null) {
    const incoming = parseColors(colors)
    // On an existing theme, colours replace what you haven't locked; a lock is
    // a promise that riff and re-colouring leave that colour where it is.
    const kept = fromExisting ? s.candidates.filter((c) => c.locked) : []
    s = { ...s, candidates: [...kept, ...incoming], preset: null, monoBase: null }
  }
  const add = q.get('add')
  if (add != null) s = { ...s, candidates: [...s.candidates, ...parseColors(add)], preset: null }
  if (s.candidates.length > MAX_CANDIDATES) throw new QueryError(`at most ${MAX_CANDIDATES} colors`)

  const ops: Array<Op | ((s: ThemeState) => Op)> = []
  const taste = q.get('taste')
  if (taste != null) ops.push({ op: 'fidelity', value: number01('taste', taste) })
  const separation = q.get('separation')
  if (separation != null) {
    if (!(SEPARATIONS as string[]).includes(separation))
      throw new QueryError(`separation is one of ${SEPARATIONS.join(', ')}`)
    ops.push({ op: 'separation', value: separation as ThemeState['separation'] })
  }
  const mono = q.get('mono')
  if (mono != null) ops.push((s) => ({ op: 'mono', index: mono === 'off' ? null : indexOf(s, mono) }))
  for (const ref of list(q.get('bench'))) ops.push((s) => ({ op: 'bench', index: indexOf(s, ref) }))
  for (const role of list(q.get('derive'))) {
    if (!isRole(role)) throw new QueryError(`derive takes roles — ${ROLES.join(', ')}`)
    ops.push({ op: 'derive', role })
  }
  const lockOp = (kind: 'lock' | 'unlock', ref: string): Op => {
    const chart = /^chart-(\d)$/.exec(ref)
    if (chart) return { op: kind === 'lock' ? 'lockSeries' : 'unlockSeries', slot: Number(chart[1]) }
    if (!isRole(ref)) throw new QueryError(`${kind} takes roles or chart-N — ${ROLE_LIST}`)
    return { op: kind, role: ref }
  }
  for (const ref of list(q.get('unlock'))) ops.push(lockOp('unlock', ref))
  for (const ref of list(q.get('lock'))) ops.push(lockOp('lock', ref))
  return run(s, ops)
}

export const riffOp = (hops: number): Op => ({ op: 'riff', hops })
export const backOp = (hops: number): Op => ({ op: 'back', hops })
export { run as runOps }
