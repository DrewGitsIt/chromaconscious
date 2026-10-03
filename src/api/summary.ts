/**
 * What an agent "sees" of a theme: the board, why colours landed where they
 * did, and what the checks found — as terse text (the default; agents and
 * terminals read it best) or the same content as JSON.
 */
import type { Oklch, Role, ThemeResult } from '../engine'
import { CHART_WINDOW, contrastLevelName, contrastTargets, roleWindow, toHex, whyLines } from '../engine'
import type { BoardView } from '../board'
import { readBoard } from '../board'
import type { ThemeState } from '../ops'

export interface ThemeSummary {
  theme: string
  parent: string | null
  riff: number
  taste: number
  separation: string
  /**
   * The contrast level: 0 standard, 0.5 medium, 1 high (`name` is null
   * between detents), and the floors it promises every text pair and every
   * non-text mark.
   */
  contrastLevel: { level: number; name: string | null; text: { lc: number; wcag: number }; marks: { lc: number; wcag: number } }
  mono: string | null
  seats: Array<{ role: string; hex: string; provenance: string; from: string | null; locked: boolean }>
  chart: Array<{ slot: number; hex: string; provenance: string; locked: boolean }>
  bench: Array<{ color: string; parked: boolean; why: string[] }>
  /** Colors you supplied that the engine moved, why, and how to stop it. */
  adjusted: Adjustment[]
  contrast: {
    light: { pass: number; total: number }
    dark: { pass: number; total: number }
    /**
     * `requiredLc` appears above standard. `unreachable`: the engine pushed this
     * colour as far as its hue goes on that surface and still fell short — a
     * ceiling, not a choice; only a different colour fixes it.
     */
    failures: Array<{
      mode: string
      token: string
      on: string
      wcag: number
      required: number
      lc?: number
      requiredLc?: number
      unreachable?: true
    }>
  }
  spacing: Array<{ pair: string; deltaE: number; required: number }>
  judge: number
  links: { open: string; export: string }
}

export interface Adjustment {
  seat: string
  /** What you typed. */
  from: string
  /** What the theme holds. */
  to: string
  why: string
  fix: string
}

const fmt = (v: number) => +v.toFixed(3)

/** Why a color sits outside a window, in words: "too muted for primary (chroma 0.057, range 0.07–0.23)". */
function windowMiss(
  input: Oklch,
  name: string,
  l: readonly [number, number] | undefined,
  c: readonly [number, number],
): string | null {
  const misses: Array<{ word: string; detail: string }> = []
  const check = (axis: string, v: number, [lo, hi]: readonly [number, number], low: string, high: string) => {
    if (v < lo || v > hi) misses.push({ word: v < lo ? low : high, detail: `${axis} ${fmt(v)}, range ${lo}–${hi}` })
  }
  if (l) check('lightness', input.l, l, 'too dark', 'too light')
  if (c[1] !== Infinity) check('chroma', input.c, c, 'too muted', 'too vivid')
  if (misses.length === 0) return null
  return `${misses.map((m) => m.word).join(' and ')} for ${name} (${misses.map((m) => m.detail).join('; ')})`
}

/**
 * Every color you supplied that the theme doesn't hold as typed, and which
 * engine rule moved it. Mirrors the stages in engine/index.ts: the role window
 * (below taste 1), the mono lock, riff, then pair-spacing repair (below taste 1).
 */
function adjustments(state: ThemeState, view: BoardView): Adjustment[] {
  const out: Adjustment[] = []
  const mono = state.monoBase != null
  const riff = state.seed > 0

  for (const slot of view.slots) {
    if (slot.candidateIndex == null || slot.sourceHex == null) continue
    const cand = state.candidates[slot.candidateIndex]
    const base = { seat: slot.role, from: slot.sourceHex, to: slot.hex }
    if (slot.locked) {
      out.push({
        ...base,
        why: 'locked after the engine had moved it',
        fix: `generate from this theme with unlock=${slot.role}&taste=1&lock=${slot.role}`,
      })
      continue
    }
    if (mono) {
      out.push({ ...base, why: 'the mono lock sets its color', fix: 'lock it to keep it, or mono=off' })
      continue
    }
    const w = roleWindow(slot.role as Role)
    const range = state.fidelity < 1 ? windowMiss(cand.color, slot.role, w.l, w.c) : null
    const why = [range, riff ? `riff ${state.seed} moved it` : null].filter(Boolean)
    if (why.length === 0) why.push('moved apart from a nearby seat so the two stay tellable apart')
    const fix = [state.fidelity < 1 && (range || !riff) ? 'taste=1 keeps it as typed' : null, riff ? `lock=${slot.role} holds it through riffs` : null]
    out.push({ ...base, why: why.join('; '), fix: fix.filter(Boolean).join('; ') })
  }

  // A seat's color can also lead the series (chart-1 is the accent); its line above covers both.
  const seated = new Set(view.slots.map((s) => s.candidateIndex))
  for (const entry of view.series) {
    if (entry.candidateIndex == null || entry.locked || seated.has(entry.candidateIndex)) continue
    const input = state.candidates[entry.candidateIndex].color
    const from = toHex(input)
    if (from === entry.hex) continue
    const { l, c, hardL } = CHART_WINDOW
    const hard = input.l < hardL[0] || input.l > hardL[1]
    const range =
      state.fidelity < 1 ? windowMiss(input, 'a chart series', l, c) : hard ? windowMiss(input, 'a chart series', hardL, [0, Infinity]) : null
    if (!range && !riff) continue
    const why = [range, riff ? `riff ${state.seed} moved it` : null].filter(Boolean).join('; ')
    const fix = hard
      ? 'chart lightness is clamped at any taste so the series stays visible; pick a lighter or darker color'
      : [state.fidelity < 1 && range ? 'taste=1 keeps it as typed' : null, riff ? `lock=chart-${entry.slot} holds it through riffs` : null]
          .filter(Boolean)
          .join('; ')
    out.push({ seat: `chart-${entry.slot}`, from, to: entry.hex, why, fix })
  }
  return out
}

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p

function contrastSummary(level: number): ThemeSummary['contrastLevel'] {
  const t = contrastTargets(level)
  return {
    level,
    name: contrastLevelName(level),
    text: { lc: round(t.text.lc, 1), wcag: round(t.text.wcag, 2) },
    marks: { lc: round(t.mark.lc, 1), wcag: round(t.mark.wcag, 2) },
  }
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
  const api = `${origin}/api/chromaconscious/v1`
  return {
    theme: id,
    parent,
    riff: state.seed,
    taste: state.fidelity,
    separation: state.separation,
    contrastLevel: contrastSummary(state.contrast),
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
    adjusted: adjustments(state, view),
    contrast: {
      light: tally('light'),
      dark: tally('dark'),
      failures: (['light', 'dark'] as const).flatMap((mode) =>
        result[mode].report
          .filter((r) => !r.pass)
          .map((r) => ({
            mode,
            token: r.token,
            on: r.background,
            wcag: +r.wcag.toFixed(2),
            required: r.requiredWcag,
            ...(r.requiredLc != null ? { lc: +r.apca.toFixed(1), requiredLc: r.requiredLc } : {}),
            ...(r.unreachable ? { unreachable: true as const } : {}),
          })),
      ),
    },
    spacing: result.repairs.map((r) => ({ pair: r.label, deltaE: +r.deltaE.toFixed(3), required: r.required })),
    judge: +result.judge.score.toFixed(2),
    links: {
      open: `${origin}/chromaconscious#${id}`,
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
    `contrast ${s.contrastLevel.name ?? s.contrastLevel.level.toFixed(2)}`,
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
  if (s.adjusted.length === 0) lines.push('adjusted    —')
  for (const a of s.adjusted) lines.push(`adjusted    ${pad(a.seat, 9)} ${a.from} → ${a.to}  ${a.why} · ${a.fix}`)
  const { light, dark, failures } = s.contrast
  const { text: floor } = s.contrastLevel
  lines.push(
    '',
    `contrast  light ${light.pass}/${light.total} · dark ${dark.pass}/${dark.total}   (text ≥ Lc ${floor.lc} · ${floor.wcag}:1)`,
  )
  for (const f of failures) {
    const lc = f.requiredLc != null ? `, Lc ${f.lc} (needs ${f.requiredLc})` : ''
    lines.push(`  fail  ${f.mode}  ${f.token} on ${f.on}  ${f.wcag} (needs ${f.required})${lc}${f.unreachable ? ' — unreachable: as far as this hue goes' : ''}`)
  }
  lines.push(`spacing   ${s.spacing.length ? '' : 'ok'}`.trimEnd())
  for (const r of s.spacing) lines.push(`  short  ${r.pair}  ΔE ${r.deltaE} (needs ${r.required})`)
  lines.push(`judge     ${s.judge}`, '', `open     ${s.links.open}`, `export   ${s.links.export}`)
  return lines.join('\n') + '\n'
}
