import type { Role, ThemeMode, ThemeResult } from './types'
import { compliantSolid, popBudget } from './tokens'

/**
 * An adapter speaks one design space's language: it maps the engine's ramps
 * into that space's named colors, running use-specific solves where the
 * generic ramps can't know the requirement. `tokens.ts` (shadcn app UI) is
 * the original adapter; these are its siblings. Adapters never invent colors
 * without ramp ancestry and never judge the palette — those guarantees were
 * bought upstream (assignment, repair, ramp solvers).
 */
export interface ThemeAdapter<V extends string = string> {
  id: string
  resolve(
    mode: ThemeMode,
    seedHues: Record<'primary' | 'accent' | 'neutral', number>,
    fidelity: number,
  ): Record<V, string>
}

/** Vocabulary of the brand-board space: paper and ink, not surface and card. */
export type BrandColorName =
  | 'paper'
  | 'ink'
  | 'inkSubtle'
  | 'line'
  | 'wash'
  | 'brand'
  | 'brandInk'
  | 'accent'
  | 'accentInk'

export const brandAdapter: ThemeAdapter<BrandColorName> = {
  id: 'brand',
  resolve(mode, seedHues, fidelity) {
    const N = mode.ramps.neutral
    const P = mode.ramps.primary
    const A = mode.ramps.accent
    // Solids must carry type and stand off the paper — same solves and same
    // fidelity-budgeted pop as app UI, different vocabulary.
    const brand = compliantSolid(P[8], seedHues.primary, N[0], popBudget(fidelity))
    const accent = compliantSolid(A[8], seedHues.accent, N[0], popBudget(fidelity))
    return {
      paper: N[0],
      ink: N[11],
      inkSubtle: N[10],
      line: N[4],
      wash: P[1],
      brand: brand.bg,
      brandInk: brand.fg,
      accent: accent.bg,
      accentInk: accent.fg,
    }
  },
}

/**
 * Which role ramp each brand color descends from — the adapter's half of the
 * ancestry contract (same shape tokens.ts keeps for the app space). Kept next
 * to `resolve` so a new name can't ship without declaring its ancestor.
 */
const BRAND_ANCESTRY: Record<BrandColorName, Role> = {
  paper: 'neutral',
  ink: 'neutral',
  inkSubtle: 'neutral',
  line: 'neutral',
  wash: 'primary',
  brand: 'primary',
  brandInk: 'primary',
  accent: 'accent',
  accentInk: 'accent',
}

/** Brand-name → candidate-index ancestry (null = the role was synthesized). */
export function brandAncestry(result: ThemeResult): Record<BrandColorName, number | null> {
  const byRole = new Map(result.assignments.map((a) => [a.role, a.candidateIndex]))
  const out = {} as Record<BrandColorName, number | null>
  for (const [name, role] of Object.entries(BRAND_ANCESTRY) as Array<[BrandColorName, Role]>) {
    out[name] = byRole.get(role) ?? null
  }
  return out
}

export function resolveBrand(result: ThemeResult, modeName: 'light' | 'dark'): Record<BrandColorName, string> {
  const hues = { primary: 0, accent: 0, neutral: 0 }
  for (const a of result.assignments) {
    if (a.role in hues) hues[a.role as keyof typeof hues] = a.seed.h
  }
  return brandAdapter.resolve(result[modeName], hues, result.fidelity)
}
