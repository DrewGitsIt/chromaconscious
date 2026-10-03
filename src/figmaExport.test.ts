/// <reference types="node" />
/**
 * The Figma variables export, held to what Figma's DTCG importer will do with
 * it. Figma fails quietly — a token missing from one file, typed differently,
 * or colliding after the `/` rename is dropped without a word — so every one
 * of those is asserted here rather than discovered in Figma.
 *
 * The parser below is written from Figma's documented rules, not from the
 * exporter, so the two can't share a mistake:
 *   - nested groups become `/` names; on a collision the first one wins
 *   - a variable is made only for a token present in every file, with the same
 *     `$type`, of a supported type and value
 *   - a colour is `{colorSpace, components, alpha, hex?}` with 0..1 components
 *
 *   Re-record the file snapshots after a deliberate change:
 *   npx vitest run --dir src src/figmaExport.test.ts -u
 */
import { createHash } from 'node:crypto'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { FigmaModeFile, ThemeResult } from './engine'
import { candidatesFromList, CONTRAST_LEVELS, figmaColor, themeFigmaModes } from './engine'
import { FIGMA_MODE_NAMES, figmaExport, figmaModeFiles } from './figmaExport'
import type { ThemeState } from './ops'
import { applyOp, buildTheme, emptyThemeState } from './ops'
import { PRESETS } from './presets'

// --- a Figma-shaped reader -------------------------------------------------

/** Types Figma's importer turns into variables (help.figma.com, "Modes for variables"). */
const FIGMA_TYPES = new Set(['color', 'dimension', 'fontFamily', 'duration', 'number', 'string'])

interface Variable {
  type: string
  value: unknown
}

/** One file as Figma names its variables: groups joined by `/`, first of a collision wins. */
function figmaRead(doc: Record<string, unknown>): { vars: Map<string, Variable>; collisions: string[] } {
  const vars = new Map<string, Variable>()
  const collisions: string[] = []
  const walk = (node: Record<string, unknown>, path: string[]) => {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      const c = child as Record<string, unknown>
      // Figma also treats `.` in a name as a group separator (color.accent.light → color/accent/light).
      const here = [...path, ...key.split('.')]
      if ('$value' in c) {
        const name = here.join('/')
        if (vars.has(name)) collisions.push(name)
        else vars.set(name, { type: String(c.$type), value: c.$value })
      } else walk(c, here)
    }
  }
  walk(doc, [])
  return { vars, collisions }
}

/** What Figma stores: 8-bit channels from the components. Not from `hex`, which is only a fallback. */
const byte = (x: number) => Math.round(x * 255)
const toHex = (components: number[]) => '#' + components.map((x) => byte(x).toString(16).padStart(2, '0')).join('')

interface FigmaColorValue {
  colorSpace: string
  components: number[]
  alpha: number
  hex?: string
}

// --- fixtures --------------------------------------------------------------

const stateOf = (colors: string[], over: Partial<ThemeState> = {}): ThemeState => ({
  ...emptyThemeState(),
  candidates: candidatesFromList(colors),
  ...over,
})

/**
 * The golden net's palettes (src/engine/golden.test.ts): every preset, plus
 * the edge palettes most likely to break an exporter — greys, out-of-gamut, a
 * single colour — and a riffed, locked, flat one.
 */
const FIXTURES: Record<string, ThemeState> = {
  ...Object.fromEntries(PRESETS.map((p) => [p.name, stateOf(p.colors, { preset: p.name })])),
  single: stateOf(['#3b82f6']),
  greys: stateOf(['#111111', '#444444', '#888888', '#cccccc', '#f5f5f5']),
  'out-of-gamut': stateOf(['oklch(0.7 0.37 145)', 'oklch(0.55 0.35 300)', 'oklch(0.9 0.3 100)']),
  'riffed-locked-flat': applyOp(
    stateOf(PRESETS[2].colors, { seed: 5, fidelity: 0.8, separation: 'flat' }),
    { op: 'lock', role: 'primary' },
    { mode: 'light' },
  ),
}

const exportOf = (state: ThemeState) => {
  const zip = figmaExport(state)!
  const entries = unzipSync(zip.bytes)
  const files = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strFromU8(v)]))
  return { zip, files }
}

const modeFiles = (files: Record<string, string>) =>
  Object.entries(files).filter(([k]) => k.endsWith('.json')) as Array<[string, string]>

// --- 1. schema -------------------------------------------------------------

describe('figma export: schema', () => {
  it('zips a README and one file per mode × contrast level, standard first', () => {
    const { zip, files } = exportOf(FIXTURES.single)
    expect(zip.filename).toBe('chromaconscious-figma.zip')
    expect(Object.keys(files)).toEqual([
      'README.txt',
      'light.json',
      'dark.json',
      'light-medium.json',
      'dark-medium.json',
      'light-high.json',
      'dark-high.json',
    ])
    expect(FIGMA_MODE_NAMES.map((n) => `${n}.json`)).toEqual(Object.keys(files).slice(1))
  })

  for (const [name, state] of Object.entries(FIXTURES)) {
    it(`${name}: every token has a supported type, colours are sRGB objects, and no names collide`, () => {
      for (const [file, text] of modeFiles(exportOf(state).files)) {
        const doc = JSON.parse(text)
        const { vars, collisions } = figmaRead(doc)
        expect(collisions, file).toEqual([])
        // 44 role tokens + the scrim, and 6 ramps × 12 steps.
        expect(vars.size, file).toBe(48 + 72)
        for (const [path, v] of vars) {
          expect(FIGMA_TYPES.has(v.type), `${file} ${path} $type ${v.type}`).toBe(true)
          expect(v.type).toBe('color')
          const c = v.value as FigmaColorValue
          expect(Object.keys(c).sort(), path).toEqual(['alpha', 'colorSpace', 'components', 'hex'])
          expect(c.colorSpace).toBe('srgb')
          expect(c.components).toHaveLength(3)
          for (const x of c.components) expect(x >= 0 && x <= 1, `${path} ${x}`).toBe(true)
          expect(c.alpha >= 0 && c.alpha <= 1).toBe(true)
          expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
        }
        // Raw names never hold a separator Figma would re-split.
        const keys = (o: object): string[] =>
          Object.entries(o).flatMap(([k, v]) => (k.startsWith('$') ? [] : [k, ...('$value' in v ? [] : keys(v))]))
        for (const k of keys(doc)) expect(k, file).not.toMatch(/[./{}]/)
        // No shadow or array value reaches Figma: shadows ride in $extensions.
        expect(doc.$extensions.chromaconscious.shadows).toHaveProperty('elevation-2')
        expect(doc.$extensions.chromaconscious.shadows['elevation-2'].$type).toBe('shadow')
      }
    })
  }
})

// --- 2. identical token paths ---------------------------------------------

describe('figma export: every mode file defines the same variables', () => {
  for (const [name, state] of Object.entries(FIXTURES)) {
    it(`${name}: identical path and type sets across all six files`, () => {
      const sets = modeFiles(exportOf(state).files).map(([file, text]) => {
        const { vars } = figmaRead(JSON.parse(text))
        return [file, [...vars].map(([p, v]) => `${p}:${v.type}`).sort()] as const
      })
      for (const [file, set] of sets) expect(set, file).toEqual(sets[0][1])
    })
  }

  it('refuses to emit files that disagree, rather than let Figma drop the difference', () => {
    const r = buildTheme(FIXTURES.single)!
    const odd: ThemeResult = { ...r, dark: { ...r.dark, tokens: { ...r.dark.tokens, extra: '#123456' } } }
    expect(() => themeFigmaModes({ standard: odd })).toThrow(/define different tokens/)
  })

  it('refuses a token name Figma would split into groups', () => {
    const r = buildTheme(FIXTURES.single)!
    const bad = (k: string): ThemeResult => ({
      ...r,
      light: { ...r.light, tokens: { ...r.light.tokens, [k]: '#123456' } },
      dark: { ...r.dark, tokens: { ...r.dark.tokens, [k]: '#123456' } },
    })
    expect(() => themeFigmaModes({ standard: bad('chart/1') })).toThrow(/not a valid token name/)
    expect(() => themeFigmaModes({ standard: bad('chart.1') })).toThrow(/not a valid token name/)
  })
})

// --- 3. golden snapshots ---------------------------------------------------

describe('figma export: golden', () => {
  const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex').slice(0, 20)

  it('one preset, in full, at standard and high', async () => {
    const { files } = exportOf(FIXTURES[PRESETS[0].name])
    const dir = './engine/__golden__/figma'
    for (const f of ['README.txt', 'light.json', 'dark.json', 'light-high.json', 'dark-high.json'])
      await expect(files[f]).toMatchFileSnapshot(`${dir}/${f}`)
  })

  it('every fixture, hashed: the zip bytes and each file at standard and high', async () => {
    const table: Record<string, Record<string, string>> = {}
    for (const [name, state] of Object.entries(FIXTURES)) {
      const { zip, files } = exportOf(state)
      table[name] = {
        zip: sha(zip.bytes),
        ...Object.fromEntries(
          ['light.json', 'dark.json', 'light-high.json', 'dark-high.json'].map((f) => [f, sha(files[f])]),
        ),
      }
    }
    await expect(JSON.stringify(table, null, 1) + '\n').toMatchFileSnapshot('./engine/__golden__/figma/hashes.json')
  })
})

// --- 4. round trip ---------------------------------------------------------

describe('figma export: round trip, exact', () => {
  it('encodes sRGB, not linear light: #808080 is 128/255 per channel and comes back #808080', () => {
    const c = figmaColor('#808080')
    for (const x of c.components) expect(x).toBeCloseTo(0.50196, 5)
    expect(toHex(c.components)).toBe('#808080')
    // The two wrong encodings, named so a regression says which it is:
    // treating sRGB as linear and encoding it again lands near #bcbcbc;
    // linearizing lands near 0.216 (#373737).
    expect(toHex(c.components)).not.toBe('#bcbcbc')
    expect(c.components[0]).not.toBeCloseTo(0.2158, 2)
    expect(byte(0x80 / 255)).toBe(0x80)
  })

  it('every 8-bit value survives components → byte → hex', () => {
    for (let v = 0; v < 256; v++) {
      const h = v.toString(16).padStart(2, '0')
      const c = figmaColor(`#${h}${h}${h}`)
      expect(toHex(c.components)).toBe(`#${h}${h}${h}`)
      expect(c.hex).toBe(`#${h}${h}${h}`)
    }
  })

  for (const [name, state] of Object.entries(FIXTURES)) {
    it(`${name}: every variable reads back as the theme's own hex, at every level`, () => {
      const { files } = exportOf(state)
      for (const [level, contrast] of Object.entries(CONTRAST_LEVELS)) {
        const theme = buildTheme({ ...state, contrast })!
        for (const mode of ['light', 'dark'] as const) {
          const file = level === 'standard' ? `${mode}.json` : `${mode}-${level}.json`
          const { vars } = figmaRead(JSON.parse(files[file]))
          const read = (path: string) => {
            const v = vars.get(path)!.value as FigmaColorValue
            // components and hex must name the same colour.
            expect(v.hex, `${file} ${path}`).toBe(toHex(v.components))
            return v
          }
          const m = theme[mode]
          for (const [k, hex] of Object.entries(m.tokens)) {
            const v = read(`color/${k}`)
            expect(toHex(v.components), `${file} color/${k}`).toBe(hex.toLowerCase())
            expect(v.alpha).toBe(1)
          }
          for (const [role, ramp] of Object.entries(m.ramps))
            ramp.forEach((hex, i) =>
              expect(toHex(read(`ramp/${role}/${i + 1}`).components), `${file} ramp/${role}/${i + 1}`).toBe(
                hex.toLowerCase(),
              ),
            )
          // The scrim is the one colour with alpha, and the alpha must survive.
          const scrim = read('color/scrim')
          expect(toHex(scrim.components)).toBe(m.effects.scrim.color.toLowerCase())
          expect(scrim.alpha).toBe(m.effects.scrim.alpha)
          expect(scrim.alpha).toBeLessThan(1)
        }
      }
    })
  }

  it('the contrast levels are genuinely different themes', () => {
    const { files } = exportOf(FIXTURES[PRESETS[0].name])
    expect(files['light-high.json']).not.toBe(files['light.json'])
    expect(files['light-medium.json']).not.toBe(files['light-high.json'])
  })

  it('exports all three levels whatever the slider is set to', () => {
    const s = FIXTURES.single
    expect(figmaExport({ ...s, contrast: 1 })!.bytes).toEqual(figmaExport(s)!.bytes)
  })
})

// --- determinism, which the API ↔ client byte test relies on --------------

describe('figma export: deterministic bytes', () => {
  it('is the same zip twice, and nothing in it depends on the clock', () => {
    const a = figmaExport(FIXTURES.single)!.bytes
    const b = figmaExport(FIXTURES.single)!.bytes
    expect(a).toEqual(b)
  })

  it('a single mode file is the same text as that file in the zip', () => {
    const all = figmaModeFiles(FIXTURES.greys)!
    const one = figmaModeFiles(FIXTURES.greys, ['high'])!
    expect(one.map((f: FigmaModeFile) => f.name)).toEqual(['light-high', 'dark-high'])
    expect(one[1].json).toBe(all.find((f) => f.name === 'dark-high')!.json)
  })

  it('has nothing to export before there are colours', () => {
    expect(figmaExport(emptyThemeState())).toBeNull()
  })
})
