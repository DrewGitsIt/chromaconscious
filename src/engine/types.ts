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
  /**
   * User locked this color: riff may never move it. This is the ONLY thing
   * that freezes a color — not provenance, not fidelity. A color you supplied
   * and did not lock walks like any other, and hop 0 is always your input
   * verbatim, one `back` away.
   *
   * Deliberately separate from `pin`. A pin answers "which seat does this sit
   * in", a lock answers "may the riff move it" — dragging a color to a seat is
   * a statement about placement, not a vow never to explore from it.
   */
  locked?: boolean
  /**
   * The exact colour the lock froze, when that is not `color` itself — a seat
   * three hops along is locked where it stands, not where it started.
   *
   * Kept BESIDE `color` rather than written over it. Overwriting was tried and
   * silently destroyed the user's input: lock then unlock, and the hex they
   * typed was gone for good. Because `color` survives, unlocking needs no
   * inverse — the walk simply resumes and lands back on the same seed it was
   * frozen at.
   */
  lockedColor?: Oklch
  /**
   * User parked this color: it is skipped by every seat and lands in
   * `unusedCandidateIndexes`. Distinct from merely losing — unpinning alone
   * can't free a seat, because the engine would re-cast the same color into
   * the same seat on the next pass.
   */
  benched?: boolean
  /**
   * Set when the color was promoted from a seed the engine invented ("keep as
   * your color"), so the board can say "kept" rather than "yours".
   *
   * Provenance only. It used to imply immobility, back when riff moved derived
   * seats and nothing else; now `locked` carries that alone, and a kept color
   * with the lock cleared walks exactly like one you typed.
   */
  origin?: 'invented'
  source: 'manual' | 'image'
  /** Original input string (hex etc.) for display/reporting. */
  raw: string
}

/**
 * How hard the surface stack works to separate itself.
 *
 * `layered` is the zero point: it reproduces the ladder the engine has always
 * emitted, byte for byte, so an existing theme is unchanged by this control
 * existing. `flat` pays for separation with hairlines and almost no shadow;
 * `lifted` pays with shadow and lets the surfaces themselves converge.
 *
 * Deliberately lightness-only. A `tint` sibling was designed and dropped: the
 * neutral's chroma is already fidelity-controlled upstream (see ramp.ts), and
 * two dials over one number is what made `weight` confusing enough to remove.
 */
export type Separation = 'flat' | 'layered' | 'lifted'

export const SEPARATIONS: Separation[] = ['flat', 'layered', 'lifted']

/**
 * One shadow layer, kept STRUCTURED rather than pre-serialized. CSS wants
 * `0 8px 20px -6px rgb(…)`; DTCG wants `{offsetY, blur, spread, color}` under
 * `$type: 'shadow'`. Those two cannot be satisfied by one stored string, so
 * the engine stores neither and each exporter renders what its format needs.
 */
export interface ShadowLayer {
  offsetX: number
  offsetY: number
  blur: number
  spread: number
  /** Hex, tinted by the neutral's hue — a pure black shadow reads dirty. */
  color: string
  /** 0..1, applied to `color` at serialization time. */
  alpha: number
  /**
   * Inset highlights are how DARK mode elevates: near-black has no luminance
   * room below the page for a shadow to occupy, so a lit top edge does the
   * work a drop shadow does in light mode.
   */
  inset?: boolean
}

/**
 * The non-colour output of a mode. Held apart from `tokens` on purpose: every
 * value in `tokens` is an opaque colour, and `locate.ts`, `buildReport` and
 * the Tailwind bridge all rely on that. Putting a shadow — or a scrim, which
 * carries alpha — in there would make each of those quietly wrong instead of
 * loudly wrong.
 */
export interface ThemeEffects {
  /** Low to high. Level 1 may be empty when `flat` pays with borders instead. */
  elevation: { 1: ShadowLayer[]; 2: ShadowLayer[]; 3: ShadowLayer[] }
  /** The wash behind a modal. Carries alpha, so it is not a token. */
  scrim: { color: string; alpha: number }
}

export interface GenerateOptions {
  candidates: ColorCandidate[]
  /**
   * 0 = adjust colors freely to fit their roles; 1 = preserve inputs verbatim
   * where possible (may sacrifice contrast targets, reported in `report`).
   */
  fidelity?: number
  /**
   * Mono lock: index of the candidate whose hue rules the theme. Every seat
   * takes that hue at its own lightness — including seats held by colors the
   * user supplied. Two exemptions, and only two: a `locked` candidate, and the
   * base itself, which keeps its own lightness and chroma.
   *
   * The base is NOT crowned primary; casting is untouched. It donates its hue
   * from wherever scoring already put it, so engaging the lock never moves a
   * colour between seats.
   */
  monoBase?: number
  /**
   * How many riff hops to walk. 0 (the default) is the canonical cookbook and
   * is bit-identical to a no-seed call; each increment walks the palette one
   * bounded, judged step further through OKLCH (walk.ts).
   *
   * Every seed moves except the ones the user locked — including colors they
   * supplied, at any fidelity. Cost is linear in the hop count, so this is a
   * hop *count*, not an opaque seed you can jump around in.
   */
  seed?: number
  /** Surface separation. Defaults to `layered`, which is the historical output. */
  separation?: Separation
  /**
   * Contrast level, 0..1: 0 standard (the historical targets, the default),
   * 0.5 medium, 1 high, linear between. Raises every solved target — text,
   * fills, focus ring, hairlines — and leaves taste's budgets alone. See
   * contrastLevel.ts.
   */
  contrast?: number
}

/** Radix-style 12-step ramp. Index 0 = step 1 (app bg) ... index 11 = step 12 (high-contrast text). */
export type Ramp = string[]

export interface RoleAssignment {
  role: Role
  /** Index into candidates, or null if synthesized. */
  candidateIndex: number | null
  /** The seed actually used for the ramp (post-fidelity adjustment). */
  seed: Oklch
  /**
   * deltaE (OK) between the color the user handed in and the seed actually
   * used; 0 for synthesized roles, which have no input to differ from. Grows
   * as a riff carries an unlocked seat away from its source.
   */
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
  /**
   * The APCA Lc the contrast level promises this pair, present only above
   * standard (where it joins `requiredWcag` in deciding `pass`).
   */
  requiredLc?: number
  pass: boolean
  /**
   * Set only on a failing row whose foreground was solved as far as its hue
   * can go on this background and still fell short — the target is out of
   * reach, typically at a raised contrast level. Absent on a miss that taste
   * chose (a colour held near what you typed).
   */
  unreachable?: true
}

/**
 * Where a token's color came from, one level up: a role's ramp or a chart
 * slot (an index into the theme's chart candidates). Null = the mode invented
 * the color with no single ancestor (hue-spun or mono-ladder chart fills).
 */
export type TokenAncestor = { kind: 'role'; role: Role } | { kind: 'chart'; slot: number }

export interface ThemeMode {
  /** shadcn-style token name -> hex color. Opaque colours only — see ThemeEffects. */
  tokens: Record<string, string>
  ramps: Record<Role, Ramp>
  report: ContrastReport[]
  /** Per-token ancestry, parallel to `tokens` — every token is classified. */
  ancestry: Record<string, TokenAncestor | null>
  /** Shadows and the scrim: derived from the neutral, but not colours. */
  effects: ThemeEffects
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
  /** The surface separation this theme was built at. */
  separation: Separation
  /**
   * The contrast level this theme was built at, present only above standard —
   * absent means 0, so a standard theme's result is byte-identical to before
   * the level existed.
   */
  contrast?: number
  /** How many riff hops this theme stands from the cookbook (0 = the cookbook). */
  seed: number
  /**
   * Judge verdict for the seed set the theme was built from (pre-repair).
   * Always present: at seed 0 it scores the cookbook itself, unwalked; at
   * seed N it scores where N hops of the walk arrived.
   */
  judge: JudgeVerdict
  css: string
}
