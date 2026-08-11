import type { ContrastReport, Oklch, Ramp, Role, ThemeMode } from './types'
import { parseColor, toGamut, toHex } from './color'
import { apcaLc, bestForeground, solveLightnessForLc, wcagRatio } from './contrast'
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
): ThemeMode {
  const ramps = {} as Record<Role, Ramp>
  for (const role of Object.keys(seeds) as Role[]) {
    ramps[role] = makeRamp(seeds[role], mode, { isNeutral: role === 'neutral' }).hex
  }

  const N = ramps.neutral
  const P = ramps.primary
  const A = ramps.accent
  const D = ramps.danger
  const S = ramps.success
  const W = ramps.warning

  const charts = chartSeeds.map((c) =>
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

  // Focus ring: primary-hued, solved to >=3:1 against the app background.
  // The chroma floor makes the ring readable as "brand" — but under the mono
  // lock it would tint a deliberately achromatic theme, so it drops.
  const ring = toHex(
    solveLightnessForLc(
      45,
      3,
      N[0],
      seeds.primary.h,
      () => Math.min(monoSeed ? seeds.primary.c : Math.max(seeds.primary.c, 0.08), 0.16),
      mode === 'dark' ? 'lighter' : 'darker',
    ),
  )

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

  const report = buildReport(tokens)
  return { tokens, ramps, report }
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
  ['ring', 'background', 3],
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
