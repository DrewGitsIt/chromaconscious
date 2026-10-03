import { converter, formatHex, formatHex8 } from 'culori'
import type { ContrastLevelName } from './contrastLevel'
import { effectVars } from './elevation'
import { ROLES } from './types'
import type { Separation, ShadowLayer, ThemeEffects, ThemeMode, ThemeResult } from './types'

const toRgb = converter('rgb')

/** Low to high. Typed as a tuple so it indexes `ThemeEffects['elevation']`. */
const LEVELS = [1, 2, 3] as const

/**
 * All an exporter needs from a mode. `effects` is optional here even though
 * `ThemeMode` requires it: a mode with no effects exports exactly what this
 * module emitted before elevation existed, which is the additive guarantee
 * stated as a type.
 */
type ExportableMode = Pick<ThemeMode, 'tokens'> & { effects?: ThemeEffects }

const px = (n: number) => `${n}px`

/**
 * The CSS strings come from `elevation.ts`, not from here. The live preview
 * renders through the same helpers, so a second serializer would eventually
 * mean the mockup showing a shadow the export doesn't contain.
 */
function effectLines(effects: ThemeEffects | undefined, indent: string): string[] {
  if (!effects) return []
  return Object.entries(effectVars(effects)).map(([name, value]) => `${indent}${name}: ${value};`)
}

/**
 * Each mode carries its own effects rather than sharing one set: dark elevates
 * with a lit top edge where light drops a shadow, so the two blocks hold
 * genuinely different values, not one value behind a mode switch.
 */
export function emitCss(light: ExportableMode, dark: ExportableMode): string {
  const block = (mode: ExportableMode, indent = '  ') =>
    [
      ...Object.entries(mode.tokens).map(([k, v]) => `${indent}--${k}: ${v};`),
      ...effectLines(mode.effects, indent),
    ].join('\n')
  return `:root {\n${block(light)}\n}\n\n.dark {\n${block(dark)}\n}\n`
}

/** CSS variables plus the Tailwind v4 `@theme inline` bridge to color utilities. */
export function themeTailwind(result: Pick<ThemeResult, 'light' | 'dark'>): string {
  const bridge = Object.keys(result.light.tokens).map((k) => `  --color-${k}: var(--${k});`)
  if (result.light.effects) {
    // `--shadow-*` is Tailwind's own namespace for box-shadows; bridging these
    // through `--color-*` would generate `bg-elevation-2` and no
    // `shadow-elevation-2` at all. The scrim is a colour (with alpha), so it
    // does belong in the colour namespace — `bg-scrim` behind a modal.
    bridge.push(
      ...LEVELS.map((n) => `  --shadow-elevation-${n}: var(--elevation-${n});`),
      '  --color-scrim: var(--scrim);',
    )
  }
  return `${emitCss(result.light, result.dark)}\n@theme inline {\n${bridge.join('\n')}\n}\n`
}

/**
 * One DTCG shadow layer — read off the structured layer, never off the CSS
 * string, which is the reason the engine keeps shadows structured at all.
 *
 * `{color, offsetX, offsetY, blur, spread}` are the spec's five required keys
 * and `inset` is its optional sixth (added in the Third Editors' Draft); the
 * schema sets `additionalProperties: false`, so those six are all we may emit.
 * Notably NOT the Tokens Studio shape (`$type: boxShadow`, `x`/`y`,
 * `type: "innerShadow"`), which is popular but schema-invalid — its importer
 * normalizes to this.
 *
 * Dimensions as `"8px"` strings is a deliberate compatibility call against the
 * current draft, which wants `{value: 8, unit: "px"}`: that draft says of
 * itself "do not attempt to implement this version", its own examples are
 * inconsistent about it, and the shipping consumers (Style Dictionary, the
 * Figma importers) read strings. Style Dictionary accepts both.
 */
function dtcgShadow<C>(layer: ShadowLayer, color: ColorEncoder<C>): Record<string, string | boolean | C> {
  return {
    offsetX: px(layer.offsetX),
    offsetY: px(layer.offsetY),
    blur: px(layer.blur),
    spread: px(layer.spread),
    color: color(layer.color, layer.alpha),
    // Omitted rather than `false` when absent: the spec defaults it to false.
    ...(layer.inset ? { inset: true } : {}),
  }
}

/**
 * The spec allows a single-layer shadow to be a bare object; we always emit an
 * array so consumers never have to branch on the shape — and so an empty level
 * has somewhere to go. `[]` (rather than omitting the token) keeps the token
 * set identical across separations: switching to `flat` must not make a token
 * disappear out from under whoever references it. The spec's `minItems: 1`
 * disagrees, but it offers no way at all to say "this level has no shadow".
 *
 * Layer order is CSS paint order, first on top. The spec does not define array
 * ordering; this matches CSS `box-shadow` and Style Dictionary's emitter, so
 * the array and the `--elevation-*` string above stay the same shadow.
 */
function dtcgElevation<C>(layers: ShadowLayer[], color: ColorEncoder<C>) {
  return { $type: 'shadow', $value: layers.map((l) => dtcgShadow(l, color)) }
}

/**
 * Alpha baked into 8-digit hex. The current draft would have every colour be
 * `{colorSpace, components, alpha}` and rejects hex with alpha outright — but
 * every other colour in this file is a plain hex string (the Second Editors'
 * Draft form), and one token shaped differently from the forty around it is
 * less portable than one token that is uniformly old-spec.
 */
function hex8(color: string, alpha: number): string {
  const rgb: ReturnType<typeof toRgb> | undefined = toRgb(color)
  if (!rgb) return color // an unparseable colour is a producer bug; surface it
  return formatHex8({ ...rgb, alpha })
}

/**
 * How a colour is written: a token's own colour (no alpha) or a colour with
 * alpha (the scrim, a shadow layer). The DTCG file and the Figma files differ
 * only here, so they share one token walk and cannot disagree about which
 * tokens a mode has.
 */
type ColorEncoder<C> = (color: string, alpha?: number) => C

/** The DTCG file's encoding: the token's string as-is, 8-digit hex where there is alpha. */
const dtcgColor: ColorEncoder<string> = (color, alpha) => (alpha == null ? color : hex8(color, alpha))

/** One mode's tokens, flat and in emit order: colours, then elevation, then the scrim. */
function dtcgModeTokens<C>({ tokens, effects }: ExportableMode, color: ColorEncoder<C>) {
  return {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, { $type: 'color', $value: color(v) }])),
    ...(effects
      ? {
          ...Object.fromEntries(
            LEVELS.map((n) => [`elevation-${n}`, dtcgElevation(effects.elevation[n], color)]),
          ),
          scrim: { $type: 'color', $value: color(effects.scrim.color, effects.scrim.alpha) },
        }
      : {}),
  }
}

/** DTCG-style design tokens: each token as { $type, $value } per mode. */
export function themeTokensJson(
  result: Pick<ThemeResult, 'light' | 'dark'> & { seed?: number; separation?: Separation; contrast?: number },
): string {
  const block = (mode: ExportableMode) => dtcgModeTokens(mode, dtcgColor)
  // seed 0, `layered` and standard contrast are the canonical settings — an export made with
  // anything else carries it so the theme is reproducible, and one made with
  // the defaults stays byte-identical to before $meta existed.
  const meta = {
    ...(result.seed ? { seed: result.seed } : {}),
    ...(result.separation && result.separation !== 'layered'
      ? { separation: result.separation }
      : {}),
    ...(result.contrast ? { contrast: result.contrast } : {}),
  }
  return JSON.stringify(
    {
      ...(Object.keys(meta).length ? { $meta: meta } : {}),
      light: block(result.light),
      dark: block(result.dark),
    },
    null,
    2,
  )
}

// ---------------------------------------------------------------------------
// Figma variables: one DTCG file per mode, for Figma's native import.

/**
 * A colour the way Figma's importer reads it. `components` are sRGB-ENCODED
 * channels in 0..1 (the bytes of the hex over 255), not linear light: Figma
 * stores what you would see in its colour picker, so linearizing here would
 * import a mid grey #808080 as roughly #bcbcbc. `hex` is the same colour as a
 * 6-digit fallback; the two are derived from the same three bytes, so they
 * cannot disagree. Alpha is separate and never baked into the hex.
 */
export interface FigmaColor {
  colorSpace: 'srgb'
  components: [number, number, number]
  alpha: number
  hex: string
}

/** Clamped to sRGB and rounded to 8 bits first, so `components` and `hex` are exactly one colour. */
export function figmaColor(color: string, alpha = 1): FigmaColor {
  const rgb: ReturnType<typeof toRgb> | undefined = toRgb(color)
  if (!rgb) throw new Error(`figma export: "${color}" is not a colour`)
  const hex = formatHex(rgb)
  const byte = (i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255
  // Three decimals is what the CSS export writes (cssAlphaColor), and it keeps
  // 0.045 * 1.4 from arriving as 0.06300000000000001.
  return { colorSpace: 'srgb', components: [byte(0), byte(1), byte(2)], alpha: Number(alpha.toFixed(3)), hex }
}

/** standard → `light`, high → `light-high`: standard is the theme, the others are variants of it. */
export const FIGMA_LEVELS = ['standard', 'medium', 'high'] as const satisfies readonly ContrastLevelName[]

export function figmaModeName(mode: 'light' | 'dark', level: ContrastLevelName): string {
  return level === 'standard' ? mode : `${mode}-${level}`
}

export interface FigmaModeFile {
  /** `light`, `dark-high`, … — Figma names the mode after the file. */
  name: string
  filename: string
  json: string
}

/** One contrast level's theme, plus the settings that make it reproducible. */
type FigmaSource = Pick<ThemeResult, 'light' | 'dark'> & { seed?: number; separation?: Separation }

/**
 * A DTCG name may not hold `.`, `{`, `}` or start with `$`, and Figma joins
 * groups with `/`, so a `/` inside a name would collide with a nested path.
 */
const BAD_NAME = /[./{}]|^\$/

/**
 * Every variable a file defines, as Figma will name it (`color/primary`), with
 * its `$type`. Used to hold the files to the import's one hard rule: a token
 * missing from any file — or typed differently in one — is silently dropped.
 */
function figmaPaths(doc: Record<string, unknown>, prefix = '', out = new Map<string, string>()) {
  for (const [key, node] of Object.entries(doc)) {
    if (key.startsWith('$')) continue
    if (BAD_NAME.test(key)) throw new Error(`figma export: "${prefix}${key}" is not a valid token name`)
    const path = prefix + key
    const n = node as Record<string, unknown>
    if ('$type' in n) {
      if (out.has(path)) throw new Error(`figma export: two tokens are named ${path}`)
      out.set(path, String(n.$type))
    } else figmaPaths(n, path + '/', out)
  }
  return out
}

/**
 * One file per mode × contrast level, for Figma's native DTCG variable import
 * (drag the files onto a collection; each file becomes a mode named after it).
 *
 * The colour tokens come from the same walk as `themeTokensJson`, encoded as
 * Figma colour objects instead of strings. Figma has no shadow variable, so the
 * elevation shadows ride in `$extensions.chromaconscious` (which Figma ignores)
 * for a future plugin to turn into effect styles; the scrim is a colour with
 * alpha and imports as an RGBA variable. Ramps are exported step by step
 * (`ramp/primary/9`) as plain values, not aliases: role tokens are often not an
 * exact ramp step (`compliantSolid` shifts fills), so an alias would lie.
 *
 * Throws if any two files disagree on their set of paths or types, since
 * Figma would drop the difference without a word.
 */
export function themeFigmaModes(byLevel: Partial<Record<ContrastLevelName, FigmaSource>>): FigmaModeFile[] {
  const files: FigmaModeFile[] = []
  const sets: string[] = []
  for (const level of FIGMA_LEVELS) {
    const result = byLevel[level]
    if (!result) continue
    for (const mode of ['light', 'dark'] as const) {
      const m = result[mode]
      const { scrim, ...flat } = dtcgModeTokens(m, figmaColor)
      const color: Record<string, unknown> = {}
      const shadows: Record<string, unknown> = {}
      for (const [k, token] of Object.entries(flat) as Array<[string, { $type: string }]>) (token.$type === 'shadow' ? shadows : color)[k] = token
      if (scrim) color.scrim = scrim
      const ramp = Object.fromEntries(
        ROLES.map((role) => [
          role,
          Object.fromEntries(m.ramps[role].map((v, i) => [String(i + 1), { $type: 'color', $value: figmaColor(v) }])),
        ]),
      )
      const doc = {
        color,
        ramp,
        $extensions: {
          chromaconscious: {
            mode,
            contrast: level,
            ...(result.seed ? { seed: result.seed } : {}),
            ...(result.separation && result.separation !== 'layered' ? { separation: result.separation } : {}),
            // Figma variables cannot hold shadows. DTCG shadow tokens, one per
            // elevation level, layer colours in the same object form as above.
            shadows,
          },
        },
      }
      sets.push([...figmaPaths(doc)].map(([p, t]) => `${p}:${t}`).sort().join('\n'))
      const name = figmaModeName(mode, level)
      files.push({ name, filename: `${name}.json`, json: JSON.stringify(doc, null, 2) + '\n' })
    }
  }
  // The import's one hard rule, enforced here rather than discovered in Figma.
  const odd = sets.findIndex((s) => s !== sets[0])
  if (odd > 0) throw new Error(`figma export: ${files[odd].filename} and ${files[0].filename} define different tokens`)
  return files
}
