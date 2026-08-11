import { clampChroma, converter, formatHex, parse } from 'culori'
import type { Oklch } from './types'

const toOklch = converter('oklch')

export function parseColor(input: string): Oklch | null {
  const parsed = parse(input.trim())
  if (!parsed) return null
  const ok = toOklch(parsed)
  return { l: ok.l ?? 0, c: ok.c ?? 0, h: ok.h ?? 0 }
}

/** Gamut-map to sRGB by reducing chroma only (never RGB clipping), return hex. */
export function toHex(color: Oklch): string {
  const inGamut = clampChroma({ mode: 'oklch', l: color.l, c: color.c, h: color.h }, 'oklch')
  return formatHex(inGamut)
}

/** Gamut-map and return the mapped OKLCH coordinates. */
export function toGamut(color: Oklch): Oklch {
  const g = clampChroma({ mode: 'oklch', l: color.l, c: color.c, h: color.h }, 'oklch')
  return { l: g.l ?? 0, c: g.c ?? 0, h: g.h ?? color.h }
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360)
  return d > 180 ? 360 - d : d
}

/** Approximate deltaE-OK: euclidean distance in OKLab. */
export function deltaEok(a: Oklch, b: Oklch): number {
  const [aa, ab] = labAxes(a)
  const [ba, bb] = labAxes(b)
  return Math.sqrt((a.l - b.l) ** 2 + (aa - ba) ** 2 + (ab - bb) ** 2)
}

function labAxes(c: Oklch): [number, number] {
  const rad = (c.h * Math.PI) / 180
  return [c.c * Math.cos(rad), c.c * Math.sin(rad)]
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Shortest-path hue interpolation. */
export function lerpHue(a: number, b: number, t: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180
  return (a + d * t + 360) % 360
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
