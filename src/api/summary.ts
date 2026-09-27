/**
 * What an agent "sees" of a theme: the board, why colours landed where they
 * did, and what the checks found — as terse text (the default; agents and
 * terminals read it best) or the same content as JSON.
 */
import type { ThemeResult } from '../engine'
import { whyLines } from '../engine'
import type { BoardView } from '../board'
import { readBoard } from '../board'
import type { ThemeState } from '../ops'

export interface ThemeSummary {
  theme: string
  parent: string | null
  riff: number
  taste: number
  separation: string
  mono: string | null
  seats: Array<{ role: string; hex: string; provenance: string; from: string | null; locked: boolean }>
  chart: Array<{ slot: number; hex: string; provenance: string; locked: boolean }>
  bench: Array<{ color: string; parked: boolean; why: string[] }>
  contrast: {
    light: { pass: number; total: number }
    dark: { pass: number; total: number }
    failures: Array<{ mode: string; token: string; on: string; wcag: number; required: number }>
  }
  spacing: Array<{ pair: string; deltaE: number; required: number }>
  judge: number
  links: { open: string; export: string }
}

export function summarize(
  id: string,
  parent: string | null,
  state: ThemeState,
  result: ThemeResult,
  origin: string,
): ThemeSummary {
  const view: BoardView = readBoard(result, state.candidates, 'light')
  const tally = (mode: 'light' | 'dark') => ({
    pass: result[mode].report.filter((r) => r.pass).length,
    total: result[mode].report.length,
  })
  const api = `${origin}/api/themesmith/v1`
  return {
    theme: id,
    parent,
    riff: state.seed,
    taste: state.fidelity,
    separation: state.separation,
    mono: state.monoBase != null ? state.candidates[state.monoBase].raw : null,
    seats: view.slots.map((s) => ({
      role: s.role,
      hex: s.hex,
      provenance: s.provenance,
      from: s.sourceHex,
      locked: s.locked,
    })),
    chart: view.series.map((s) => ({ slot: s.slot, hex: s.hex, provenance: s.provenance, locked: s.locked })),
    bench: view.bench.map((b) => ({
      color: state.candidates[b.candidateIndex].raw,
      parked: b.parked,
      why: whyLines(b.candidateIndex, result.casting, state.candidates),
    })),
    contrast: {
      light: tally('light'),
      dark: tally('dark'),
      failures: (['light', 'dark'] as const).flatMap((mode) =>
        result[mode].report
          .filter((r) => !r.pass)
          .map((r) => ({ mode, token: r.token, on: r.background, wcag: +r.wcag.toFixed(2), required: r.requiredWcag })),
      ),
    },
    spacing: result.repairs.map((r) => ({ pair: r.label, deltaE: +r.deltaE.toFixed(3), required: r.required })),
    judge: +result.judge.score.toFixed(2),
    links: {
      open: `${origin}/themesmith#${id}`,
      export: `${api}/export?theme=${id}&format=css`,
    },
  }
}

export function summaryText(s: ThemeSummary): string {
  const pad = (v: string, n: number) => v.padEnd(n)
  const head = [
    s.parent ? `from ${s.parent}` : null,
    `riff ${s.riff}`,
    `taste ${s.taste.toFixed(2)}`,
    `separation ${s.separation}`,
    s.mono ? `mono ${s.mono}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const lines = [`theme ${s.theme}   (${head})`, '', 'seats']
  for (const seat of s.seats) {
    const from = seat.from ? `from ${seat.from}` : ''
    lines.push(
      `  ${pad(seat.role, 9)} ${seat.hex}  ${pad(seat.provenance, 8)} ${pad(from, 13)} ${seat.locked ? 'locked' : ''}`.trimEnd(),
    )
  }
  lines.push(
    `chart       ${s.chart.map((c) => `${c.hex} ${c.provenance}${c.locked ? ' locked' : ''}`).join(' · ')}`,
  )
  if (s.bench.length === 0) lines.push('bench       —')
  for (const b of s.bench) lines.push(`bench       ${b.color}${b.parked ? ' (parked)' : ''}${b.why.length ? ` — ${b.why.join('; ')}` : ''}`)
  const { light, dark, failures } = s.contrast
  lines.push('', `contrast  light ${light.pass}/${light.total} · dark ${dark.pass}/${dark.total}`)
  for (const f of failures) lines.push(`  fail  ${f.mode}  ${f.token} on ${f.on}  ${f.wcag} (needs ${f.required})`)
  lines.push(`spacing   ${s.spacing.length ? '' : 'ok'}`.trimEnd())
  for (const r of s.spacing) lines.push(`  short  ${r.pair}  ΔE ${r.deltaE} (needs ${r.required})`)
  lines.push(`judge     ${s.judge}`, '', `open     ${s.links.open}`, `export   ${s.links.export}`)
  return lines.join('\n') + '\n'
}
