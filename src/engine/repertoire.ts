import type { Oklch, Role } from './types'
import { draw } from './random'

/**
 * The seeded repertoire: what the engine may invent instead of the one fixed
 * cookbook line. Every distribution lists its canonical option first and
 * short-circuits to it at seed 0 — seed 0 IS the cookbook, bit-identical.
 * Only synthesized roles ever come through here; user-cast seeds never riff.
 * All windows sit inside each role's contrast-safe region — the ramps and
 * solvers downstream do the rest.
 */

interface Weighted<T> {
  v: T
  w: number
}

/** Weighted pick; index 0 is canonical and wins outright at seed 0. */
function choice<T>(seed: number, role: string, decision: string, options: Array<Weighted<T>>): T {
  if (seed === 0) return options[0].v
  const total = options.reduce((s, o) => s + o.w, 0)
  let r = draw(seed, role, decision) * total
  for (const o of options) {
    r -= o.w
    if (r < 0) return o.v
  }
  return options[options.length - 1].v
}

/** Uniform draw in [lo, hi]; exactly `canonical` at seed 0. */
function range(
  seed: number,
  role: string,
  decision: string,
  canonical: number,
  lo: number,
  hi: number,
): number {
  if (seed === 0) return canonical
  return lo + draw(seed, role, decision) * (hi - lo)
}

/** Accent: a hue relationship to primary, plus l/c within the accent window. */
export function accentRepertoire(primary: Oklch, seed: number): Oklch {
  const rel = choice(seed, 'accent', 'hue-relation', [
    { v: 60, w: 4 }, // canonical
    { v: -60, w: 1 },
    { v: 180, w: 1 }, // complement
    { v: 150, w: 0.75 }, // split-complement
    { v: -150, w: 0.75 },
    { v: 120, w: 0.75 }, // triad
    { v: -120, w: 0.75 },
    { v: 30, w: 0.5 }, // analogous
    { v: -30, w: 0.5 },
  ])
  return {
    l: range(seed, 'accent', 'lightness', 0.6, 0.55, 0.68),
    c: range(seed, 'accent', 'chroma', Math.max(primary.c * 0.8, 0.1), 0.08, 0.16),
    // rel >= 0 keeps the seed-0 arithmetic byte-for-byte canonical
    h: rel >= 0 ? (primary.h + rel) % 360 : (primary.h + 360 + rel) % 360,
  }
}

/** Neutral temperature: tinted toward primary, counter-tinted, or pure gray. */
export function neutralRepertoire(primary: Oklch, seed: number): Oklch {
  const temperature = choice(seed, 'neutral', 'temperature', [
    { v: 'toward', w: 4 }, // canonical
    { v: 'counter', w: 1.5 },
    { v: 'gray', w: 1 },
  ] as Array<Weighted<'toward' | 'counter' | 'gray'>>)
  const tint = range(seed, 'neutral', 'tint', 0.25, 0.1, 0.4)
  return {
    l: 0.5,
    c: temperature === 'gray' ? 0 : Math.min(0.03, primary.c * tint),
    h: temperature === 'counter' ? (primary.h + 180) % 360 : primary.h,
  }
}

// Each status roams its credible hue window and a subtle↔saturated chroma
// band around the canonical anchor. Lightness is the role's fixed register.
const STATUS_REPERTOIRE = {
  danger: { l: 0.55, hue: [27, 22, 32], chroma: [0.19, 0.15, 0.22] },
  success: { l: 0.55, hue: [150, 140, 165], chroma: [0.11, 0.09, 0.15] },
  warning: { l: 0.75, hue: [80, 70, 90], chroma: [0.16, 0.11, 0.19] },
} as const

/** Status anchor before harmonization (the caller rotates it toward primary). */
export function statusRepertoire(role: 'danger' | 'success' | 'warning', seed: number): Oklch {
  const spec = STATUS_REPERTOIRE[role]
  const [c0, cLo, cHi] = spec.chroma
  const [h0, hLo, hHi] = spec.hue
  return {
    l: spec.l,
    c: range(seed, role, 'chroma', c0, cLo, cHi),
    h: range(seed, role, 'hue', h0, hLo, hHi),
  }
}

/**
 * Mono variations: lightness placement and chroma scaling only — hue is the
 * base's by definition, and every cap matches the cookbook's.
 */
export function monoRepertoire(role: Role, base: Oklch, seed: number): Oklch {
  const h = base.h
  switch (role) {
    case 'primary':
      // never riffed: a mono theme always has a base to seed primary from
      return { l: 0.55, c: Math.min(base.c, 0.23), h }
    case 'neutral':
      return {
        l: 0.5,
        c: Math.min(0.03, base.c * range(seed, 'neutral', 'mono-chroma', 0.25, 0.1, 0.25)),
        h,
      }
    case 'accent':
      return {
        l: range(seed, 'accent', 'mono-lightness', 0.62, 0.56, 0.68),
        c: Math.min(base.c * range(seed, 'accent', 'mono-chroma', 0.6, 0.45, 0.75), 0.12),
        h,
      }
    case 'danger':
      return {
        l: range(seed, 'danger', 'mono-lightness', 0.38, 0.32, 0.44),
        c: Math.min(base.c * range(seed, 'danger', 'mono-chroma', 1, 0.8, 1), 0.16),
        h,
      }
    case 'success':
      return {
        l: range(seed, 'success', 'mono-lightness', 0.55, 0.5, 0.62),
        c: Math.min(base.c * range(seed, 'success', 'mono-chroma', 0.8, 0.6, 0.9), 0.14),
        h,
      }
    default: // warning
      return {
        l: range(seed, 'warning', 'mono-lightness', 0.75, 0.7, 0.8),
        c: Math.min(base.c * range(seed, 'warning', 'mono-chroma', 0.8, 0.6, 0.9), 0.14),
        h,
      }
  }
}
