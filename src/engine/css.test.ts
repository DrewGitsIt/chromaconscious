import { describe, expect, it } from 'vitest'
import { emitCss, themeTailwind, themeTokensJson } from './css'
import { candidatesFromList, generateTheme } from './index'
import type { Ramp, Role, ShadowLayer, ThemeEffects, ThemeMode } from './types'

// The exporters are the only place that knows a shadow is not a colour. The
// engine hands them structured layers; CSS wants one flattened `box-shadow`
// string, DTCG wants a composite under `$type: 'shadow'`, and Tailwind wants
// them in a namespace that isn't `--color-*`. These pin all three, plus the
// promise that a theme with no elevation still exports exactly what it did
// before elevation existed.

const LIGHT_TOKENS = { background: '#ffffff', primary: '#3b82f6' }
const DARK_TOKENS = { background: '#0a0a0a', primary: '#60a5fa' }

const layer = (over: Partial<ShadowLayer>): ShadowLayer => ({
  offsetX: 0,
  offsetY: 1,
  blur: 2,
  spread: 0,
  color: '#2b2724', // 43 39 36 — a hue-tinted shadow, not black
  alpha: 0.05,
  ...over,
})

const LIGHT_EFFECTS: ThemeEffects = {
  elevation: {
    // Level 1 empty, the way `flat` ships it.
    1: [],
    2: [layer({}), layer({ offsetY: 8, blur: 20, spread: -6, alpha: 0.09 })],
    3: [layer({}), layer({ offsetY: 24, blur: 48, spread: -12, alpha: 0.18 })],
  },
  scrim: { color: '#2b2724', alpha: 0.32 },
}

const DARK_EFFECTS: ThemeEffects = {
  elevation: {
    1: [layer({ color: '#ffffff', alpha: 0.045, inset: true })],
    2: [
      layer({ color: '#050505', alpha: 0.28 }),
      layer({ offsetY: 8, blur: 20, spread: -6, color: '#050505', alpha: 0.4 }),
      // 0.045 * 1.4 = 0.06300000000000001 in IEEE 754; the export must not say so.
      layer({ color: '#ffffff', alpha: 0.045 * 1.4, blur: 0, inset: true }),
    ],
    3: [layer({ offsetY: 24, blur: 48, spread: -12, color: '#050505', alpha: 0.55 })],
  },
  scrim: { color: '#050505', alpha: 0.58 },
}

const EMPTY_RAMPS: Record<Role, Ramp> = {
  primary: [],
  accent: [],
  neutral: [],
  danger: [],
  success: [],
  warning: [],
}

const mode = (tokens: Record<string, string>, effects: ThemeEffects): ThemeMode => ({
  tokens,
  ramps: EMPTY_RAMPS,
  report: [],
  ancestry: {},
  effects,
})

const fixture = () => ({
  light: mode(LIGHT_TOKENS, LIGHT_EFFECTS),
  dark: mode(DARK_TOKENS, DARK_EFFECTS),
})

// The three exporters verbatim as they stood before elevation. Every "colour
// portion unchanged" assertion below compares against these rather than a
// hand-copied string, so the pin can't drift into agreeing with a new bug.
function legacyCss(light: Record<string, string>, dark: Record<string, string>): string {
  const block = (tokens: Record<string, string>, indent = '  ') =>
    Object.entries(tokens)
      .map(([k, v]) => `${indent}--${k}: ${v};`)
      .join('\n')
  return `:root {\n${block(light)}\n}\n\n.dark {\n${block(dark)}\n}\n`
}

function legacyTailwind(light: Record<string, string>, dark: Record<string, string>): string {
  const bridge = Object.keys(light)
    .map((k) => `  --color-${k}: var(--${k});`)
    .join('\n')
  return `${legacyCss(light, dark)}\n@theme inline {\n${bridge}\n}\n`
}

function legacyTokensJson(light: Record<string, string>, dark: Record<string, string>): string {
  const block = (tokens: Record<string, string>) =>
    Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, { $type: 'color', $value: v }]))
  return JSON.stringify({ light: block(light), dark: block(dark) }, null, 2)
}

/** Drop every line this change added, in either the CSS or the Tailwind bridge. */
const withoutEffectLines = (css: string) =>
  css
    .split('\n')
    .filter((line) => !/^\s*--(elevation-[123]|scrim|shadow-elevation-[123]|color-scrim):/.test(line))
    .join('\n')

const varLine = (css: string, name: string) =>
  css.split('\n').find((line) => line.trim().startsWith(`--${name}:`))?.trim()

/** The `:root` half of an emitCss output, so light and dark can be told apart. */
const rootBlock = (css: string) => css.slice(0, css.indexOf('.dark {'))
const darkBlock = (css: string) => css.slice(css.indexOf('.dark {'))

describe('emitCss elevation', () => {
  it('joins layers in box-shadow order with px lengths and composed alpha', () => {
    const css = rootBlock(emitCss(fixture().light, fixture().dark))
    expect(varLine(css, 'elevation-2')).toBe(
      '--elevation-2: 0px 1px 2px 0px rgb(43 39 36 / 0.05), 0px 8px 20px -6px rgb(43 39 36 / 0.09);',
    )
  })

  it('emits a COMPOSABLE empty shadow, not the `none` keyword', () => {
    const css = rootBlock(emitCss(fixture().light, fixture().dark))
    // Not `none`: utility frameworks build box-shadow from a list of layer
    // vars, and a list containing `none` is invalid CSS — the browser throws
    // away the whole declaration, ring included. `0 0 #0000` paints nothing
    // standalone and survives composition. See cssShadow in elevation.ts.
    expect(varLine(css, 'elevation-1')).toBe('--elevation-1: 0 0 #0000;')
    expect(css).not.toMatch(/--elevation-\d:\s*none;/)
    // `box-shadow: ;` is a parse error that would take the whole block with it.
    expect(css).not.toMatch(/--elevation-\d:\s*;/)
  })

  it('prefixes inset layers and keeps them inside the layer list', () => {
    const css = darkBlock(emitCss(fixture().light, fixture().dark))
    expect(varLine(css, 'elevation-1')).toBe(
      '--elevation-1: inset 0px 1px 2px 0px rgb(255 255 255 / 0.045);',
    )
    expect(varLine(css, 'elevation-2')).toBe(
      '--elevation-2: 0px 1px 2px 0px rgb(5 5 5 / 0.28), 0px 8px 20px -6px rgb(5 5 5 / 0.4), inset 0px 1px 0px 0px rgb(255 255 255 / 0.063);',
    )
  })

  it('composes the scrim colour and alpha, per mode', () => {
    const css = emitCss(fixture().light, fixture().dark)
    expect(varLine(rootBlock(css), 'scrim')).toBe('--scrim: rgb(43 39 36 / 0.32);')
    expect(varLine(darkBlock(css), 'scrim')).toBe('--scrim: rgb(5 5 5 / 0.58);')
  })

  it('gives each mode its own effects rather than repeating light in .dark', () => {
    const css = emitCss(fixture().light, fixture().dark)
    expect(varLine(rootBlock(css), 'elevation-3')).not.toBe(varLine(darkBlock(css), 'elevation-3'))
  })
})

describe('themeTailwind namespaces', () => {
  it('bridges shadows to --shadow-*, not --color-*', () => {
    const out = themeTailwind(fixture())
    // The whole point: `shadow-elevation-2` must be a real utility, and
    // `bg-elevation-2` must not exist.
    expect(out).toContain('  --shadow-elevation-2: var(--elevation-2);')
    expect(out).not.toContain('--color-elevation-')
    for (const n of [1, 2, 3]) {
      expect(out).toContain(`  --shadow-elevation-${n}: var(--elevation-${n});`)
    }
  })

  it('bridges the scrim as a colour, since that is what it is', () => {
    expect(themeTailwind(fixture())).toContain('  --color-scrim: var(--scrim);')
    expect(themeTailwind(fixture())).not.toContain('--shadow-scrim:')
  })

  it('declares every bridged var in the CSS above it', () => {
    const out = themeTailwind(fixture())
    const bridged = [...out.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1])
    expect(bridged.length).toBeGreaterThan(0)
    for (const name of bridged) {
      expect(out, `${name} is bridged but never declared`).toContain(`  --${name}:`)
    }
  })
})

describe('themeTokensJson types', () => {
  const parsed = () => JSON.parse(themeTokensJson(fixture())) as Record<string, Record<string, unknown>>

  it('keeps $type: color on colour tokens', () => {
    expect(parsed().light.background).toEqual({ $type: 'color', $value: '#ffffff' })
  })

  it('gives elevation $type: shadow with an array of layer composites', () => {
    expect(parsed().light['elevation-2']).toEqual({
      $type: 'shadow',
      $value: [
        { offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px', color: '#2b27240d' },
        { offsetX: '0px', offsetY: '8px', blur: '20px', spread: '-6px', color: '#2b272417' },
      ],
    })
  })

  it('emits an array even for a single layer, and an empty array for an empty level', () => {
    const light = parsed().light
    expect(light['elevation-1']).toEqual({ $type: 'shadow', $value: [] })
    // Single-layer levels stay arrays so consumers never branch on the shape.
    expect((parsed().dark['elevation-3'] as { $value: unknown[] }).$value).toHaveLength(1)
  })

  it('marks inset layers with the spec key, and omits it elsewhere', () => {
    const dark = parsed().dark['elevation-1'] as { $value: Array<Record<string, unknown>> }
    expect(dark.$value[0]).toEqual({
      offsetX: '0px',
      offsetY: '1px',
      blur: '2px',
      spread: '0px',
      color: '#ffffff0b',
      inset: true,
    })
    // Absent, not `false`, on ordinary layers — the spec defaults it.
    expect(parsed().light['elevation-2']).not.toHaveProperty('$value.0.inset')
  })

  it('emits the scrim as a colour with alpha baked into 8-digit hex', () => {
    expect(parsed().light.scrim).toEqual({ $type: 'color', $value: '#2b272452' })
    expect(parsed().dark.scrim).toEqual({ $type: 'color', $value: '#05050594' })
  })

  it('records non-default settings in $meta and nothing else', () => {
    expect(themeTokensJson({ ...fixture(), seed: 7, separation: 'lifted' })).toContain(
      '"$meta": {\n    "seed": 7,\n    "separation": "lifted"',
    )
    expect(themeTokensJson({ ...fixture(), seed: 0, separation: 'layered' })).not.toContain('$meta')
  })
})

describe('colour portion is unchanged by elevation', () => {
  it('emits pre-elevation CSS exactly when a mode has no effects', () => {
    expect(emitCss({ tokens: LIGHT_TOKENS }, { tokens: DARK_TOKENS })).toBe(
      legacyCss(LIGHT_TOKENS, DARK_TOKENS),
    )
  })

  it('adds only new lines to the CSS', () => {
    expect(withoutEffectLines(emitCss(fixture().light, fixture().dark))).toBe(
      legacyCss(LIGHT_TOKENS, DARK_TOKENS),
    )
  })

  it('adds only new lines to the Tailwind export', () => {
    expect(withoutEffectLines(themeTailwind(fixture()))).toBe(
      legacyTailwind(LIGHT_TOKENS, DARK_TOKENS),
    )
  })

  it('adds only new keys to the tokens JSON, in place', () => {
    const json = JSON.parse(themeTokensJson(fixture())) as Record<string, Record<string, unknown>>
    for (const modeName of ['light', 'dark']) {
      for (const key of ['elevation-1', 'elevation-2', 'elevation-3', 'scrim']) {
        delete json[modeName][key]
      }
    }
    // Deep-equal would miss it: this also pins that the colour tokens still
    // come first, so no existing line moves.
    expect(JSON.stringify(json, null, 2)).toBe(legacyTokensJson(LIGHT_TOKENS, DARK_TOKENS))
  })
})

describe('against a generated theme', () => {
  const theme = (separation?: 'flat' | 'layered' | 'lifted') =>
    generateTheme({
      candidates: candidatesFromList(['#3b82f6', '#f97316']),
      ...(separation ? { separation } : {}),
    })

  it('carries elevation and a scrim into the emitted CSS', () => {
    const css = theme().css
    for (const n of [1, 2, 3]) expect(varLine(rootBlock(css), `elevation-${n}`)).toBeTruthy()
    expect(varLine(rootBlock(css), 'scrim')).toMatch(/^--scrim: rgb\(\d+ \d+ \d+ \/ [\d.]+\);$/)
  })

  it('gives flat no level-1 shadow, and dark an inset highlight', () => {
    expect(varLine(rootBlock(theme('flat').css), 'elevation-1')).toBe('--elevation-1: 0 0 #0000;')
    expect(varLine(darkBlock(theme().css), 'elevation-1')).toContain('inset ')
  })

  it('exports a real generated theme through all three formats without dropping effects', () => {
    const result = theme('lifted')
    expect(themeTailwind(result)).toContain('--shadow-elevation-3: var(--elevation-3);')
    const json = JSON.parse(themeTokensJson(result)) as Record<string, Record<string, unknown>>
    expect((json.light['elevation-3'] as { $type: string }).$type).toBe('shadow')
    expect((json.dark.scrim as { $type: string }).$type).toBe('color')
  })
})
