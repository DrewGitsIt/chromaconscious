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
  /** Pixel-population fraction 0..1, set only by image extraction. Display-only. */
  share?: number
  /** User explicitly assigned this candidate to a role (or to the chart series). */
  pin?: Role | 'chart'
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
  /**
   * Riff seed for the repertoire the engine invents from. 0 (the default) is
   * the canonical cookbook; other integers pick deterministic alternatives.
   * Only synthesized role seeds vary — user-cast colors never move with it.
   */
  seed?: number
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

/** Where a candidate ended up after casting. */
export type CastingOutcome = Role | 'chart' | 'unused'

/** A chroma/lightness gate a candidate fails, with actual vs needed values. */
export type GateId = 'accent-chroma' | 'status-chroma' | 'accent-lightness' | 'chart-chroma'

export interface GateMiss {
  gate: GateId
  actual: number
  needed: number
}

/**
 * Per-candidate casting explanation: pure data (numbers + enum reasons) the
 * copy layer (explain.ts) turns into human strings. One entry per candidate,
 * parallel to the candidates array.
 */
export interface CastingExplanation {
  outcome: CastingOutcome
  /** How the outcome was decided. */
  via: 'pin' | 'mono-base' | 'score' | 'leftover'
  /** Winning score for the seat (via === 'score'): total and the order-prior share. */
  score?: { total: number; orderPrior: number }
  /** Best other contender for the seat this candidate holds, and how far behind. */
  rival?: { index: number; margin: number }
  /** Seats this candidate had a real claim on that another candidate holds. */
  lost: Array<{ role: Role; winnerIndex: number; margin: number }>
  /** Gates this candidate fails (why accent/status/chart were out of reach). */
  gates: GateMiss[]
  /** Leftover with chartable chroma, but all five chart seats were taken. */
  chartFull?: boolean
  /** Hue distance to the primary seed's hue (degrees), when one exists. */
  hueDistToPrimary?: number
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

/**
 * Where a token's color came from, one level up: a role's ramp or a chart
 * slot (an index into the theme's chart candidates). Null = the mode invented
 * the color with no single ancestor (hue-spun or mono-ladder chart fills).
 */
export type TokenAncestor = { kind: 'role'; role: Role } | { kind: 'chart'; slot: number }

export interface ThemeMode {
  /** shadcn-style token name -> hex color */
  tokens: Record<string, string>
  ramps: Record<Role, Ramp>
  report: ContrastReport[]
  /** Per-token ancestry, parallel to `tokens` — every token is classified. */
  ancestry: Record<string, TokenAncestor | null>
}

/** Input to the palette judge: the six role seeds, plus context it scores in. */
export interface JudgeInput {
  seeds: Record<Role, Oklch>
  /** Roles the engine synthesized — primary deference is judged on these. */
  synthesized: Role[]
  /** Chart seeds, when the input had leftovers; harmony is relational. */
  chartSeeds?: Oklch[]
}

/** Palette-judge verdict: weighted score in [0,1] plus each feature, also 0..1. */
export interface JudgeVerdict {
  score: number
  features: Record<string, number>
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
  /** Per-candidate casting explanations, parallel to the input candidates. */
  casting: CastingExplanation[]
  /** Pairwise constraints left unsatisfied (usually at high fidelity). */
  repairs: RepairResidual[]
  /** The fidelity this theme was generated at (adapters reuse it for their own solves). */
  fidelity: number
  /** Candidate index of the mono-lock base, or null when the lock is off. */
  monoBase: number | null
  /** The riff seed this theme was generated with (0 = canonical cookbook). */
  seed: number
  /**
   * Judge verdict for the seed set the theme was built from (pre-repair).
   * Always present: at seed 0 it scores the canonical cookbook itself — no
   * sampling happened; at seed N>0 it is the argmax of the K sampled variants.
   */
  judge: JudgeVerdict
  css: string
}
