import { APCAcontrast, sRGBtoY } from 'apca-w3'
import { wcagContrast } from 'culori'
import type { Oklch } from './types'
import { clamp, toHex } from './color'

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
  const satisfied = (l: number) => {
    const hex = toHex({ l, c: chromaAt(l), h })
    return apcaLc(hex, bgHex) >= targetLc && wcagContrast(hex, bgHex) >= targetWcag
  }
  // If even the extreme can't reach the target, return the extreme.
  if (!satisfied(lo)) {
    return { l: lo, c: chromaAt(lo), h }
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (satisfied(mid)) lo = mid
    else hi = mid
  }
  const l = clamp(lo, 0, 1)
  return { l, c: chromaAt(l), h }
}

/** Choose near-white or near-black foreground for a solid bg, by APCA. */
export function bestForeground(bgHex: string, tintHue: number): string {
  const light = toHex({ l: 0.985, c: 0.005, h: tintHue })
  const dark = toHex({ l: 0.16, c: 0.01, h: tintHue })
  return apcaLc(light, bgHex) >= apcaLc(dark, bgHex) ? light : dark
}
