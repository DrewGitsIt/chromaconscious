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
import type { ColorCandidate } from './index'
import {
  ROLES,
  generateTheme,
  resolveBrand,
  themeTailwind,
  themeTokensJson,
  whyLines,
} from './index'
import { describePlacement, readBoard, wouldTakeOver } from '../board'
import type { Config } from './goldenConfigs'
import { configs } from './goldenConfigs'

const GOLDEN = new URL('./__golden__/themes.json', import.meta.url)

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
