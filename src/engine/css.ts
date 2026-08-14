import { converter, formatHex8 } from 'culori'
import { effectVars } from './elevation'
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
function dtcgShadow(layer: ShadowLayer): Record<string, string | boolean> {
  return {
    offsetX: px(layer.offsetX),
    offsetY: px(layer.offsetY),
    blur: px(layer.blur),
    spread: px(layer.spread),
    color: hex8(layer.color, layer.alpha),
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
function dtcgElevation(layers: ShadowLayer[]) {
  return { $type: 'shadow', $value: layers.map(dtcgShadow) }
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

/** DTCG-style design tokens: each token as { $type, $value } per mode. */
export function themeTokensJson(
  result: Pick<ThemeResult, 'light' | 'dark'> & { seed?: number; separation?: Separation },
): string {
  const block = ({ tokens, effects }: ExportableMode) => ({
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, { $type: 'color', $value: v }])),
    ...(effects
      ? {
          ...Object.fromEntries(
            LEVELS.map((n) => [`elevation-${n}`, dtcgElevation(effects.elevation[n])]),
          ),
          scrim: { $type: 'color', $value: hex8(effects.scrim.color, effects.scrim.alpha) },
        }
      : {}),
  })
  // seed 0 and `layered` are the canonical settings — an export made with
  // anything else carries it so the theme is reproducible, and one made with
  // the defaults stays byte-identical to before $meta existed.
  const meta = {
    ...(result.seed ? { seed: result.seed } : {}),
    ...(result.separation && result.separation !== 'layered'
      ? { separation: result.separation }
      : {}),
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
