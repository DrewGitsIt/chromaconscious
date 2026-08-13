import { QuantizerCelebi, argbFromRgb, hexFromArgb } from '@material/material-color-utilities'
import type { ColorCandidate } from './types'
import { deltaEok, hueDistance, parseColor } from './color'

/**
 * Image pixels -> ordered color candidates.
 *
 * A photo is evidence about hues and their prominence, not a set of finished
 * palette colors — so extraction curates, it doesn't just count:
 * - clusters are scored by palette-worthiness (population, colorfulness, AND a
 *   usable lightness band, so shadow blobs stop winning on area alone)
 * - chromatic picks are deduplicated by hue: one object photographed under
 *   shading yields a lightness ramp of a single hue, which should claim one
 *   palette slot, not four (the ramps regenerate shades anyway)
 * - unlike Material's Score (which only hunts accent seeds), dominant
 *   neutrals are kept — they seed the background and neutral ramp.
 */

const smoothstep = (x: number, lo: number, hi: number) => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/** Two chromatic picks closer than this in hue are the same palette slot. */
const HUE_DEDUPE_DEG = 25

export function extractCandidates(pixels: Uint8ClampedArray, maxCandidates = 8): ColorCandidate[] {
  const argb: number[] = []
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    argb.push(argbFromRgb(pixels[i], pixels[i + 1], pixels[i + 2]))
  }
  if (argb.length === 0) return []

  const quantized = QuantizerCelebi.quantize(argb, 64)
  let total = 0
  quantized.forEach((pop) => (total += pop))

  interface Entry {
    color: NonNullable<ReturnType<typeof parseColor>>
    share: number
    hex: string
  }
  const entries: Entry[] = []
  const sorted = [...quantized.entries()].sort((a, b) => b[1] - a[1])
  for (const [argbColor, pop] of sorted) {
    const hex = hexFromArgb(argbColor)
    const color = parseColor(hex)
    if (!color) continue
    const share = pop / total
    // Merge perceptually-close colors into the more popular one.
    const existing = entries.find((e) => deltaEok(e.color, color) < 0.07)
    if (existing) {
      existing.share += share
      continue
    }
    entries.push({ color, share, hex })
  }

  // Best chromatic color per hue neighborhood, plus dominant neutrals.
  const ranked = entries.filter((e) => e.color.c >= 0.05).sort((a, b) => score(b) - score(a))
  const chromatic: Entry[] = []
  for (const e of ranked) {
    // ranked by score, so the first entry in each hue neighborhood wins
    if (chromatic.some((k) => hueDistance(k.color.h, e.color.h) < HUE_DEDUPE_DEG)) continue
    chromatic.push(e)
    if (chromatic.length >= maxCandidates - 2) break
  }
  const neutrals = entries
    .filter((e) => e.color.c < 0.05)
    .sort((a, b) => b.share - a.share)
    .slice(0, 3)

  // Population survives as the initial list order (most-populous first) and a
  // display-only share; role casting reads only color properties + position.
  return [...chromatic, ...neutrals]
    .slice(0, maxCandidates)
    .sort((a, b) => b.share - a.share)
    .map((e) => ({
      color: e.color,
      share: e.share,
      source: 'image' as const,
      raw: e.hex,
    }))
}

function score(e: { share: number; color: { l: number; c: number } }): number {
  const { l, c } = e.color
  // Palette-worthiness: prominent, colorful, and in a usable lightness band —
  // a photo's shadow mass shouldn't outrank its actual subject colors.
  const lightnessFit = smoothstep(l, 0.22, 0.42) * (1 - smoothstep(l, 0.85, 0.97))
  return e.share * 0.45 + (Math.min(c, 0.25) / 0.25) * 0.3 + lightnessFit * 0.25
}
