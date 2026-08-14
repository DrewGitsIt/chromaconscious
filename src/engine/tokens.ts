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
import { apcaLc, bestForeground, solveLightnessForLc, wcagRatio } from './contrast'
import { buildEffects } from './elevation'
import { chartAdjust } from './roles'
import { makeRamp } from './ramp'

/**
 * Solid fills (buttons) must carry readable text (4.5:1) — always — and,
 * when a surface is given, should "pop" against it (3:1, WCAG 1.4.11
 * non-text contrast) so a near-white primary can't dissolve into a
 * near-white page. Pop-driven drift is budgeted (`maxSurfaceDrift`, in
 * lightness): at verbatim fidelity the budget is zero, the color stays,
 * and the failing pair is disclosed in the report — same philosophy as the
 * repair pass. A bright yellow can never reach 3:1 on white; forcing it
 * would turn the user's yellow into olive.
 */
export function compliantSolid(
  hex: string,
  tintHue: number,
  surfaceHex?: string,
  maxSurfaceDrift = Infinity,
): { bg: string; fg: string } {
  let bg = hex
  let popDrift = 0
  for (let i = 0; i < 60; i++) {
    const fg = bestForeground(bg, tintHue)
    const fgOk = wcagRatio(fg, bg) >= 4.5
    const popOk = surfaceHex == null || wcagRatio(bg, surfaceHex) >= 3
    const wantPop = !popOk && popDrift + 0.012 <= maxSurfaceDrift
    if (fgOk && !wantPop) return { bg, fg }
    const c = parseColor(bg)!
    const away = wantPop
      ? parseColor(surfaceHex!)!.l > c.l // move away from the surface first
      : parseColor(fg)!.l > 0.5 // then away from the text color
    if (wantPop) popDrift += 0.012
    bg = toHex(toGamut({ l: c.l + (away ? -0.012 : 0.012), c: c.c, h: c.h }))
  }
  return { bg, fg: bestForeground(bg, tintHue) }
}

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
): ThemeMode {
  const ramps = {} as Record<Role, Ramp>
  for (const role of Object.keys(seeds) as Role[]) {
    ramps[role] = makeRamp(seeds[role], mode, {
      isNeutral: role === 'neutral',
      separation,
    }).hex
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
  const charts = seriesSeeds.map((c) =>
    toHex(mode === 'dark' ? toGamut({ l: Math.max(c.l, 0.65), c: c.c * 0.85, h: c.h }) : c),
  )
  while (charts.length < 5) {
    const k = charts.length
    const base = seeds.primary
    // Mono lock: no hue spins — series separate on a sequential lightness
    // ladder over the base, like a print dataviz ramp.
    charts.push(
      toHex(
        toGamut(
          monoSeed
            ? {
                l: mode === 'dark' ? 0.35 + 0.115 * k : 0.78 - 0.115 * k,
                c: Math.min(monoSeed.c, 0.12),
                h: monoSeed.h,
              }
            : {
                l: mode === 'dark' ? 0.72 : 0.6,
                c: Math.max(base.c, 0.11),
                h: (base.h + 45 * (k + 1)) % 360,
              },
        ),
      ),
    )
  }

  // Multi-surface solve: run the solver once per surface and keep the most
  // extreme lightness. Contrast only grows as lightness moves away from a
  // surface, so the binding surface's answer satisfies every other one.
  const solveDir = mode === 'dark' ? ('lighter' as const) : ('darker' as const)
  const solveOnSurfaces = (
    surfaces: string[],
    targetLc: number,
    targetWcag: number,
    h: number,
    chromaAt: (l: number) => number,
  ) =>
    surfaces
      .map((s) => solveLightnessForLc(targetLc, targetWcag, s, h, chromaAt, solveDir))
      .reduce((a, b) => ((mode === 'dark' ? a.l >= b.l : a.l <= b.l) ? a : b))

  // The accent's solid working tone — focus ring, selected-tab indicator,
  // outlined-button border: the ramp's solid range nudged in lightness until
  // it stands 3:1 (WCAG 1.4.11 non-text) off BOTH the page and the card.
  // The chroma floor makes it read as "the pop color" — but under the mono
  // lock it would tint a deliberately achromatic theme, so it drops.
  const accentStrong = toHex(
    solveOnSurfaces(
      [N[0], N[1]],
      45,
      3,
      seeds.accent.h,
      () => Math.min(monoSeed ? seeds.accent.c : Math.max(seeds.accent.c, 0.08), 0.16),
    ),
  )

  // Link text: the accent as running-text color. Same APCA + WCAG double gate
  // as ramp text steps (Lc 62 / 4.5:1), solved against every surface links
  // actually sit on — page, card, and the success banner's wash.
  const link = toHex(
    solveOnSurfaces([N[0], N[1], S[1]], 62, 4.5, seeds.accent.h, () =>
      Math.min(seeds.accent.c * (mode === 'dark' ? 0.45 : 0.6), mode === 'dark' ? 0.08 : 0.11),
    ),
  )

  // Focus ring: the accent's job — selection and focus are not the brand's
  // voice. Shares the solved accent solid so it clears 3:1 on page and card.
  const ring = accentStrong

  const primarySolid = compliantSolid(P[8], seeds.primary.h, N[0], popBudget(fidelity))
  const dangerSolid = compliantSolid(D[8], seeds.danger.h)
  const successSolid = compliantSolid(S[8], seeds.success.h)
  const warningSolid = compliantSolid(W[8], seeds.warning.h)

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

  const report = buildReport(tokens)
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

const TEXT_PAIRS: Array<[fg: string, bg: string, required: number]> = [
  ['foreground', 'background', 4.5],
  ['card-foreground', 'card', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['destructive-subtle-foreground', 'destructive-subtle', 4.5],
  ['success-foreground', 'success', 4.5],
  ['success-subtle-foreground', 'success-subtle', 4.5],
  ['warning-foreground', 'warning', 4.5],
  ['warning-subtle-foreground', 'warning-subtle', 4.5],
  // Links (and the accent-outlined button's text) on every surface they sit on.
  ['link', 'background', 4.5],
  ['link', 'card', 4.5],
  ['link', 'success-subtle', 4.5],
  // Ring visibility: distinguishable on the page AND on cards (WCAG 1.4.11).
  ['ring', 'background', 3],
  ['ring', 'card', 3],
  // The accent's non-text marks: tab indicator, outlined-button border.
  ['accent-strong', 'background', 3],
  ['accent-strong', 'card', 3],
  // Non-text "pop": the primary fill must stand off the page (WCAG 1.4.11).
  ['primary', 'background', 3],
]

function buildReport(tokens: Record<string, string>): ContrastReport[] {
  return TEXT_PAIRS.map(([fgName, bgName, required]) => {
    const fg = tokens[fgName]
    const bg = tokens[bgName]
    const wcag = wcagRatio(fg, bg)
    return {
      token: fgName,
      background: bgName,
      fg,
      bg,
      wcag,
      apca: apcaLc(fg, bg),
      requiredWcag: required,
      pass: wcag >= required,
    }
  })
}
