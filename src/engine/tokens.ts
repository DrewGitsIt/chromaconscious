import type {
  ContrastReport,
  Oklch,
  Ramp,
  Role,
  Separation,
  ThemeMode,
  ThemeResult,
  TokenAncestor,
} from './types'
import { hueDistance, parseColor, toGamut, toHex } from './color'
import { apcaLc, bestForeground, solveLightness, wcagRatio } from './contrast'
import type { ContrastTargets } from './contrastLevel'
import { contrastTargets } from './contrastLevel'
import { buildEffects } from './elevation'
import { chartAdjust } from './roles'
import { makeRamp } from './ramp'

/** Chart series slots, matching the `chart-1`..`chart-5` tokens. */
const SERIES_SLOTS = 5

/**
 * Solid fills (buttons) must carry readable text (4.5:1) — always — and,
 * when a surface is given, should "pop" against it (3:1, WCAG 1.4.11
 * non-text contrast) so a near-white primary can't dissolve into a
 * near-white page. Pop-driven drift is budgeted (`maxSurfaceDrift`, in
 * lightness): at verbatim fidelity the budget is zero, the color stays,
 * and the failing pair is disclosed in the report — same philosophy as the
 * repair pass. A bright yellow can never reach 3:1 on white; forcing it
 * would turn the user's yellow into olive.
 *
 * Above standard (`minimums.textLc` given) the label must also clear an APCA
 * floor, and fleeing the current ink is no longer always safe. Between the
 * two inks lies a band of lightness where neither reaches the target — about
 * L .45–.73 at 7:1, L .37–.83 at 10:1, only a sliver at 4.5:1 — and fleeing
 * the ink from inside it can drag the fill straight into the page (a
 * dark-mode primary at L .68 under white text sinks toward the near-black
 * page). See `crossesBand` for when a raised fill crosses to the other ink
 * instead. At standard the historical rule runs unchanged.
 */
export function compliantSolid(
  hex: string,
  tintHue: number,
  surfaceHex?: string,
  maxSurfaceDrift = Infinity,
  /**
   * Text on the fill (WCAG, plus an APCA floor above standard) and the fill on
   * the surface (WCAG). Raised by the contrast level.
   */
  minimums: { text: number; pop: number; textLc?: number } = { text: 4.5, pop: 3 },
): { bg: string; fg: string; textOk: boolean } {
  const STEP = 0.012
  const raised = minimums.textLc != null
  /** Raised by `crossesBand`: a crossing must not leave the label weaker than it was. */
  let floor = { wcag: minimums.text, lc: minimums.textLc ?? 0 }
  const textOn = (h: string, fg = bestForeground(h, tintHue)) =>
    wcagRatio(fg, h) >= floor.wcag && (!raised || apcaLc(fg, h) >= floor.lc)
  const popRatio = (h: string) => (surfaceHex == null ? Infinity : wcagRatio(h, surfaceHex))
  const nudge = (h: string, dl: number) => {
    const c = parseColor(h)!
    return toHex(toGamut({ l: c.l + dl, c: c.c, h: c.h }))
  }
  /**
   * Whether a raised fill leaves the band on the FAR side (the other ink)
   * rather than fleeing its current ink.
   *
   * Only to keep standing it already has: a fill that clears the standard 3:1
   * off its surface, which fleeing its ink would cost and crossing would not.
   * A fill with no standing to keep (taste held it, or it never had any) flees
   * its ink as at standard, and its pop miss is reported — crossing to GAIN
   * pop would spend drift taste never granted.
   *
   * Judged at the TOP of the scale (the widest band), so every raised level
   * exits the same way and only the distance grows with the slider; judged
   * per level, the side flips as the band widens and a button jumps from dark
   * to light mid-drag. And a crossing walks on until the label is at least as
   * strong as it was, so raising the level never weakens it.
   */
  const crossesBand = (from: string, flee: number): boolean => {
    if (surfaceHex == null || popRatio(from) < 3) return false
    const top = fillMinimums(contrastTargets(1), 1)
    const keep = Math.min(popRatio(from), top.pop)
    const exit = (dir: number) => {
      let h = from
      for (let k = 1; k <= 60; k++) {
        const next = nudge(h, dir * STEP)
        if (next === h) return null // pinned at the end of the lightness range
        h = next
        const ink = bestForeground(h, tintHue)
        if (wcagRatio(ink, h) >= top.text && apcaLc(ink, h) >= top.textLc!) return h
      }
      return null
    }
    const fled = exit(flee)
    if (fled && popRatio(fled) >= keep) return false
    const crossed = exit(-flee)
    return crossed != null && popRatio(crossed) >= keep
  }

  let bg = hex
  let popDrift = 0
  let textDir: number | null = null
  for (let i = 0; i < 60; i++) {
    const fg = bestForeground(bg, tintHue)
    const fgOk = textOn(bg, fg)
    const popOk = surfaceHex == null || popRatio(bg) >= minimums.pop
    const wantPop = !popOk && popDrift + STEP <= maxSurfaceDrift
    if (fgOk && !wantPop) return { bg, fg, textOk: true }
    const c = parseColor(bg)!
    let away: boolean
    if (wantPop) {
      away = parseColor(surfaceHex!)!.l > c.l // move away from the surface first
      popDrift += STEP
    } else if (raised) {
      // Decided once, so the walk can't dither inside the band.
      if (textDir == null) {
        const flee = parseColor(fg)!.l > 0.5 ? -1 : 1
        textDir = flee
        if (crossesBand(bg, flee)) {
          textDir = -flee
          floor = { wcag: Math.max(floor.wcag, wcagRatio(fg, bg)), lc: Math.max(floor.lc, apcaLc(fg, bg)) }
        }
      }
      away = textDir < 0
    } else {
      away = parseColor(fg)!.l > 0.5 // then away from the text color
    }
    bg = toHex(toGamut({ l: c.l + (away ? -STEP : STEP), c: c.c, h: c.h }))
  }
  const fg = bestForeground(bg, tintHue)
  floor = { wcag: minimums.text, lc: minimums.textLc ?? 0 }
  return { bg, fg, textOk: textOn(bg, fg) }
}

/** compliantSolid's targets at a contrast level; the APCA floor joins only above standard. */
export const fillMinimums = (t: ContrastTargets, contrast: number) => ({
  text: t.text.wcag,
  pop: t.pop,
  ...(contrast > 0 ? { textLc: t.text.lc } : {}),
})

type Seeds = Record<Role, Oklch>

/** Lightness the pop constraint may spend at a given fidelity (0 at verbatim). */
export const popBudget = (fidelity: number) => 0.45 * (1 - fidelity)

export function buildMode(
  seeds: Seeds,
  chartSeeds: Oklch[],
  mode: 'light' | 'dark',
  fidelity = 0.5,
  /** Mono lock: the base seed everything invented inherits hue + chroma from. */
  monoSeed: Oklch | null = null,
  /** Surface separation: moves the neutral ladder and the shadow scale together. */
  separation: Separation = 'layered',
  /**
   * Which chart seeds the user locked, parallel to `chartSeeds`. Only the mono
   * ladder consults it — a lock is the one thing that keeps a series colour out
   * of the ladder, the same rule the six seats obey.
   */
  chartLocked: boolean[] = [],
  /** Contrast level 0..1 (contrastLevel.ts): raises every target below. 0 = historical. */
  contrast = 0,
): ThemeMode {
  const targets = contrastTargets(contrast)
  const ramps = {} as Record<Role, Ramp>
  /** Tokens whose solve ran out of room: a miss on these is a ceiling, not a choice. */
  const unreached = new Set<string>()
  const unreachedSteps = {} as Record<Role, number[]>
  for (const role of Object.keys(seeds) as Role[]) {
    const ramp = makeRamp(seeds[role], mode, {
      isNeutral: role === 'neutral',
      separation,
      contrast,
    })
    ramps[role] = ramp.hex
    unreachedSteps[role] = ramp.unreached
  }

  const N = ramps.neutral
  const P = ramps.primary
  const A = ramps.accent
  const D = ramps.danger
  const S = ramps.success
  const W = ramps.warning

  // Chart slot 1 is the accent's to claim: the pop color leads the data
  // series, with the actual leftover candidates following. The claim is
  // waived when a leftover already covers the accent's hue neighborhood
  // (don't double it), when the accent is near-gray (a series lead must read
  // as colored), and under the mono lock (its sequential lightness ladder
  // owns every slot).
  const accentClaimsChart1 =
    monoSeed == null &&
    seeds.accent.c >= 0.03 &&
    !chartSeeds.some((s) => hueDistance(s.h, seeds.accent.h) < 20)
  const seriesSeeds = accentClaimsChart1
    ? [chartAdjust(seeds.accent, fidelity), ...chartSeeds].slice(0, 5)
    : chartSeeds

  const base = seeds.primary
  /** The mono ladder: one hue, five rungs, like a print dataviz ramp. */
  const monoRung = (k: number): Oklch => ({
    l: mode === 'dark' ? 0.35 + 0.115 * k : 0.78 - 0.115 * k,
    c: Math.min(monoSeed!.c, 0.12),
    h: monoSeed!.h,
  })
  /** No mono lock: invented fills separate by spinning the hue wheel. */
  const spun = (k: number): Oklch => ({
    l: mode === 'dark' ? 0.72 : 0.6,
    c: Math.max(base.c, 0.11),
    h: (base.h + 45 * (k + 1)) % 360,
  })

  const charts: string[] = []
  for (let k = 0; k < SERIES_SLOTS; k++) {
    const seed = seriesSeeds[k]
    // Under the mono lock the ladder owns EVERY slot, not just the ones no
    // colour of yours reached. It used to own only the leftovers, so a chart
    // colour you supplied kept its own hue and sat outside the very palette
    // the lock exists to unify — the one thing on screen still off-hue.
    // A locked colour is the sole exception, exactly as for the six seats.
    if (monoSeed && !(seed && chartLocked[k])) {
      charts.push(toHex(toGamut(monoRung(k))))
    } else if (seed) {
      charts.push(
        toHex(
          mode === 'dark'
            ? toGamut({ l: Math.max(seed.l, 0.65), c: seed.c * 0.85, h: seed.h })
            : seed,
        ),
      )
    } else {
      charts.push(toHex(toGamut(spun(k))))
    }
  }

  // Multi-surface solve: run the solver once per surface and keep the most
  // extreme lightness. Contrast only grows as lightness moves away from a
  // surface, so the binding surface's answer satisfies every other one.
  const solveDir = mode === 'dark' ? ('lighter' as const) : ('darker' as const)
  const solveOnSurfaces = (
    token: string,
    surfaces: string[],
    targetLc: number,
    targetWcag: number,
    h: number,
    chromaAt: (l: number) => number,
  ) => {
    const solves = surfaces.map((s) => solveLightness(targetLc, targetWcag, s, h, chromaAt, solveDir))
    if (solves.some((x) => !x.reached)) unreached.add(token)
    return solves
      .map((x) => x.color)
      .reduce((a, b) => ((mode === 'dark' ? a.l >= b.l : a.l <= b.l) ? a : b))
  }

  // The accent's solid working tone — focus ring, selected-tab indicator,
  // outlined-button border: the ramp's solid range nudged in lightness until
  // it stands 3:1 (WCAG 1.4.11 non-text) off BOTH the page and the card.
  // The chroma floor makes it read as "the pop color" — but under the mono
  // lock it would tint a deliberately achromatic theme, so it drops.
  const accentStrong = toHex(
    solveOnSurfaces(
      'accent-strong',
      [N[0], N[1]],
      targets.mark.lc,
      targets.mark.wcag,
      seeds.accent.h,
      () => Math.min(monoSeed ? seeds.accent.c : Math.max(seeds.accent.c, 0.08), 0.16),
    ),
  )

  // Link text: the accent as running-text color. Same APCA + WCAG double gate
  // as ramp text steps (Lc 62 / 4.5:1 at standard), solved against every
  // surface links actually sit on — page, card, and the success banner's wash.
  const link = toHex(
    solveOnSurfaces('link', [N[0], N[1], S[1]], targets.text.lc, targets.text.wcag, seeds.accent.h, () =>
      Math.min(seeds.accent.c * (mode === 'dark' ? 0.45 : 0.6), mode === 'dark' ? 0.08 : 0.11),
    ),
  )

  // Focus ring: the accent's job — selection and focus are not the brand's
  // voice. Shares the solved accent solid so it clears 3:1 on page and card.
  const ring = accentStrong
  if (unreached.has('accent-strong')) unreached.add('ring')

  const fill = fillMinimums(targets, contrast)
  const primarySolid = compliantSolid(P[8], seeds.primary.h, N[0], popBudget(fidelity), fill)
  const dangerSolid = compliantSolid(D[8], seeds.danger.h, undefined, Infinity, fill)
  const successSolid = compliantSolid(S[8], seeds.success.h, undefined, Infinity, fill)
  const warningSolid = compliantSolid(W[8], seeds.warning.h, undefined, Infinity, fill)

  // Ramp steps whose solve hit the wall, by the tokens that carry them.
  const RAMP_SOLVED: Array<[token: string, role: Role, step: number]> = [
    ['foreground', 'neutral', 11],
    ['card-foreground', 'neutral', 11],
    ['secondary-foreground', 'neutral', 11],
    ['muted-foreground', 'neutral', 10],
    ['accent-foreground', 'accent', 11],
    ['destructive-subtle-foreground', 'danger', 10],
    ['success-subtle-foreground', 'success', 10],
    ['warning-subtle-foreground', 'warning', 10],
    ['border', 'neutral', 5],
    ['input', 'neutral', 6],
  ]
  for (const [token, role, step] of RAMP_SOLVED) if (unreachedSteps[role].includes(step)) unreached.add(token)
  const fills: Array<[token: string, solid: { textOk: boolean }]> = [
    ['primary-foreground', primarySolid],
    ['destructive-foreground', dangerSolid],
    ['success-foreground', successSolid],
    ['warning-foreground', warningSolid],
  ]
  for (const [token, solid] of fills) if (!solid.textOk) unreached.add(token)

  const tokens: Record<string, string> = {
    background: N[0],
    foreground: N[11],
    card: N[1],
    'card-foreground': N[11],
    popover: N[1],
    'popover-foreground': N[11],
    primary: primarySolid.bg,
    'primary-foreground': primarySolid.fg,
    secondary: N[2],
    'secondary-foreground': N[11],
    muted: N[2],
    'muted-foreground': N[10],
    accent: A[2],
    'accent-foreground': A[11],
    // Non-shadcn additions (additive, like the status subtles below): the
    // accent ramp's deep, solved steps for the jobs a pop color holds in
    // real app UI. `link` carries text, `accent-strong` carries non-text
    // marks (tab indicator, outlined-button border).
    'accent-strong': accentStrong,
    link,
    destructive: dangerSolid.bg,
    'destructive-foreground': dangerSolid.fg,
    'destructive-subtle': D[1],
    'destructive-subtle-foreground': D[10],
    success: successSolid.bg,
    'success-foreground': successSolid.fg,
    'success-subtle': S[1],
    'success-subtle-foreground': S[10],
    warning: warningSolid.bg,
    'warning-foreground': warningSolid.fg,
    'warning-subtle': W[1],
    'warning-subtle-foreground': W[10],
    border: N[5],
    input: N[6],
    ring,
    'chart-1': charts[0],
    'chart-2': charts[1],
    'chart-3': charts[2],
    'chart-4': charts[3],
    'chart-5': charts[4],
    sidebar: N[1],
    'sidebar-foreground': N[11],
    'sidebar-primary': primarySolid.bg,
    'sidebar-primary-foreground': primarySolid.fg,
    'sidebar-accent': A[2],
    'sidebar-accent-foreground': A[11],
    'sidebar-border': N[5],
    'sidebar-ring': ring,
  }

  // Ancestry: which ramp each token descends from, recorded where the
  // decision is made (chart-1's accent claim lives a few lines up). The map
  // must classify EVERY token — coverage is unit-enforced.
  const fromRole = (role: Role): TokenAncestor => ({ kind: 'role', role })
  // chart-(k+1)'s ancestor: the accent when it claimed slot 1, then the
  // actual chart candidates (shifted one down by the claim), null once the
  // slots run into invented hue-spin / mono-ladder fills.
  const chartAncestor = (k: number): TokenAncestor | null => {
    if (accentClaimsChart1) {
      return k === 0
        ? fromRole('accent')
        : k - 1 < chartSeeds.length
          ? { kind: 'chart', slot: k - 1 }
          : null
    }
    return k < chartSeeds.length ? { kind: 'chart', slot: k } : null
  }
  const ancestry: Record<string, TokenAncestor | null> = {
    background: fromRole('neutral'),
    foreground: fromRole('neutral'),
    card: fromRole('neutral'),
    'card-foreground': fromRole('neutral'),
    popover: fromRole('neutral'),
    'popover-foreground': fromRole('neutral'),
    primary: fromRole('primary'),
    'primary-foreground': fromRole('primary'),
    secondary: fromRole('neutral'),
    'secondary-foreground': fromRole('neutral'),
    muted: fromRole('neutral'),
    'muted-foreground': fromRole('neutral'),
    accent: fromRole('accent'),
    'accent-foreground': fromRole('accent'),
    'accent-strong': fromRole('accent'),
    link: fromRole('accent'),
    destructive: fromRole('danger'),
    'destructive-foreground': fromRole('danger'),
    'destructive-subtle': fromRole('danger'),
    'destructive-subtle-foreground': fromRole('danger'),
    success: fromRole('success'),
    'success-foreground': fromRole('success'),
    'success-subtle': fromRole('success'),
    'success-subtle-foreground': fromRole('success'),
    warning: fromRole('warning'),
    'warning-foreground': fromRole('warning'),
    'warning-subtle': fromRole('warning'),
    'warning-subtle-foreground': fromRole('warning'),
    border: fromRole('neutral'),
    input: fromRole('neutral'),
    ring: fromRole('accent'),
    'chart-1': chartAncestor(0),
    'chart-2': chartAncestor(1),
    'chart-3': chartAncestor(2),
    'chart-4': chartAncestor(3),
    'chart-5': chartAncestor(4),
    sidebar: fromRole('neutral'),
    'sidebar-foreground': fromRole('neutral'),
    'sidebar-primary': fromRole('primary'),
    'sidebar-primary-foreground': fromRole('primary'),
    'sidebar-accent': fromRole('accent'),
    'sidebar-accent-foreground': fromRole('accent'),
    'sidebar-border': fromRole('neutral'),
    'sidebar-ring': fromRole('accent'),
  }

  const report = buildReport(tokens, targets, contrast > 0, unreached)
  // Shadows come from the neutral seed, so they track the palette without the
  // user supplying anything. Held outside `tokens` — see ThemeEffects.
  const effects = buildEffects(seeds.neutral, mode, separation)
  return { tokens, ramps, report, ancestry, effects }
}

/**
 * Resolve a mode's token ancestry down to candidate indexes: token name →
 * the candidate the color descends from, null when the chain passes through
 * a synthesized seed or an invented chart fill. Chart tokens resolve through
 * `chartCandidateIndexes`; an accent-claimed chart-1 resolves to the accent's
 * candidate. Every token in `tokens` has an entry.
 */
export function tokenAncestry(
  result: ThemeResult,
  modeName: 'light' | 'dark',
): Record<string, number | null> {
  const byRole = new Map(result.assignments.map((a) => [a.role, a.candidateIndex]))
  const out: Record<string, number | null> = {}
  for (const [token, anc] of Object.entries(result[modeName].ancestry)) {
    out[token] =
      anc == null
        ? null
        : anc.kind === 'role'
          ? (byRole.get(anc.role) ?? null)
          : (result.chartCandidateIndexes[anc.slot] ?? null)
  }
  return out
}

/** Which target a checked pair answers to; the number comes from the contrast level. */
type Gate = 'text' | 'mark' | 'pop' | 'border' | 'input'

const TEXT_PAIRS: Array<[fg: string, bg: string, gate: Gate]> = [
  ['foreground', 'background', 'text'],
  ['card-foreground', 'card', 'text'],
  ['muted-foreground', 'muted', 'text'],
  ['secondary-foreground', 'secondary', 'text'],
  ['primary-foreground', 'primary', 'text'],
  ['accent-foreground', 'accent', 'text'],
  ['destructive-foreground', 'destructive', 'text'],
  ['destructive-subtle-foreground', 'destructive-subtle', 'text'],
  ['success-foreground', 'success', 'text'],
  ['success-subtle-foreground', 'success-subtle', 'text'],
  ['warning-foreground', 'warning', 'text'],
  ['warning-subtle-foreground', 'warning-subtle', 'text'],
  // Links (and the accent-outlined button's text) on every surface they sit on.
  ['link', 'background', 'text'],
  ['link', 'card', 'text'],
  ['link', 'success-subtle', 'text'],
  // Ring visibility: distinguishable on the page AND on cards (WCAG 1.4.11).
  ['ring', 'background', 'mark'],
  ['ring', 'card', 'mark'],
  // The accent's non-text marks: tab indicator, outlined-button border.
  ['accent-strong', 'background', 'mark'],
  ['accent-strong', 'card', 'mark'],
  // Non-text "pop": the primary fill must stand off the page (WCAG 1.4.11).
  ['primary', 'background', 'pop'],
]

/**
 * Hairline floors exist only above standard — at standard the separation
 * ladder alone decides and nothing is promised — so these rows are checked
 * only there, and an existing theme's report keeps its exact rows.
 */
const HAIRLINE_PAIRS: Array<[fg: string, bg: string, gate: Gate]> = [
  ['border', 'background', 'border'],
  ['border', 'card', 'border'],
  ['input', 'background', 'input'],
  ['input', 'card', 'input'],
]

const GATE: Record<Gate, (t: ContrastTargets) => { wcag: number; lc?: number }> = {
  text: (t) => t.text,
  mark: (t) => t.mark,
  pop: (t) => ({ wcag: t.pop }),
  border: (t) => ({ wcag: t.border }),
  input: (t) => ({ wcag: t.input }),
}

/** Round DOWN, so a quoted requirement never exceeds the target the solver met. */
const floorTo = (v: number, places: number) => Math.floor(v * 10 ** places + 1e-9) / 10 ** places

/**
 * Every checked pair, against the contrast level's gates. WCAG is the gate at
 * every level; above standard the level's APCA floor (`requiredLc`) joins it
 * on text and marks, because that is what the level promises. At standard a
 * row is exactly what it has always been.
 *
 * A failing row whose foreground was solved as far as it goes without
 * reaching its target is marked `unreachable`: the miss is a ceiling — that
 * hue has no more contrast to give on that surface — not taste holding a
 * colour back, and not a bug.
 */
export function buildReport(
  tokens: Record<string, string>,
  targets: ContrastTargets,
  raised: boolean,
  unreached: Set<string>,
): ContrastReport[] {
  const pairs = raised ? [...TEXT_PAIRS, ...HAIRLINE_PAIRS] : TEXT_PAIRS
  return pairs.map(([fgName, bgName, gate]) => {
    const fg = tokens[fgName]
    const bg = tokens[bgName]
    const wcag = wcagRatio(fg, bg)
    const apca = apcaLc(fg, bg)
    const target = GATE[gate](targets)
    const required = floorTo(target.wcag, 2)
    const requiredLc = raised && target.lc != null ? floorTo(target.lc, 1) : undefined
    const pass = wcag >= required && (requiredLc == null || apca >= requiredLc)
    return {
      token: fgName,
      background: bgName,
      fg,
      bg,
      wcag,
      apca,
      requiredWcag: required,
      ...(requiredLc != null ? { requiredLc } : {}),
      pass,
      ...(!pass && unreached.has(fgName) ? { unreachable: true as const } : {}),
    }
  })
}
