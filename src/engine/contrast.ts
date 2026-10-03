import { APCAcontrast, sRGBtoY } from 'apca-w3'
import { wcagContrast } from 'culori'
import type { Oklch } from './types'
import { clamp, oklchToRgb24, toHex } from './color'

function hexToRgb255(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Absolute APCA Lc between fg text and bg, both hex. */
export function apcaLc(fgHex: string, bgHex: string): number {
  const lc = APCAcontrast(sRGBtoY(hexToRgb255(fgHex)), sRGBtoY(hexToRgb255(bgHex)))
  return Math.abs(typeof lc === 'string' ? parseFloat(lc) : lc)
}

export function wcagRatio(fgHex: string, bgHex: string): number {
  return wcagContrast(fgHex, bgHex)
}

/**
 * Solve for the OKLCH lightness (fixed hue, chroma from `chromaAt(l)`) that
 * hits `targetLc` APCA contrast AND `targetWcag` ratio against `bgHex`.
 * APCA is the design metric, WCAG the compliance gate — Lc targets alone can
 * fall below 4.5:1, so both must hold. `direction` picks whether the result
 * should be darker or lighter than the background.
 */
export function solveLightnessForLc(
  targetLc: number,
  targetWcag: number,
  bgHex: string,
  h: number,
  chromaAt: (l: number) => number,
  direction: 'darker' | 'lighter',
): Oklch {
  return solveLightness(targetLc, targetWcag, bgHex, h, chromaAt, direction).color
}

/**
 * `solveLightnessForLc`, also saying whether the target was REACHED. When it
 * wasn't, the colour is the search's extreme — the most contrast this hue and
 * chroma can have on that background — and the caller should report the miss
 * as a ceiling, not a choice. A raised contrast level makes this common.
 */
export function solveLightness(
  targetLc: number,
  targetWcag: number,
  bgHex: string,
  h: number,
  chromaAt: (l: number) => number,
  direction: 'darker' | 'lighter',
): { color: Oklch; reached: boolean } {
  // Contrast grows monotonically as we move away from the bg lightness, so
  // binary search on L between the bg side and the extreme.
  let lo: number, hi: number
  if (direction === 'darker') {
    lo = 0.03 // extreme (max contrast)
    hi = 0.95
  } else {
    lo = 0.99 // extreme
    hi = 0.1
  }
  // The background is fixed for the whole search: read its two luminances
  // once, not once per step. Each step then works on the candidate's 8-bit
  // channels directly — the hex the theme would ship, never a string.
  const bg = parseInt(bgHex.slice(1), 16)
  const bgApcaY = apcaY(bg)
  const bgWcagY = wcagY(bg)
  const satisfied = (l: number) => {
    const c = chromaAt(l)
    const fg = oklchToRgb24(l, c, h)
    if (fg < 0) {
      const hex = toHex({ l, c, h })
      return apcaLc(hex, bgHex) >= targetLc && wcagContrast(hex, bgHex) >= targetWcag
    }
    if (!(apcaFromY(apcaY(fg), bgApcaY) >= targetLc)) return false
    const fgWcagY = wcagY(fg)
    return (Math.max(fgWcagY, bgWcagY) + 0.05) / (Math.min(fgWcagY, bgWcagY) + 0.05) >= targetWcag
  }
  // If even the extreme can't reach the target, return the extreme.
  if (!satisfied(lo)) {
    return { color: { l: lo, c: chromaAt(lo), h }, reached: false }
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (satisfied(mid)) lo = mid
    else hi = mid
  }
  const l = clamp(lo, 0, 1)
  return { color: { l, c: chromaAt(l), h }, reached: true }
}

// Per-channel lookup tables for the solver: 256 entries replace a Math.pow
// per channel per step. Each entry is the exact expression its library uses
// (apca-w3's simpleExp; culori's rgb → lrgb), and the sums below keep the
// libraries' coefficient order, so the results are bit-identical to apcaLc
// and wcagRatio on the same hex.
const APCA_CHANNEL = Float64Array.from({ length: 256 }, (_, i) => Math.pow(i / 255.0, 2.4))
const WCAG_CHANNEL = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
})
const apcaY = (rgb: number) =>
  0.2126729 * APCA_CHANNEL[(rgb >> 16) & 0xff] +
  0.7151522 * APCA_CHANNEL[(rgb >> 8) & 0xff] +
  0.072175 * APCA_CHANNEL[rgb & 0xff]
const wcagY = (rgb: number) =>
  0.2126 * WCAG_CHANNEL[(rgb >> 16) & 0xff] +
  0.7152 * WCAG_CHANNEL[(rgb >> 8) & 0xff] +
  0.0722 * WCAG_CHANNEL[rgb & 0xff]
const apcaFromY = (fgY: number, bgY: number) => {
  const lc = APCAcontrast(fgY, bgY)
  return Math.abs(typeof lc === 'string' ? parseFloat(lc) : lc)
}

/** Choose near-white or near-black foreground for a solid bg, by APCA. */
export function bestForeground(bgHex: string, tintHue: number): string {
  const light = toHex({ l: 0.985, c: 0.005, h: tintHue })
  const dark = toHex({ l: 0.16, c: 0.01, h: tintHue })
  return apcaLc(light, bgHex) >= apcaLc(dark, bgHex) ? light : dark
}
