import type { CastingExplanation, ColorCandidate, Role } from './types'
import { hueDistance, toHex } from './color'
import { CHART_CHROMA_GATE, STATUS_HUE } from './roles'

/**
 * Copy layer: casting explanations (pure data from roles.ts) → short human
 * strings. Voice: lowercase, concrete, numbers only when they carry meaning.
 * Nothing here is canned per-palette — every line is derived from the report.
 */

const ROLE_ORDER: Role[] = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning']

const ANCHOR_NAME: Record<'danger' | 'success' | 'warning', string> = {
  danger: 'red',
  success: 'green',
  warning: 'amber',
}

const hex = (candidates: ColorCandidate[], i: number) => toHex(candidates[i].color)

/** The headline: why this candidate landed where it did. */
function mainLine(i: number, r: CastingExplanation, candidates: ColorCandidate[]): string {
  const c = candidates[i]
  if (r.via === 'pin') {
    return r.outcome === 'chart'
      ? 'pinned to the chart series by you'
      : `pinned to ${r.outcome} by you — outranks all scoring`
  }
  if (r.via === 'mono-base') return 'mono base — the lock crowns it primary'
  if (r.via === 'score') {
    const role = r.outcome as Role
    switch (role) {
      case 'primary':
        return i === 0
          ? 'leads: strongest claim at the top of your list'
          : `strongest primary claim in the list (score ${r.score!.total.toFixed(2)})`
      case 'accent':
        return `most hue-distant vivid color from primary${
          r.hueDistToPrimary != null ? ` (Δh ${Math.round(r.hueDistToPrimary)}°)` : ''
        }`
      case 'neutral':
        return `nearly gray (chroma ${c.color.c.toFixed(3)}) — seeds the neutral scale`
      default:
        return `close to the ${ANCHOR_NAME[role]} ${role} hue (Δh ${Math.round(
          hueDistance(c.color.h, STATUS_HUE[role]),
        )}°)`
    }
  }
  // via 'leftover'
  if (r.outcome === 'chart') {
    return `no role fit well enough — charts instead (chroma ${c.color.c.toFixed(2)})`
  }
  // unused
  const mutedForBoth =
    r.gates.some((g) => g.gate === 'accent-chroma') && r.gates.some((g) => g.gate === 'status-chroma')
  if (mutedForBoth) return 'too muted for accent or a status — reads as tinted gray'
  const chartLine = chartGateLine(r)
  if (chartLine) return chartLine
  if (r.chartFull) return 'every seat and all five chart slots were taken'
  if (r.gates.some((g) => g.gate === 'accent-lightness')) {
    return 'bright near-white — reads as background tint, not a second voice'
  }
  return 'no seat left for it'
}

/** Where an unused candidate stands against the chart chroma bar. */
function chartGateLine(r: CastingExplanation): string | null {
  const g = r.gates.find((x) => x.gate === 'chart-chroma')
  if (!g) return null
  return g.needed - g.actual < 0.02
    ? `missed chart by a hair (chroma ${g.actual.toFixed(3)}, needs ${g.needed})`
    : `chroma ${g.actual.toFixed(3)} — under the chart bar (${g.needed})`
}

// Margins beyond this are settled races, not stories worth a line.
const CLOSE_MARGIN = 0.12

/** The most interesting relational fact: a contested or narrowly lost seat. */
function factLine(i: number, r: CastingExplanation, candidates: ColorCandidate[]): string | null {
  const tell = (lost: CastingExplanation['lost'][number]): string => {
    const w = hex(candidates, lost.winnerIndex)
    if (lost.role === 'neutral') {
      return candidates[lost.winnerIndex].color.c < candidates[i].color.c
        ? `neutral went to ${w}, a purer gray`
        : `neutral went to ${w}, higher in your list`
    }
    if (lost.margin > 0.001) return `${lost.role} went to ${w} (ahead by ${lost.margin.toFixed(2)})`
    return `also fit ${lost.role} — but ${r.outcome} claimed it first`
  }
  if (r.outcome === 'unused') {
    // An unused color's story is where its real claims went, closest first.
    const lost = ROLE_ORDER.map((role) => r.lost.find((l) => l.role === role)).find(
      (l) => l != null && (l.role === 'neutral' || Math.abs(l.margin) < CLOSE_MARGIN),
    )
    return lost ? tell(lost) : null
  }
  // Seated / charting: only near things are news — the closest lost seat,
  // else the rival this candidate barely edged out.
  const close = [...r.lost]
    .filter((l) => Math.abs(l.margin) < CLOSE_MARGIN)
    .sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0]
  if (close) return tell(close)
  if (r.via === 'score' && r.rival && r.rival.margin > 0.001 && r.rival.margin < CLOSE_MARGIN) {
    return `edged out ${hex(candidates, r.rival.index)} by ${r.rival.margin.toFixed(2)}`
  }
  return null
}

/**
 * 1-3 short lines explaining candidate i's casting. Parallel inputs: the
 * casting array from the engine result and the candidates it was cast from.
 */
export function whyLines(
  i: number,
  casting: CastingExplanation[],
  candidates: ColorCandidate[],
): string[] {
  const r = casting[i]
  const c = candidates[i]
  if (!r || !c) return []
  const lines = [mainLine(i, r, candidates)]
  // The chart-bar status is its own fact for unused colors (the muted line
  // above already took the headline) and for sub-gate chart pins.
  if (r.outcome === 'unused') {
    const chartLine = chartGateLine(r)
    if (chartLine && chartLine !== lines[0]) lines.push(chartLine)
  } else if (r.via === 'pin' && r.outcome === 'chart' && c.color.c < CHART_CHROMA_GATE) {
    lines.push('below the chart bar — chroma gets nudged up so the series stays visible')
  }
  const fact = factLine(i, r, candidates)
  if (fact) lines.push(fact)
  if (c.source === 'image' && c.share != null) {
    lines.push(`${Math.round(c.share * 100)}% of your image`)
  }
  return lines.slice(0, 3)
}

/**
 * Human names for the jobs app tokens hold, grouped — insertion order is
 * display order. Derived captions only ever name groups whose tokens actually
 * descend from the hovered candidate, so the line is never canned.
 */
export const JOB_TOKENS: Record<string, string[]> = {
  backgrounds: ['background', 'card', 'popover', 'secondary', 'muted', 'sidebar'],
  text: [
    'foreground',
    'card-foreground',
    'popover-foreground',
    'secondary-foreground',
    'muted-foreground',
    'sidebar-foreground',
  ],
  borders: ['border', 'input', 'sidebar-border'],
  buttons: ['primary', 'primary-foreground', 'sidebar-primary', 'sidebar-primary-foreground'],
  links: ['link'],
  'focus ring': ['ring', 'sidebar-ring'],
  'tab indicator': ['accent-strong'],
  'chart 1': ['chart-1'],
  'chart 2': ['chart-2'],
  'chart 3': ['chart-3'],
  'chart 4': ['chart-4'],
  'chart 5': ['chart-5'],
  'hover wash': ['accent', 'accent-foreground', 'sidebar-accent', 'sidebar-accent-foreground'],
  'danger alerts': [
    'destructive',
    'destructive-foreground',
    'destructive-subtle',
    'destructive-subtle-foreground',
    'destructive-strong',
  ],
  'success alerts': ['success', 'success-foreground', 'success-subtle', 'success-subtle-foreground', 'success-strong'],
  'warning alerts': ['warning', 'warning-foreground', 'warning-subtle', 'warning-subtle-foreground', 'warning-strong'],
}

/**
 * The locator's caption: every job candidate i's descendants hold, one
 * middot-joined line ("links · focus ring · tab indicator · chart 1 · hover
 * wash"). `ancestry` is tokenAncestry()'s map for the current mode; an empty
 * string means nothing in the app mockup descends from this candidate.
 */
export function jobsSummary(
  ancestry: Record<string, number | null>,
  candidateIndex: number,
): string {
  return Object.entries(JOB_TOKENS)
    .filter(([, tokens]) => tokens.some((t) => ancestry[t] === candidateIndex))
    .map(([job]) => job)
    .join(' · ')
}

/**
 * The consequence of pinning candidate i to `target` (null = unpin), read
 * from the CURRENT casting: whose seat it takes, what it frees up, whether
 * a sub-gate color needs a chroma nudge to chart.
 */
export function pinConsequence(
  i: number,
  target: Role | 'chart' | null,
  casting: CastingExplanation[],
  candidates: ColorCandidate[],
): string {
  const mine = casting[i]
  if (target == null) return 'back to the engine’s choice'
  // What pinning me elsewhere frees up: my current seat goes to its runner-up.
  const freed =
    mine && mine.outcome !== target && mine.outcome !== 'chart' && mine.outcome !== 'unused' && mine.rival
      ? `frees ${mine.outcome} for ${hex(candidates, mine.rival.index)}`
      : null
  if (target === 'chart') {
    const base =
      candidates[i].color.c < CHART_CHROMA_GATE
        ? 'nudges chroma up so the series stays visible'
        : mine?.outcome === 'chart'
          ? 'keeps it charting through any edit'
          : 'joins the chart series'
    return freed ? `${base} · ${freed}` : base
  }
  if (mine?.outcome === target) return `keeps ${target} here through any reorder`
  const holder = casting.findIndex((r, j) => j !== i && r.outcome === target)
  const base =
    holder >= 0 ? `benches ${hex(candidates, holder)}` : 'takes a seat the engine was inventing'
  return freed ? `${base} · ${freed}` : base
}
