import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ThemeResult } from './engine'
import { candidatesFromList, generateTheme, toHex } from './engine'
import './harness.css'

/**
 * Taste-test harness: M roots × N seeds, every cell one generated theme with
 * its judge score. Dev-only instrument (vite serves /harness.html in dev; it
 * is deliberately not a build input) — plain and fast, not a product surface.
 */

const ROOTS: Array<{ label: string; colors: string[] }> = [
  { label: 'violet', colors: ['#7c3aed'] },
  { label: 'teal', colors: ['#0f766e'] },
  { label: 'crimson', colors: ['#e11d48'] },
  {
    label: 'pastel picnic',
    colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff'],
  },
  { label: 'all muted', colors: ['#837c6f', '#4e5c73', '#a2975c'] },
]

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7]
const CHART_PREVIEW = ['chart-1', 'chart-2', 'chart-3', 'chart-4']

function Cell(props: { theme: ThemeResult; selected: boolean; onClick: () => void }) {
  const { theme, selected, onClick } = props
  return (
    <button className={`cell${selected ? ' cell-on' : ''}`} onClick={onClick} type="button">
      <span className="cell-seed">{theme.seed === 0 ? 'canonical' : `seed ${theme.seed}`}</span>
      <span className="strip">
        {theme.assignments.map((a) => (
          <span className="sw" key={a.role} style={{ background: toHex(a.seed) }} title={a.role}>
            {a.candidateIndex == null && <i className="synth-dot" />}
          </span>
        ))}
      </span>
      <span className="strip strip-chart">
        {CHART_PREVIEW.map((t) => (
          <span className="sw sw-chart" key={t} style={{ background: theme.light.tokens[t] }} />
        ))}
      </span>
      <span className="cell-score">{theme.judge.score.toFixed(2)}</span>
    </button>
  )
}

function Detail(props: { theme: ThemeResult }) {
  const { theme } = props
  return (
    <div className="detail">
      <div className="detail-swatches">
        {theme.assignments.map((a) => (
          <div className="detail-role" key={a.role}>
            <span className="sw sw-big" style={{ background: toHex(a.seed) }}>
              {a.candidateIndex == null && <i className="synth-dot" />}
            </span>
            <span className="detail-name">{a.role}</span>
            <code>{toHex(a.seed)}</code>
          </div>
        ))}
        <div className="detail-role">
          <span className="strip">
            {['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'].map((t) => (
              <span className="sw" key={t} style={{ background: theme.light.tokens[t] }} />
            ))}
          </span>
          <span className="detail-name">chart</span>
        </div>
      </div>
      <div className="detail-features">
        <span className="detail-total">score {theme.judge.score.toFixed(3)}</span>
        {Object.entries(theme.judge.features).map(([name, f]) => (
          <span key={name}>
            {name} <b>{f.toFixed(2)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function Row(props: { label: string; colors: string[] }) {
  const { label, colors } = props
  const themes = useMemo(
    () => SEEDS.map((seed) => generateTheme({ candidates: candidatesFromList(colors), seed })),
    [colors],
  )
  const [byJudge, setByJudge] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const order = byJudge
    ? [...themes].sort((a, b) => b.judge.score - a.judge.score)
    : themes
  return (
    <section className="row">
      <header className="row-head">
        <h2>{label}</h2>
        <span className="row-inputs">
          {colors.map((c) => (
            <span className="sw sw-input" key={c} style={{ background: c }} title={c} />
          ))}
        </span>
        <label className="sort-toggle">
          <input checked={byJudge} onChange={(e) => setByJudge(e.target.checked)} type="checkbox" />
          sort by judge
        </label>
      </header>
      <div className="cells">
        {order.map((t) => (
          <Cell
            key={t.seed}
            onClick={() => setOpen(open === t.seed ? null : t.seed)}
            selected={open === t.seed}
            theme={t}
          />
        ))}
      </div>
      {open != null && <Detail theme={themes[SEEDS.indexOf(open)]} />}
    </section>
  )
}

function Harness() {
  return (
    <main className="harness">
      <h1>
        taste-test harness <span>· dot = synthesized · click a cell to expand</span>
      </h1>
      {ROOTS.map((r) => (
        <Row colors={r.colors} key={r.label} label={r.label} />
      ))}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
