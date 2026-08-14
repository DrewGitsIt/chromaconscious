import type { TokenAncestor } from './types'
import { lerp, parseColor, toGamut, toHex } from './color'

/**
 * Locate mode: "where is this color used?" answered by token substitution.
 * Given a resolved token set and its ancestry, publish an alternate set where
 * every token NOT descended from the located seat is muted — near-achromatic,
 * lightness eased slightly toward the mode's background so the layout stays
 * readable while only that seat's descendants keep their color. Pure transform
 * over already-resolved tokens; the engine's solvers never run here.
 *
 * Keyed on the ANCESTOR (a role, or a chart slot), not on a candidate index.
 * That distinction is the whole feature: a derived seat has no candidate
 * behind it, so a candidate-keyed lookup could never locate one — yet a
 * derived neutral still drives roughly a third of the token set, which is
 * exactly the thing worth seeing. Ancestry is role-keyed at the source
 * (`ThemeMode.ancestry`); resolving it down to candidates is the lossy step.
 */

// Muted tokens keep this much chroma (a whisper of hue, visually gray).
const MUTED_CHROMA = 0.005
// How far muted lightness eases toward the background — enough to recede,
// not enough to erase text or borders.
const MUTED_BG_MIX = 0.15

/** One color's muted stand-in against the mode's background surface. */
export function locateMuted(hex: string, surface: string): string {
  const c = parseColor(hex)
  if (!c) return hex
  const bg = parseColor(surface)
  return toHex(
    toGamut({
      l: bg ? lerp(c.l, bg.l, MUTED_BG_MIX) : c.l,
      c: Math.min(c.c, MUTED_CHROMA),
      h: c.h,
    }),
  )
}

/** Same role, or the same chart slot. Null ancestry never matches anything. */
export function sameAncestor(a: TokenAncestor | null, b: TokenAncestor): boolean {
  if (a == null || a.kind !== b.kind) return false
  return a.kind === 'role' && b.kind === 'role'
    ? a.role === b.role
    : a.kind === 'chart' && b.kind === 'chart' && a.slot === b.slot
}

/**
 * The substituted token set for locating `target`: its descendants stay
 * verbatim, everything else goes muted. `ancestorOf` is the adapter's
 * name → ancestor map (`ThemeMode.ancestry` for the app space,
 * `brandAncestors()` for the brand board); `surface` is the mode's background
 * (app `background`, brand `paper`).
 */
export function locateTokens<V extends string>(
  tokens: Record<V, string>,
  ancestorOf: Record<string, TokenAncestor | null>,
  target: TokenAncestor,
  surface: string,
): Record<V, string> {
  const out = {} as Record<V, string>
  for (const [name, hex] of Object.entries(tokens) as Array<[V, string]>) {
    out[name] = sameAncestor(ancestorOf[name], target) ? hex : locateMuted(hex, surface)
  }
  return out
}
