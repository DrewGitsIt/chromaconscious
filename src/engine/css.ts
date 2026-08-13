import type { ThemeResult } from './types'

export function emitCss(light: Record<string, string>, dark: Record<string, string>): string {
  const block = (tokens: Record<string, string>, indent = '  ') =>
    Object.entries(tokens)
      .map(([k, v]) => `${indent}--${k}: ${v};`)
      .join('\n')
  return `:root {\n${block(light)}\n}\n\n.dark {\n${block(dark)}\n}\n`
}

/** CSS variables plus the Tailwind v4 `@theme inline` bridge to color utilities. */
export function themeTailwind(result: Pick<ThemeResult, 'light' | 'dark'>): string {
  const bridge = Object.keys(result.light.tokens)
    .map((k) => `  --color-${k}: var(--${k});`)
    .join('\n')
  return `${emitCss(result.light.tokens, result.dark.tokens)}\n@theme inline {\n${bridge}\n}\n`
}

/** DTCG-style design tokens: each token as { $type, $value } per mode. */
export function themeTokensJson(result: Pick<ThemeResult, 'light' | 'dark'> & { seed?: number }): string {
  const block = (tokens: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(tokens).map(([k, v]) => [k, { $type: 'color', $value: v }]),
    )
  return JSON.stringify(
    {
      // seed 0 is canonical — riffed exports carry their seed so a theme is
      // reproducible; the canonical export stays byte-identical to before.
      ...(result.seed ? { $meta: { seed: result.seed } } : {}),
      light: block(result.light.tokens),
      dark: block(result.dark.tokens),
    },
    null,
    2,
  )
}
