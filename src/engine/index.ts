import type { ColorCandidate, GenerateOptions, JudgeInput, Oklch, Role, ThemeResult } from './types'
import { deltaEok, lerp, parseColor } from './color'
import { assignRoles, chartAdjust } from './roles'
import { judgePalette } from './judge'
import type { WalkSubject } from './walk'
import { chartEnvelope, envelopeFor, travelFor, walkPalette } from './walk'
import type { RepairEdge, RepairNode } from './repair'
import { repairSeeds } from './repair'
import { buildMode } from './tokens'
import { emitCss } from './css'

export * from './types'
export { assignRoles, CHART_CHROMA_GATE } from './roles'
export { JUDGE_WEIGHTS, judgePalette } from './judge'
export { JOB_TOKENS, jobsSummary, pinConsequence, whyLines } from './explain'
export { parseColor, toHex } from './color'
export { extractCandidates } from './extract'
export { apcaLc, wcagRatio } from './contrast'
export { themeTailwind, themeTokensJson } from './css'
export { brandAncestors, brandAncestry, resolveBrand } from './adapters'
export type { BrandColorName } from './adapters'
export { tokenAncestry } from './tokens'
export { locateMuted, locateTokens, sameAncestor } from './locate'
export { buildEffects, cssAlphaColor, cssShadow, effectVars } from './elevation'

/** Build candidates from a manual, ordered list of color strings. */
export function candidatesFromList(inputs: string[]): ColorCandidate[] {
  return inputs
    .map((raw) => ({ raw: raw.trim(), color: parseColor(raw) }))
    .filter((x): x is { raw: string; color: Oklch } => x.color != null)
    .map((p) => ({ color: p.color, source: 'manual' as const, raw: p.raw }))
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
 *
 * A lock is absolute here too. Honouring it in the walk alone was not enough:
 * repair runs afterwards, and a locked seat's *neighbours* move, so the pass
 * would nudge the locked colour by a different amount at every hop — a colour
 * the user froze visibly wandering, by up to 0.046 ΔE at fidelity 0.5. The
 * pairwise minimums are still met; they are simply paid for by whoever is
 * free to move, which is what a lock means.
 */
function repairBudget(
  candidateIndex: number | null,
  pinned: boolean,
  fidelity: number,
  locked: boolean,
): number {
  if (locked) return 0
  if (candidateIndex == null) return 0.25
  return (pinned ? 0.5 : 1) * lerp(0.12, 0, fidelity)
}

export function generateTheme(options: GenerateOptions): ThemeResult {
  const fidelity = options.fidelity ?? 0.5
  const seed = options.seed ?? 0
  const monoBase =
    options.monoBase != null && options.candidates[options.monoBase] ? options.monoBase : null

  // Casting is seed-independent: who sits in which seat is decided by the
  // user's colors and the order they gave them, never by the riff. The riff
  // walks the seeds those seats resolved to — which is why it can move a
  // color you supplied without ever re-shuffling the board underneath you.
  const cast = assignRoles(options.candidates, fidelity, monoBase)
  const { assignments, chartCandidateIndexes, unusedCandidateIndexes, casting } = cast
  const synthesized = assignments.filter((a) => a.candidateIndex == null).map((a) => a.role)

  // The lock is the whole rule, and it is the only rule. Everything else walks:
  // derived seats and colors you supplied alike, at any fidelity. A derived
  // seat has no candidate to carry a lock, so it is always riffable — locking
  // one means keeping it first, which materializes it as a candidate.
  const isLocked = (candidateIndex: number | null) =>
    candidateIndex != null && options.candidates[candidateIndex].locked === true

  const subjects: WalkSubject[] = [
    ...assignments.map((a) => ({
      id: a.role,
      color: a.seed,
      envelope: envelopeFor(a.role),
      locked: isLocked(a.candidateIndex),
      // Under the mono lock the base and everything synthesized from it may
      // only move in lightness — the same rule the repair pass below obeys.
      lightnessOnly: monoBase != null && (a.candidateIndex == null || a.candidateIndex === monoBase),
      travel: travelFor(a.role),
    })),
    ...chartCandidateIndexes.map((ci, k) => ({
      id: `chart-${k + 1}`,
      // Locked series colors skip the readability clamp for the same reason
      // locked role seeds skip fidelityAdjust: the lock names an exact color.
      color: isLocked(ci)
        ? (options.candidates[ci].lockedColor ?? options.candidates[ci].color)
        : chartAdjust(options.candidates[ci].color, fidelity),
      envelope: chartEnvelope(),
      locked: isLocked(ci),
      lightnessOnly: monoBase != null,
      travel: 1,
    })),
  ]

  // The judge sees the whole palette every hop: user-held seats and chart
  // seeds participate in the features, since harmony is relational.
  const judgeOf = (colors: Map<string, Oklch>): JudgeInput => ({
    seeds: Object.fromEntries(assignments.map((a) => [a.role, colors.get(a.role)!])) as Record<
      Role,
      Oklch
    >,
    synthesized,
    chartSeeds: chartCandidateIndexes.map((_, k) => colors.get(`chart-${k + 1}`)!),
  })
  const walked = walkPalette(subjects, seed, (colors) => judgePalette(judgeOf(colors)).score)
  const judge = judgePalette(judgeOf(walked))
  const walkedAssignments = assignments.map((a) => ({ ...a, seed: walked.get(a.role)! }))

  // Pairwise repair over the walked seeds: build the contrast graph, then
  // nudge whoever has budget until every pair keeps its minimum distance.
  // Under the mono lock the base and everything synthesized from it may only
  // move in lightness; colors the user layered on top keep the full move set.
  const nodes: RepairNode[] = walkedAssignments.map((a) => ({
    id: a.role,
    color: a.seed,
    budget: repairBudget(
      a.candidateIndex,
      a.candidateIndex != null && options.candidates[a.candidateIndex].pin === a.role,
      fidelity,
      isLocked(a.candidateIndex),
    ),
    lightnessOnly: monoBase != null && (a.candidateIndex == null || a.candidateIndex === monoBase),
  }))
  chartCandidateIndexes.forEach((ci, k) => {
    nodes.push({
      id: `chart-${k + 1}`,
      color: walked.get(`chart-${k + 1}`)!,
      budget: repairBudget(ci, options.candidates[ci].pin === 'chart', fidelity, isLocked(ci)),
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
  // deltaE is measured against the color the user actually handed us, so a
  // walked seat reports how far the riff has carried it — not zero.
  const finalAssignments = walkedAssignments.map((a) => {
    const seed = repaired.get(a.role) ?? a.seed
    seeds[a.role] = seed
    const input = a.candidateIndex != null ? options.candidates[a.candidateIndex].color : null
    return { ...a, seed, deltaE: input ? deltaEok(input, seed) : 0 }
  })
  const chartSeeds = chartCandidateIndexes.map(
    (_, k) => repaired.get(`chart-${k + 1}`) ?? walked.get(`chart-${k + 1}`)!,
  )

  // The mono donor for buildMode's invented fills: the base's final seed if it
  // holds a role (a primary pin may have unseated it), else its raw color.
  const monoSeed =
    monoBase != null
      ? (finalAssignments.find((a) => a.candidateIndex === monoBase)?.seed ??
        options.candidates[monoBase].color)
      : null
  const separation = options.separation ?? 'layered'
  // Which series colours the user locked, so the mono ladder can step around
  // them — parallel to chartSeeds by construction.
  const chartLocked = chartCandidateIndexes.map((ci) => isLocked(ci))
  const light = buildMode(seeds, chartSeeds, 'light', fidelity, monoSeed, separation, chartLocked)
  const dark = buildMode(seeds, chartSeeds, 'dark', fidelity, monoSeed, separation, chartLocked)

  return {
    light,
    dark,
    assignments: finalAssignments,
    chartCandidateIndexes,
    unusedCandidateIndexes,
    casting,
    repairs: residuals,
    fidelity,
    monoBase,
    separation,
    seed,
    judge,
    css: emitCss(light, dark),
  }
}
