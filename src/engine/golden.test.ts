/// <reference types="node" />
/**
 * Golden regression net for the engine.
 *
 * Every configuration below is run through the engine and every surface a
 * caller can see — the full ThemeResult, both exporters, the brand adapter,
 * the board view, the casting copy, and the placement probes the assign
 * popover runs — is hashed. The hashes are compared against
 * `__golden__/themes.json`, recorded before a change that is meant to be
 * output-neutral (a speedup, a refactor).
 *
 * A mismatch is not automatically a bug; an intentional engine change will
 * move hashes. Re-record deliberately, after looking at what moved:
 *
 *   GOLDEN_UPDATE=1 npx vitest run src/engine/golden.test.ts
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ColorCandidate, GenerateOptions, Role, Separation } from './index'
import {
  ROLES,
  SEPARATIONS,
  candidatesFromList,
  generateTheme,
  resolveBrand,
  themeTailwind,
  themeTokensJson,
  whyLines,
} from './index'
import { describePlacement, readBoard, wouldTakeOver } from '../board'
import { PRESETS } from '../presets'

const GOLDEN = new URL('./__golden__/themes.json', import.meta.url)

/** Deterministic palettes of any size, spread over lightness, chroma and hue. */
const spread = (n: number, phase = 0): string[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i + phase
    const l = 0.2 + 0.7 * ((t * 0.618034) % 1)
    const c = t % 5 === 4 ? 0.01 : 0.04 + 0.2 * ((t * 0.414214) % 1)
    const h = (t * 137.508) % 360
    return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`
  })

/** Palettes that stress the edges: gamut, extremes, near-duplicates, greys. */
const EDGE_PALETTES: Record<string, string[]> = {
  single: ['#3b82f6'],
  black: ['#000000'],
  white: ['#ffffff'],
  greys: ['#111111', '#444444', '#888888', '#cccccc', '#f5f5f5'],
  'out-of-gamut': ['oklch(0.7 0.37 145)', 'oklch(0.55 0.35 300)', 'oklch(0.9 0.3 100)'],
  'near-duplicates': ['#e63946', '#e5394a', '#e73a45', '#457b9d'],
  neon: ['#ff00ff', '#00ffff', '#ffff00', '#00ff00'],
  'dark-only': ['#0b0b10', '#121826', '#1a1a2e', '#16213e'],
  'pale-only': ['#fdf6e3', '#eee8d5', '#f5f0e1', '#fffaf0'],
  statusy: ['#dc2626', '#16a34a', '#f59e0b', '#2563eb'],
}

const PALETTES: Record<string, string[]> = {
  ...Object.fromEntries(PRESETS.map((p) => [`preset:${p.name}`, p.colors])),
  ...EDGE_PALETTES,
  'spread-2': spread(2),
  'spread-8': spread(8, 3),
  'spread-16': spread(16, 7),
  'spread-32': spread(32, 11),
}

/** Board-state variations layered over a palette's candidates. */
type Variant = (c: ColorCandidate[]) => ColorCandidate[] | null
const VARIANTS: Record<string, Variant> = {
  plain: (c) => c,
  'pin-last-primary': (c) =>
    c.length < 2 ? null : c.map((x, i) => (i === c.length - 1 ? { ...x, pin: 'primary' as Role } : x)),
  'lock-first': (c) => c.map((x, i) => (i === 0 ? { ...x, locked: true } : x)),
  'lock-walked': (c) =>
    c.map((x, i) =>
      i === 0 ? { ...x, locked: true, lockedColor: { l: 0.62, c: 0.14, h: (x.color.h + 40) % 360 } } : x,
    ),
  'bench-second': (c) => (c.length < 2 ? null : c.map((x, i) => (i === 1 ? { ...x, benched: true } : x))),
  'chart-pin': (c) => (c.length < 3 ? null : c.map((x, i) => (i === 2 ? { ...x, pin: 'chart' as const } : x))),
  kept: (c) => [...c, { ...c[0], color: { l: 0.7, c: 0.12, h: 200 }, raw: 'oklch(0.7 0.12 200)', origin: 'invented' }],
}

interface Config {
  key: string
  opts: GenerateOptions
}

function configs(): Config[] {
  const out: Config[] = []
  for (const [pname, colors] of Object.entries(PALETTES)) {
    const base = candidatesFromList(colors)
    const big = colors.length > 8
    for (const [vname, variant] of Object.entries(VARIANTS)) {
      const candidates = variant(base)
      if (!candidates) continue
      // Keep the grid tractable: the full cross product on plain boards, a
      // representative slice on the variants.
      const fidelities = vname === 'plain' ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]
      const seeds = vname === 'plain' ? (big ? [0, 1, 7] : [0, 1, 3, 12, 50]) : [0, 2, 9]
      const seps: Separation[] = vname === 'plain' ? SEPARATIONS : ['layered']
      const monos: (number | undefined)[] = vname === 'plain' || vname === 'lock-first' ? [undefined, 0] : [undefined]
      for (const fidelity of fidelities)
        for (const seed of seeds)
          for (const separation of seps)
            for (const monoBase of monos)
              out.push({
                key: `${pname}|${vname}|f${fidelity}|s${seed}|${separation}|m${monoBase ?? '-'}`,
                opts: { candidates, fidelity, seed, separation, monoBase },
              })
    }
  }
  return out
}

/** Everything a caller of the engine can observe for one configuration. */
function observe({ opts }: Config, probes: boolean): unknown {
  const regenerate = (next: ColorCandidate[]) => generateTheme({ ...opts, candidates: next })
  const r = generateTheme(opts)
  const cands = opts.candidates
  const light = readBoard(r, cands, 'light')
  const dark = readBoard(r, cands, 'dark')
  const obs: Record<string, unknown> = {
    result: r,
    tailwind: themeTailwind(r),
    tokensJson: themeTokensJson(r),
    brand: { light: resolveBrand(r, 'light'), dark: resolveBrand(r, 'dark') },
    board: { light, dark },
    why: cands.map((_, i) => whyLines(i, r.casting, cands)),
  }
  if (probes) {
    obs.placements = cands.map((_, i) => ROLES.map((role) => describePlacement(cands, i, role, light, regenerate)))
    obs.takeovers = ROLES.map((role) => wouldTakeOver(cands, role, light, regenerate))
  }
  return obs
}

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 20)

describe('golden engine output', () => {
  const all = configs()

  it(`is unchanged across ${all.length} configurations`, () => {
    const actual: Record<string, string> = {}
    // The placement probes regenerate once per candidate × role, so they run on
    // the small-seed slice only; the rest of the grid covers the engine itself.
    for (const c of all) actual[c.key] = hash(observe(c, !/spread-(16|32)/.test(c.key) && c.opts.seed! <= 3))

    if (process.env.GOLDEN_UPDATE || !existsSync(GOLDEN)) {
      writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n')
      return
    }
    const expected: Record<string, string> = JSON.parse(readFileSync(GOLDEN, 'utf8'))
    const moved = Object.keys(expected).filter((k) => expected[k] !== actual[k])
    const missing = Object.keys(actual).filter((k) => !(k in expected))
    expect({ moved: moved.slice(0, 20), movedCount: moved.length, missing: missing.slice(0, 20) }).toEqual({
      moved: [],
      movedCount: 0,
      missing: [],
    })
  }, 600_000)
})
