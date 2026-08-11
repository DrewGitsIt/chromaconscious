import type { ColorCandidate, GenerateOptions, Oklch, Role, ThemeResult } from './types'
import { deltaEok, lerp, parseColor } from './color'
import { assignRoles, chartAdjust } from './roles'
import type { RepairEdge, RepairNode } from './repair'
import { repairSeeds } from './repair'
import { buildMode } from './tokens'
import { emitCss } from './css'

export * from './types'
export { parseColor, toHex } from './color'
export { extractCandidates } from './extract'
export { apcaLc, wcagRatio } from './contrast'
export { themeTailwind, themeTokensJson } from './css'
export { resolveBrand } from './adapters'
export type { BrandColorName } from './adapters'

/** Build candidates from a manual, ordered list of color strings. */
export function candidatesFromList(inputs: string[]): ColorCandidate[] {
  const parsed = inputs
    .map((raw) => ({ raw: raw.trim(), color: parseColor(raw) }))
    .filter((x): x is { raw: string; color: Oklch } => x.color != null)
  const n = parsed.length
  return parsed.map((p, i) => ({
    color: p.color,
    weight: n > 1 ? 1 - 0.6 * (i / (n - 1)) : 1,
    source: 'manual' as const,
    raw: p.raw,
  }))
}

// Minimum ΔE-OK between seed pairs that meet on a page. Charts sit side by
// side in one plot; the accent and statuses all act as "the colorful small
// thing", so any two of them being confusable is a UX bug.
const PAIR_MIN = {
  identity: 0.12, // primary ↔ accent
  status: 0.1, // primary/accent ↔ danger/success/warning
  chart: 0.1, // chart ↔ chart
  chartVsPrimary: 0.08,
}

/**
 * ΔE drift allowance for the repair pass. User colors harden as fidelity
 * rises — to *zero* at verbatim, so repair routes around them entirely;
 * pins are doubly stiff. Synthesized seeds are clay.
 */
function repairBudget(candidateIndex: number | null, pinned: boolean, fidelity: number): number {
  if (candidateIndex == null) return 0.25
  return (pinned ? 0.5 : 1) * lerp(0.12, 0, fidelity)
}

export function generateTheme(options: GenerateOptions): ThemeResult {
  const fidelity = options.fidelity ?? 0.5
  const monoBase =
    options.monoBase != null && options.candidates[options.monoBase] ? options.monoBase : null
  const { assignments, chartCandidateIndexes, unusedCandidateIndexes } = assignRoles(
    options.candidates,
    fidelity,
    monoBase,
  )

  // Pairwise repair over the resolved seeds: build the contrast graph, then
  // nudge whoever has budget until every pair keeps its minimum distance.
  // Under the mono lock the base and everything synthesized from it may only
  // move in lightness; colors the user layered on top keep the full move set.
  const nodes: RepairNode[] = assignments.map((a) => ({
    id: a.role,
    color: a.seed,
    budget: repairBudget(
      a.candidateIndex,
      a.candidateIndex != null && options.candidates[a.candidateIndex].pin === a.role,
      fidelity,
    ),
    lightnessOnly: monoBase != null && (a.candidateIndex == null || a.candidateIndex === monoBase),
  }))
  chartCandidateIndexes.forEach((ci, k) => {
    nodes.push({
      id: `chart-${k + 1}`,
      color: chartAdjust(options.candidates[ci].color, fidelity),
      budget: repairBudget(ci, false, fidelity),
    })
  })

  const edges: RepairEdge[] = [
    { a: 'primary', b: 'accent', minDeltaE: PAIR_MIN.identity, label: 'accent must not read as primary' },
  ]
  for (const s of ['danger', 'success', 'warning'] as const) {
    edges.push(
      { a: 'primary', b: s, minDeltaE: PAIR_MIN.status, label: `${s} must not read as primary` },
      { a: 'accent', b: s, minDeltaE: PAIR_MIN.status, label: `accent must not read as ${s}` },
    )
  }
  for (let i = 1; i <= chartCandidateIndexes.length; i++) {
    edges.push(
      {
        a: `chart-${i}`,
        b: 'primary',
        minDeltaE: PAIR_MIN.chartVsPrimary,
        label: `chart-${i} must stand apart from primary`,
      },
      {
        a: `chart-${i}`,
        b: 'accent',
        minDeltaE: PAIR_MIN.chartVsPrimary,
        label: `chart-${i} must stand apart from accent`,
      },
    )
    for (let j = i + 1; j <= chartCandidateIndexes.length; j++) {
      edges.push({
        a: `chart-${i}`,
        b: `chart-${j}`,
        minDeltaE: PAIR_MIN.chart,
        label: `chart-${i} and chart-${j} must be tellable apart`,
      })
    }
  }

  const { colors: repaired, residuals } = repairSeeds(nodes, edges)

  const seeds = {} as Record<Role, Oklch>
  const finalAssignments = assignments.map((a) => {
    const seed = repaired.get(a.role) ?? a.seed
    seeds[a.role] = seed
    const input = a.candidateIndex != null ? options.candidates[a.candidateIndex].color : null
    return { ...a, seed, deltaE: input ? deltaEok(input, seed) : 0 }
  })
  const chartSeeds = chartCandidateIndexes.map(
    (ci, k) => repaired.get(`chart-${k + 1}`) ?? chartAdjust(options.candidates[ci].color, fidelity),
  )

  // The mono donor for buildMode's invented fills: the base's final seed if it
  // holds a role (a primary pin may have unseated it), else its raw color.
  const monoSeed =
    monoBase != null
      ? (finalAssignments.find((a) => a.candidateIndex === monoBase)?.seed ??
        options.candidates[monoBase].color)
      : null
  const light = buildMode(seeds, chartSeeds, 'light', fidelity, monoSeed)
  const dark = buildMode(seeds, chartSeeds, 'dark', fidelity, monoSeed)

  return {
    light,
    dark,
    assignments: finalAssignments,
    chartCandidateIndexes,
    unusedCandidateIndexes,
    repairs: residuals,
    fidelity,
    monoBase,
    css: emitCss(light.tokens, dark.tokens),
  }
}
