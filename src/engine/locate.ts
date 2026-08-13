import { lerp, parseColor, toGamut, toHex } from './color'

/**
 * Locate mode: "where is the color I chose?" answered by token substitution.
 * Given a resolved token set and its candidate ancestry, publish an alternate
 * set where every token NOT descended from the hovered candidate is muted —
 * near-achromatic, lightness eased slightly toward the mode's background so
 * the layout stays readable while only the candidate's descendants keep their
 * color. Pure transform over already-resolved tokens; the engine's solvers
 * never run here.
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

/**
 * The substituted token set for hovering `candidateIndex`: descendants stay
 * verbatim, everything else goes muted. `ancestorOf` is the adapter's
 * name → candidate map (tokenAncestry / brandAncestry); `surface` is the
 * mode's background (app `background`, brand `paper`).
 */
export function locateTokens<V extends string>(
  tokens: Record<V, string>,
  ancestorOf: Record<string, number | null>,
  candidateIndex: number,
  surface: string,
): Record<V, string> {
  const out = {} as Record<V, string>
  for (const [name, hex] of Object.entries(tokens) as Array<[V, string]>) {
    out[name] = ancestorOf[name] === candidateIndex ? hex : locateMuted(hex, surface)
  }
  return out
}
