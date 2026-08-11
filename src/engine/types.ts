/** Semantic roles an input color can be assigned to. */
export type Role = 'primary' | 'accent' | 'neutral' | 'danger' | 'success' | 'warning'

export const ROLES: Role[] = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning']

export interface Oklch {
  l: number // 0..1
  c: number // 0..~0.37 in sRGB
  h: number // degrees, 0..360
}

export interface ColorCandidate {
  color: Oklch
  /** Relative prominence 0..1. From image population, or positional decay for manual lists. */
  weight: number
  /** User explicitly assigned this candidate to a role. */
  pin?: Role
  source: 'manual' | 'image'
  /** Original input string (hex etc.) for display/reporting. */
  raw: string
}

export interface GenerateOptions {
  candidates: ColorCandidate[]
  /**
   * 0 = adjust colors freely to fit their roles; 1 = preserve inputs verbatim
   * where possible (may sacrifice contrast targets, reported in `report`).
   */
  fidelity?: number
  /**
   * Mono lock: index of the candidate whose hue rules the theme. The base is
   * crowned primary and donates hue + chroma to every role the engine has to
   * invent; under the lock the engine varies lightness only. Other candidates
   * are exempt — colors the user hands in keep their own hue.
   */
  monoBase?: number
}

/** Radix-style 12-step ramp. Index 0 = step 1 (app bg) ... index 11 = step 12 (high-contrast text). */
export type Ramp = string[]

export interface RoleAssignment {
  role: Role
  /** Index into candidates, or null if synthesized. */
  candidateIndex: number | null
  /** The seed actually used for the ramp (post-fidelity adjustment). */
  seed: Oklch
  /** deltaE (OK) between input color and used seed; 0 for synthesized roles. */
  deltaE: number
}

export interface ContrastReport {
  token: string
  background: string
  fg: string
  bg: string
  wcag: number
  apca: number
  requiredWcag: number
  pass: boolean
}

export interface ThemeMode {
  /** shadcn-style token name -> hex color */
  tokens: Record<string, string>
  ramps: Record<Role, Ramp>
  report: ContrastReport[]
}

/** A pairwise-distance constraint the repair pass couldn't satisfy within its ΔE budgets. */
export interface RepairResidual {
  a: string
  b: string
  deltaE: number
  required: number
  label: string
}

export interface ThemeResult {
  light: ThemeMode
  dark: ThemeMode
  assignments: RoleAssignment[]
  /** Candidates that didn't get a role but were used as chart colors. */
  chartCandidateIndexes: number[]
  /** Candidates that were not used at all. */
  unusedCandidateIndexes: number[]
  /** Pairwise constraints left unsatisfied (usually at high fidelity). */
  repairs: RepairResidual[]
  /** The fidelity this theme was generated at (adapters reuse it for their own solves). */
  fidelity: number
  /** Candidate index of the mono-lock base, or null when the lock is off. */
  monoBase: number | null
  css: string
}
