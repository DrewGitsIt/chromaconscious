import { parseColor, toHex } from '../engine'

/** sRGB channels 0..1 of a token's colour. */
function channels(color: string): [number, number, number] {
  const ok = parseColor(color)
  const hex = ok ? toHex(ok) : '#000000'
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
}
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)

/**
 * The gradient map, as the `tableValues` of each channel: the photo's grey
 * ramp, dark to light, mapped through the stops' colours. The darker end
 * stop always takes the shadows, so a dark theme (where `foreground` is the
 * light one) never prints the photograph as a negative.
 */
export function gradientMap(tokens: Record<string, string>, stops: string[]): [string, string, string] {
  let cols = stops.map((t) => channels(tokens[t] ?? '#000000'))
  if (luminance(cols[0]) > luminance(cols[cols.length - 1])) cols = [...cols].reverse()
  return [0, 1, 2].map((n) => cols.map((c) => Number(c[n].toFixed(4))).join(' ')) as [string, string, string]
}
