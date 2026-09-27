import type { Oklch, Role } from './types'

/**
 * The cookbook: what the engine invents for a seat no color of yours claimed.
 * One fixed line per role — this is the palette at hop 0, and every riff walks
 * away from here (walk.ts) rather than re-drawing from here.
 *
 * It used to be a *seeded* repertoire: each role held a weighted menu of
 * options and a riff re-drew from it. That made variety cheap but made hops
 * meaningless — consecutive seeds were uncorrelated by construction, so the
 * palette teleported instead of travelling, and the canonical option's weight
 * kept pulling it back to the start. The menus are gone; their windows live on
 * as the walk's envelopes, which bound where a seed may roam rather than
 * deciding where it lands.
 */

/** Accent: the theme's second voice, a sixth of the wheel off primary. */
export function accentRepertoire(primary: Oklch): Oklch {
  return {
    l: 0.6,
    c: Math.max(primary.c * 0.8, 0.1),
    h: (primary.h + 60) % 360,
  }
}

/** Neutral: barely tinted toward primary, so the chrome belongs to the theme. */
export function neutralRepertoire(primary: Oklch): Oklch {
  return {
    l: 0.5,
    c: Math.min(0.03, primary.c * 0.25),
    h: primary.h,
  }
}

// Each status sits on its semantic anchor. The walk may carry one off it; the
// judge prices that drift (statusLegibility), which is why there is no clamp.
const STATUS_ANCHOR = {
  danger: { l: 0.55, c: 0.19, h: 27 },
  success: { l: 0.55, c: 0.11, h: 150 },
  warning: { l: 0.75, c: 0.16, h: 80 },
} as const

/** Status anchor before harmonization (the caller rotates it toward primary). */
export function statusRepertoire(role: 'danger' | 'success' | 'warning'): Oklch {
  return { ...STATUS_ANCHOR[role] }
}

/**
 * Mono variations: lightness placement and chroma scaling only — hue is the
 * base's by definition, and every cap is the cookbook's.
 *
 * The five roles that must stay tellable apart (primary, accent, and the three
 * statuses — see PAIR_MIN in index.ts) are spread across the lightness range
 * on rungs at least ~0.1 apart, because under this lock lightness is the ONLY
 * axis left to separate them on. They used to sit at 0.38 / 0.55 / 0.55 / 0.62
 * / 0.75, with primary and success on the very same rung; that collision was
 * survivable while the lock exempted colours the user supplied, and became a
 * reported clash the moment it stopped. Neutral is exempt — it carries no
 * chroma to be confused by, and sits out the pairwise graph entirely.
 */
export function monoRepertoire(role: Role, base: Oklch): Oklch {
  const h = base.h
  switch (role) {
    case 'primary':
      return { l: 0.5, c: Math.min(base.c, 0.23), h }
    case 'neutral':
      return { l: 0.5, c: Math.min(0.03, base.c * 0.25), h }
    case 'accent':
      return { l: 0.71, c: Math.min(base.c * 0.6, 0.12), h }
    case 'danger':
      return { l: 0.38, c: Math.min(base.c, 0.16), h }
    case 'success':
      return { l: 0.6, c: Math.min(base.c * 0.8, 0.14), h }
    default: // warning
      return { l: 0.82, c: Math.min(base.c * 0.8, 0.14), h }
  }
}
