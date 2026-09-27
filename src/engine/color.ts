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
  const rgb = oklchToRgb24(color.l, color.c, color.h)
  if (rgb >= 0) return '#' + rgb.toString(16).padStart(6, '0')
  const inGamut = clampChroma({ mode: 'oklch', l: color.l, c: color.c, h: color.h }, 'oklch')
  return formatHex(inGamut)
}

/** Gamut-map and return the mapped OKLCH coordinates. */
export function toGamut(color: Oklch): Oklch {
  const c = fitChroma(color.l, color.c, color.h)
  if (c >= 0) return { l: color.l, c, h: color.h }
  const g = clampChroma({ mode: 'oklch', l: color.l, c: color.c, h: color.h }, 'oklch')
  return { l: g.l ?? 0, c: g.c ?? 0, h: g.h ?? color.h }
}

// ---------------------------------------------------------------------------
// Numeric fast path for hot loops.
//
// `toHex` is two culori calls, and each one allocates a colour object per
// conversion step; `clampChroma` alone re-converts the colour ~13 times while
// it bisects chroma. That is fine once, and ruinous inside the contrast solver,
// which asks it ~1,400 times per theme. The function below reaches the SAME
// bytes with scalars only: it is culori 4's oklch → oklab → lrgb → rgb chain
// and clampChroma bisection transcribed with the same constants in the same
// operation order, so the floating point — and therefore every rounded
// channel — is bit-identical. Keep it that way: a one-ulp drift can flip a
// bisection step in the solver, and the golden test will say so.

let outR = 0
let outG = 0
let outB = 0

const toGamma = (c: number) => {
  const abs = Math.abs(c)
  return abs > 0.0031308 ? (Math.sign(c) || 1) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055) : c * 12.92
}

/** OKLCH → gamma sRGB floats in outR/outG/outB (culori's convertOklabToRgb). */
function oklchToRgb(l: number, c: number, h: number) {
  const a = c ? c * Math.cos((h / 180) * Math.PI) : 0
  const b = c ? c * Math.sin((h / 180) * Math.PI) : 0
  const L = Math.pow(l + 0.3963377773761749 * a + 0.2158037573099136 * b, 3)
  const M = Math.pow(l - 0.1055613458156586 * a - 0.0638541728258133 * b, 3)
  const S = Math.pow(l - 0.0894841775298119 * a - 1.2914855480194092 * b, 3)
  outR = toGamma(4.0767416360759574 * L - 3.3077115392580616 * M + 0.2309699031821044 * S)
  outG = toGamma(-1.2684379732850317 * L + 2.6097573492876887 * M - 0.3413193760026573 * S)
  outB = toGamma(-0.0041960761386756 * L - 0.7034186179359362 * M + 1.7076146940746117 * S)
}

const displayable = () => outR >= 0 && outR <= 1 && outG >= 0 && outG <= 1 && outB >= 0 && outB <= 1

/** culori's chroma bisection resolution for oklch: range [0, 0.4] over 2^13. */
const CHROMA_RESOLUTION = 0.4 / Math.pow(2, 13)

const channel = (v: number) => Math.round(Math.max(0, Math.min(1, v || 0)) * 255)

/**
 * clampChroma(…, 'oklch') for one colour: the chroma it settles on, with
 * outR/outG/outB left holding that colour's gamma RGB. -1 where culori would
 * give up on chroma and clip RGB instead (lightness outside 0..1) — callers
 * take the slow path there, so the two can never disagree.
 */
function fitChroma(l: number, c: number, h: number): number {
  oklchToRgb(l, c, h)
  if (displayable()) return c
  oklchToRgb(l, 0, h)
  if (!displayable()) return -1
  let start = 0
  let end = c
  let lastGood = 0
  let mid = 0
  while (end - start > CHROMA_RESOLUTION) {
    mid = start + (end - start) * 0.5
    oklchToRgb(l, mid, h)
    if (displayable()) {
      lastGood = mid
      start = mid
    } else end = mid
  }
  oklchToRgb(l, mid, h)
  if (displayable()) return mid
  oklchToRgb(l, lastGood, h)
  return lastGood
}

/** `toHex(color)` as a packed 0xRRGGBB integer, or -1 (see fitChroma). */
export function oklchToRgb24(l: number, c: number, h: number): number {
  if (fitChroma(l, c, h) < 0) return -1
  return (channel(outR) << 16) | (channel(outG) << 8) | channel(outB)
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
