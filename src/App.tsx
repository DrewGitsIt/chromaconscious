import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, LockOpen, Moon, Sun } from 'lucide-react'
import type { ColorCandidate, Oklch, Role, ThemeResult } from './engine'
import {
  assignRoles,
  candidatesFromList,
  generateTheme,
  jobsSummary,
  parseColor,
  pinConsequence,
  ROLES,
  themeTailwind,
  themeTokensJson,
  toHex,
  tokenAncestry,
  whyLines,
} from './engine'
import type { ExportFormat } from './components/Preview'
import { CandidateStrip } from './components/CandidateStrip'
import { ColorAddField } from './components/ColorAddField'
import { fileToCandidates } from './components/ImageDrop'
import { PresetDots } from './components/PresetDots'
import { PreviewBoundary } from './components/PreviewBoundary'
import { ReportPanel } from './components/ReportPanel'
import { StartHero } from './components/StartHero'
import type { MockupProps } from './mockups'
import { MOCKUPS, mockupById } from './mockups'
import { PRESETS } from './presets'
import { useDismiss } from './components/useDismiss'
import './styles/tokens.css'
import './styles/base.css'
import './App.css'

type Mode = 'light' | 'dark'

interface FrameState {
  candidates: ColorCandidate[]
  fidelity: number
  mode: Mode
  /** Which design-space mockup this frame renders into. */
  mockup: string
  /** Name of the applied preset; cleared once candidates diverge from it. */
  preset: string | null
  /** Mono lock: candidate index whose hue rules the theme, or null. */
  monoBase: number | null
  /** Last base after unlocking — one click re-locks it. */
  monoParked: number | null
  /** Riff seed for the engine's invented colors; 0 = canonical cookbook. */
  seed: number
}

/** What "start over" replaces — and what undo brings back. */
type StartOverState = Pick<FrameState, 'candidates' | 'preset' | 'monoBase' | 'monoParked' | 'seed'>

interface Toast {
  text: string
  undo: { frameIndex: number; prev: StartOverState } | null
}

const FRAME_LABEL = ['A', 'B'] as const

const FORMAT_LABEL: Record<ExportFormat, string> = {
  css: 'CSS variables',
  tailwind: 'Tailwind v4 CSS',
  json: 'Design tokens JSON',
}

const emptyFrameState = (): FrameState => ({
  candidates: [],
  fidelity: 0.5,
  mode: 'light',
  mockup: 'app',
  preset: null,
  monoBase: null,
  monoParked: null,
  seed: 0,
})

const cloneFrame = (f: FrameState): FrameState => ({
  ...f,
  candidates: f.candidates.map((c) => ({ ...c })),
})

// ---- role-transfer detection --------------------------------------------
// When an edit moves a seat between two colors that exist on BOTH sides of
// the edit, the app says so. A newly added color claiming a seat is not news,
// and start-over has its own toast. If several seats moved, announce the most
// important one.
const SEAT_PRIORITY: Array<Role | 'chart'> = [...ROLES, 'chart']

interface SeatTransfer {
  role: Role | 'chart'
  fromHex: string
  toHex: string
}

function findSeatTransfer(
  before: Pick<FrameState, 'candidates' | 'fidelity' | 'monoBase'>,
  after: Pick<FrameState, 'candidates' | 'fidelity' | 'monoBase'>,
): SeatTransfer | null {
  if (before.candidates.length === 0 || after.candidates.length === 0) return null
  const seats = (f: typeof before) => {
    const cast = assignRoles(f.candidates, f.fidelity, f.monoBase)
    const byRole = new Map<Role, string>()
    for (const a of cast.assignments) {
      if (a.candidateIndex != null) byRole.set(a.role, toHex(f.candidates[a.candidateIndex].color))
    }
    return { byRole, chart: cast.chartCandidateIndexes.map((i) => toHex(f.candidates[i].color)) }
  }
  const b = seats(before)
  const a = seats(after)
  const beforeHexes = new Set(before.candidates.map((c) => toHex(c.color)))
  const afterHexes = new Set(after.candidates.map((c) => toHex(c.color)))
  const onBothSides = (hex: string) => beforeHexes.has(hex) && afterHexes.has(hex)

  for (const role of SEAT_PRIORITY) {
    if (role === 'chart') {
      // Chart is a pooled seat set: pair a color that lost its series slot
      // with one that gained a slot.
      const lost = b.chart.filter((h) => !a.chart.includes(h) && onBothSides(h))
      const gained = a.chart.filter((h) => !b.chart.includes(h) && onBothSides(h))
      if (lost.length > 0 && gained.length > 0) {
        return { role: 'chart', fromHex: lost[0], toHex: gained[0] }
      }
      continue
    }
    const fromHex = b.byRole.get(role)
    const toHex_ = a.byRole.get(role)
    if (fromHex && toHex_ && fromHex !== toHex_ && onBothSides(fromHex) && onBothSides(toHex_)) {
      return { role, fromHex, toHex: toHex_ }
    }
  }
  return null
}

/** Proper component wrapper so each mockup's hooks stay its own. */
function FrameMockup({ mockup, ...props }: { mockup: string } & MockupProps) {
  const M = mockupById(mockup).Component
  return <M {...props} />
}

function useThemeResult(f: FrameState | undefined) {
  return useMemo(() => {
    if (!f || f.candidates.length === 0) return null
    try {
      return generateTheme({
        candidates: f.candidates,
        fidelity: f.fidelity,
        monoBase: f.monoBase ?? undefined,
        seed: f.seed,
      })
    } catch (err) {
      console.error(err)
      return null
    }
  }, [f])
}

export default function App() {
  // One or two independent frames. All toolbar edits target the active one;
  // the canvas splits when a second frame exists. Frames boot empty — the
  // first move belongs to the user, made in the stage's start hero.
  const [frames, setFrames] = useState<FrameState[]>(() => [emptyFrameState()])
  const [active, setActive] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  // Mono-lock pick mode: the padlock was clicked, the strip is the menu.
  const [picking, setPicking] = useState(false)
  // The start-over menu: one door for everything that replaces the set.
  const [startOverOpen, setStartOverOpen] = useState(false)
  const [startOverPage, setStartOverPage] = useState<'root' | 'presets'>('root')
  const startOverRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useDismiss(startOverRef, startOverOpen, () => setStartOverOpen(false))
  // Window-wide image drop + the undo toast that forgives any start-over.
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('css')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  useDismiss(exportRef, exportMenuOpen, () => setExportMenuOpen(false))

  const frame = frames[active]
  const updateFrame = (i: number, patch: Partial<FrameState>) => {
    setFrames((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }
  const updateActive = (patch: Partial<FrameState>) => updateFrame(active, patch)

  const results = [useThemeResult(frames[0]), useThemeResult(frames[1])]
  const result = results[active]

  const toggleMode = (i: number) => {
    setFrames((prev) =>
      prev.map((f, j) =>
        j === i ? { ...f, mode: f.mode === 'light' ? ('dark' as Mode) : ('light' as Mode) } : f,
      ),
    )
  }

  const setMockup = (i: number, id: string) => {
    const m = mockupById(id)
    // a print-like mockup has no dark mode; snap the frame back to light
    updateFrame(i, { mockup: m.id, ...(m.supportsDark ? {} : { mode: 'light' as Mode }) })
  }

  const duplicateFrame = (i: number) => {
    if (frames.length === 1) {
      setFrames([frames[0], cloneFrame(frames[0])])
      setActive(1)
    } else {
      // "copy → X": overwrite the other frame with a copy of this one.
      const other = 1 - i
      setFrames((prev) => prev.map((f, j) => (j === other ? cloneFrame(prev[i]) : f)))
      setActive(other)
    }
  }

  const closeFrame = (i: number) => {
    setFrames((prev) => prev.filter((_, j) => j !== i))
    setActive(0)
  }

  const exporter = (r: ThemeResult) => (format: ExportFormat) =>
    format === 'css' ? r.css : format === 'tailwind' ? themeTailwind(r) : themeTokensJson(r)

  const doExport = async (format: ExportFormat) => {
    if (!result) return
    let ok = false
    try {
      await navigator.clipboard.writeText(exporter(result)(format))
      ok = true
    } catch {
      // clipboard unavailable (permissions, insecure context)
    }
    setExportMsg(ok ? `${FORMAT_LABEL[format]} copied ✓` : 'copy failed')
    setTimeout(() => setExportMsg(null), 2000)
  }

  // ---- seat-transfer aware candidate edits --------------------------------
  // Every additive/editing verb funnels through here: if the edit moved a
  // seat between two colors present before AND after, a toast says so, with
  // undo restoring the pre-edit frame (same snapshot shape as start over).
  const editCandidatesAt = (i: number, patch: Partial<FrameState> & Pick<FrameState, 'candidates'>) => {
    const prev = frames[i]
    if (!prev) return
    const transfer = findSeatTransfer(prev, {
      candidates: patch.candidates,
      fidelity: prev.fidelity,
      monoBase: patch.monoBase !== undefined ? patch.monoBase : prev.monoBase,
    })
    updateFrame(i, patch)
    if (transfer) {
      setToast({
        text: `${transfer.toHex} took ${transfer.role} from ${transfer.fromHex}`,
        undo: {
          frameIndex: i,
          prev: {
            candidates: prev.candidates,
            preset: prev.preset,
            monoBase: prev.monoBase,
            monoParked: prev.monoParked,
            seed: prev.seed,
          },
        },
      })
    }
  }

  // ---- the additive verb: grow frame i's candidate list -------------------
  const addCandidatesAt = (i: number, inputs: string[]) => {
    const f = frames[i]
    if (!f) return
    const parsed = inputs
      .map((raw) => ({ raw, color: parseColor(raw) }))
      .filter((x): x is { raw: string; color: NonNullable<ReturnType<typeof parseColor>> } => !!x.color)
    if (parsed.length === 0) return
    const added: ColorCandidate[] = parsed.map((x) => ({
      color: x.color,
      source: 'manual',
      raw: x.raw,
    }))
    editCandidatesAt(i, { candidates: [...f.candidates, ...added], preset: null })
  }
  const addCandidates = (inputs: string[]) => addCandidatesAt(active, inputs)
  const inList = (hex: string) => {
    const c = parseColor(hex)
    return c != null && frame.candidates.some((x) => toHex(x.color) === toHex(c))
  }

  // ---- the destructive verb: replace frame i's set, forgivably ------------
  const startOverAt = (
    i: number,
    candidates: ColorCandidate[],
    preset: string | null,
    label: string,
  ) => {
    const prev = frames[i]
    updateFrame(i, { candidates, preset, monoBase: null, monoParked: null, seed: 0 })
    setPicking(false)
    if (prev.candidates.length > 0) {
      setToast({
        text: label,
        undo: {
          frameIndex: i,
          prev: {
            candidates: prev.candidates,
            preset: prev.preset,
            monoBase: prev.monoBase,
            monoParked: prev.monoParked,
            seed: prev.seed,
          },
        },
      })
    }
  }

  const imageStartOver = async (i: number, file: File) => {
    try {
      const candidates = await fileToCandidates(file)
      startOverAt(
        i,
        candidates,
        null,
        `started over from ${file.name} · ${candidates.length} colors extracted`,
      )
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : String(err), undo: null })
    }
  }

  const undoStartOver = () => {
    if (toast?.undo) updateFrame(toast.undo.frameIndex, toast.undo.prev)
    setToast(null)
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(t)
  }, [toast])

  const updateCandidate = (i: number, patch: Partial<ColorCandidate>) => {
    editCandidatesAt(active, {
      candidates: frame.candidates.map((c, j) => (j === i ? { ...c, ...patch } : c)),
      preset: null,
    })
  }
  // The mono base/parked fields are candidate indexes; keep them pointing at
  // the same color when the list shifts underneath them.
  const remapAfterRemove = (idx: number | null, removed: number) =>
    idx == null || idx === removed ? null : idx > removed ? idx - 1 : idx
  const remapAfterMove = (idx: number | null, from: number, to: number) =>
    idx == null
      ? null
      : idx === from
        ? to
        : from < idx && idx <= to
          ? idx - 1
          : to <= idx && idx < from
            ? idx + 1
            : idx

  const removeCandidate = (i: number) =>
    editCandidatesAt(active, {
      candidates: frame.candidates.filter((_, j) => j !== i),
      preset: null,
      monoBase: remapAfterRemove(frame.monoBase, i),
      monoParked: remapAfterRemove(frame.monoParked, i),
    })
  const reorderCandidate = (from: number, to: number) => {
    if (from === to) return
    // Position is the engine's order prior: dragging a color up strengthens
    // its claim on every role.
    const next = [...frame.candidates]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    editCandidatesAt(active, {
      candidates: next,
      preset: null,
      monoBase: remapAfterMove(frame.monoBase, from, to),
      monoParked: remapAfterMove(frame.monoParked, from, to),
    })
  }

  const roleByCandidate = useMemo(() => {
    const map = new Map<number, Role | 'chart' | 'unused'>()
    if (!result) return map
    for (const a of result.assignments) {
      if (a.candidateIndex != null) map.set(a.candidateIndex, a.role)
    }
    for (const i of result.chartCandidateIndexes) map.set(i, 'chart')
    for (const i of result.unusedCandidateIndexes) map.set(i, 'unused')
    return map
  }, [result])

  // The chip menu's content: why-lines and pin consequences, both derived
  // from the engine's casting report — never canned strings.
  const explainCandidate = (i: number) =>
    result ? whyLines(i, result.casting, frame.candidates) : []
  const pinHintFor = (i: number, target: Role | 'chart' | null) =>
    result ? pinConsequence(i, target, result.casting, frame.candidates) : ''

  // Riff: walk the invented material through the seeded repertoire. Linear
  // and non-destructive — back is the undo, seed 0 the canonical cookbook.
  const riff = (delta: number) => updateActive({ seed: Math.max(0, frame.seed + delta) })

  // The engine's invented roles (no candidate behind them). "keep as your
  // color" promotes a synthesized seed to a real candidate pinned to its
  // role — it stops being invented, so it survives future riffs.
  const invented = result ? result.assignments.filter((a) => a.candidateIndex == null) : []
  const keepInvented = (role: Role, color: Oklch) => {
    const hex = toHex(color)
    const parsed = parseColor(hex)
    if (!parsed) return
    editCandidatesAt(active, {
      candidates: [...frame.candidates, { color: parsed, source: 'manual', raw: hex, pin: role }],
      preset: null,
    })
  }

  // Locate mode: hovering a row lights only that candidate's descendants in
  // the active frame's mockup (token substitution — see engine/locate.ts).
  // Enter is debounced so casual mouse travel doesn't strobe; leave restores
  // instantly. Any candidate edit clears it — indexes may have shifted.
  const [locating, setLocating] = useState<number | null>(null)
  const locateTimer = useRef<number | null>(null)
  const onLocate = (i: number | null) => {
    if (locateTimer.current != null) window.clearTimeout(locateTimer.current)
    locateTimer.current = null
    if (i == null) {
      setLocating(null)
      return
    }
    locateTimer.current = window.setTimeout(() => setLocating(i), 150)
  }
  useEffect(() => {
    setLocating(null)
  }, [frame.candidates])
  const jobsFor = (i: number) => (result ? jobsSummary(tokenAncestry(result, frame.mode), i) : '')

  const hasPins = frame.candidates.some((c) => c.pin)

  // Mono lock. The padlock cycles unlocked → locked (via pick, memory, or the
  // single candidate) → unlocked-with-memory; the base itself is frame state.
  const locked = frame.monoBase != null && frame.candidates[frame.monoBase] != null
  const baseColor = locked ? frame.candidates[frame.monoBase!].color : null
  const parkedColor =
    frame.monoParked != null ? (frame.candidates[frame.monoParked]?.color ?? null) : null
  const lockClick = () => {
    if (picking) {
      setPicking(false)
    } else if (locked) {
      updateActive({ monoBase: null, monoParked: frame.monoBase })
    } else if (parkedColor != null) {
      updateActive({ monoBase: frame.monoParked, monoParked: null })
    } else if (frame.candidates.length === 1) {
      updateActive({ monoBase: 0, monoParked: null })
    } else if (frame.candidates.length > 1) {
      setPicking(true)
    }
  }
  const pickBase = (i: number) => {
    updateActive({ monoBase: i, monoParked: null })
    setPicking(false)
  }
  useEffect(() => {
    if (!picking) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])

  // How far the engine moved the user's colors — the slider's live caption.
  // Under the mono lock the only axis left is lightness, so it speaks in ΔL.
  const drift = useMemo(() => {
    if (!result) return { dE: 0, dL: 0 }
    const assigned = result.assignments.filter((a) => a.candidateIndex != null)
    if (assigned.length === 0) return { dE: 0, dL: 0 }
    return {
      dE: assigned.reduce((s, a) => s + a.deltaE, 0) / assigned.length,
      dL:
        assigned.reduce(
          (s, a) => s + Math.abs(frame.candidates[a.candidateIndex!].color.l - a.seed.l),
          0,
        ) / assigned.length,
    }
  }, [result, frame.candidates])
  const clashes = result?.repairs.length ?? 0
  const clashSuffix = clashes ? ` · ${clashes} clash${clashes > 1 ? 'es' : ''} reported` : ''
  const caption = !result
    ? 'add colors to forge a theme'
    : frame.fidelity >= 0.99
      ? `${locked ? 'mono · ' : ''}colors kept exactly${clashSuffix}`
      : locked
        ? drift.dL < 0.01
          ? 'mono — lightness already sits well'
          : `mono — varying lightness only · avg shift ΔL ${drift.dL.toFixed(2)}`
        : drift.dE < 0.015
          ? 'your colors already sit well — nothing to tune'
          : `${drift.dE >= 0.08 ? 'reworking' : 'gently tuning'} your colors · avg shift ΔE ${drift.dE.toFixed(2)}`

  // Audit status: report rows across both modes plus unresolved pairings.
  const checkStats = useMemo(() => {
    if (!result) return null
    const rows = [...result.light.report, ...result.dark.report]
    const fails = rows.filter((r) => !r.pass).length
    return { total: rows.length, fails, issues: fails + clashes }
  }, [result, clashes])
  const chipText = checkStats
    ? checkStats.issues === 0
      ? `✓ all ${checkStats.total} checks pass`
      : `⚠ ${checkStats.issues} issue${checkStats.issues > 1 ? 's' : ''} · ${[
          clashes ? `${clashes} clash${clashes > 1 ? 'es' : ''}` : '',
          checkStats.fails
            ? `${checkStats.fails} low-contrast pair${checkStats.fails > 1 ? 's' : ''}`
            : '',
        ]
          .filter(Boolean)
          .join(', ')}`
    : ''

  const split = frames.length === 2
  const emptyFrame = frame.candidates.length === 0
  const nColors = `${frame.candidates.length} color${frame.candidates.length === 1 ? '' : 's'}`

  const hero = (i: number) => (
    <StartHero
      onAddColors={(inputs) => addCandidatesAt(i, inputs)}
      onImage={(candidates) => startOverAt(i, candidates, null, 'extracted colors')}
      onPreset={(p) => startOverAt(i, candidatesFromList(p.colors), p.name, `started with ${p.name}`)}
    />
  )

  return (
    <div
      className="app"
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
    >
      <aside className="controls">
        <h1>themesmith</h1>
        <p className="tagline">any colors in, working theme out</p>

        {(!emptyFrame || split) && (
          <section>
            {frames.map((f, i) => (
              <div key={i} className={`frame-row ${active === i ? 'active' : ''}`}>
                <button
                  className={`frame-chip ${active === i ? 'active' : ''}`}
                  aria-label={`select ${FRAME_LABEL[i]}`}
                  onClick={() => setActive(i)}
                >
                  {active === i ? '●' : '○'} {FRAME_LABEL[i]}
                </button>
                <select
                  className="mockup-select"
                  aria-label={`mockup for ${FRAME_LABEL[i]}`}
                  value={f.mockup}
                  onChange={(e) => setMockup(i, e.target.value)}
                >
                  {MOCKUPS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-btn"
                  aria-label={`switch ${FRAME_LABEL[i]} to ${f.mode === 'light' ? 'dark' : 'light'}`}
                  title={
                    mockupById(f.mockup).supportsDark
                      ? `switch ${FRAME_LABEL[i]} to ${f.mode === 'light' ? 'dark' : 'light'}`
                      : `${mockupById(f.mockup).name} has no dark mode`
                  }
                  disabled={!mockupById(f.mockup).supportsDark}
                  onClick={() => toggleMode(i)}
                >
                  {f.mode === 'light' ? <Moon size={13} /> : <Sun size={13} />}
                </button>
                <button
                  className="icon-btn"
                  aria-label={split ? `copy → ${FRAME_LABEL[1 - i]}` : 'duplicate'}
                  title={split ? `copy → ${FRAME_LABEL[1 - i]}` : 'duplicate'}
                  onClick={() => duplicateFrame(i)}
                >
                  ⧉
                </button>
                {split && (
                  <button
                    className="icon-btn"
                    aria-label={`close ${FRAME_LABEL[i]}`}
                    title={`close ${FRAME_LABEL[i]}`}
                    onClick={() => closeFrame(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </section>
        )}

        {!emptyFrame && (
          <>
            <section>
              <div className="startover-row" ref={startOverRef}>
                <button
                  className="startover-btn"
                  aria-label="start over"
                  onClick={() => {
                    setStartOverPage('root')
                    setStartOverOpen((o) => !o)
                  }}
                >
                  ↻ start over
                </button>
                {frame.preset && <span className="startover-preset">{frame.preset}</span>}
                {result && (
                  <span className="riff-cluster">
                    {frame.seed > 0 && (
                      <>
                        <button
                          className="riff-back"
                          aria-label="previous riff"
                          title="back one riff"
                          onClick={() => riff(-1)}
                        >
                          ‹
                        </button>
                        <span className="riff-chip">riff {frame.seed}</span>
                      </>
                    )}
                    <button
                      className="riff-btn"
                      title="re-imagine the colors the engine invented"
                      onClick={() => riff(1)}
                    >
                      ⚄ riff
                    </button>
                  </span>
                )}
                {startOverOpen && (
                  <div className="menu startover-menu">
                    {startOverPage === 'root' ? (
                      <>
                        <button className="item" onClick={() => fileInputRef.current?.click()}>
                          from an image…
                        </button>
                        <button className="item" onClick={() => setStartOverPage('presets')}>
                          from a preset ›
                        </button>
                        <button
                          className="item"
                          onClick={() => {
                            setStartOverOpen(false)
                            startOverAt(active, [], null, `cleared ${nColors}`)
                          }}
                        >
                          start empty
                        </button>
                        <div className="menu-cap">
                          each of these replaces your current {nColors} — undo is one click
                        </div>
                      </>
                    ) : (
                      <>
                        <button className="item" onClick={() => setStartOverPage('root')}>
                          ‹ back
                        </button>
                        {PRESETS.map((p) => (
                          <button
                            key={p.name}
                            className={`item preset-item ${frame.preset === p.name ? 'sel' : ''}`}
                            onClick={() => {
                              setStartOverOpen(false)
                              startOverAt(
                                active,
                                candidatesFromList(p.colors),
                                p.name,
                                `started over with ${p.name}`,
                              )
                            }}
                          >
                            <PresetDots colors={p.colors} /> {p.name}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    setStartOverOpen(false)
                    if (file) void imageStartOver(active, file)
                    e.target.value = ''
                  }}
                />
              </div>
            </section>

            <hr className="divider" />

            <section>
              <div className="strip-actions">
                <button
                  className={`lock-btn${locked ? ' locked' : ''}${picking ? ' picking' : ''}`}
                  aria-label={
                    picking
                      ? 'cancel pick'
                      : locked
                        ? 'unlock mono'
                        : parkedColor
                          ? `re-lock ${toHex(parkedColor)}`
                          : 'lock the theme to one color'
                  }
                  title={
                    locked
                      ? 'unlock — back to the full-palette engine'
                      : parkedColor
                        ? `re-lock ${toHex(parkedColor)}`
                        : "lock the theme to one color's hue"
                  }
                  onClick={lockClick}
                >
                  {locked ? <Lock size={13} /> : <LockOpen size={13} />}
                  {locked && baseColor && (
                    <>
                      <span
                        className="lock-sw"
                        style={{ background: toHex(baseColor) }}
                        title="pick a different base"
                        onClick={(e) => {
                          if (frame.candidates.length > 1) {
                            e.stopPropagation()
                            setPicking(true)
                          }
                        }}
                      />
                      <code>{toHex(baseColor)}</code>
                    </>
                  )}
                  {!locked && parkedColor && (
                    <span className="lock-sw parked" style={{ background: toHex(parkedColor) }} />
                  )}
                </button>
                {hasPins && (
                  <button
                    className="ghost"
                    onClick={() =>
                      updateActive({
                        candidates: frame.candidates.map((c) => ({ ...c, pin: undefined })),
                        preset: null,
                      })
                    }
                  >
                    ↺ auto-assign colors
                  </button>
                )}
              </div>
              {picking && (
                <div className="lock-cap hint">click a color to lock its hue · esc to cancel</div>
              )}
              {locked && !picking && <div className="lock-cap">mono — engine invents no new hues</div>}
              <CandidateStrip
                candidates={frame.candidates}
                roleByCandidate={roleByCandidate}
                explain={explainCandidate}
                pinHint={pinHintFor}
                jobs={jobsFor}
                onLocate={onLocate}
                locatingIndex={locating}
                baseIndex={locked ? frame.monoBase : null}
                picking={picking}
                onPickBase={pickBase}
                onUpdate={updateCandidate}
                onRemove={removeCandidate}
                onReorder={reorderCandidate}
              />
              {invented.length > 0 && (
                <div className="invented-row">
                  <span className="invented-cap">invented</span>
                  {invented.map((a) => (
                    <button
                      key={a.role}
                      className="invented-item"
                      title="keep as your color"
                      aria-label={`keep ${a.role} as your color`}
                      onClick={() => keepInvented(a.role, a.seed)}
                    >
                      <i className="invented-sw" style={{ background: toHex(a.seed) }} />
                      {a.role}
                    </button>
                  ))}
                </div>
              )}
              <div className="add-row">
                <ColorAddField
                  placeholder="add a color — #e63946, oklch(…)"
                  has={inList}
                  onAdd={addCandidates}
                />
              </div>
            </section>

            <hr className="divider" />

            <section>
              <div className="fid-labels">
                <span className="fid-left">smith's taste</span>
                <span className="chip">{frame.fidelity.toFixed(2)}</span>
                <span className="fid-right">raw colors</span>
              </div>
              <input
                type="range"
                className="fid-slider"
                aria-label="fidelity"
                min={0}
                max={1}
                step={0.05}
                value={frame.fidelity}
                onChange={(e) => updateActive({ fidelity: parseFloat(e.target.value) })}
              />
              <div className="fid-caption">{caption}</div>
              {checkStats && (
                <button
                  className={`status-chip ${checkStats.issues ? 'warn' : 'ok'}`}
                  onClick={() => setReportOpen((o) => !o)}
                >
                  {chipText}
                  <span className="status-more">report ›</span>
                </button>
              )}
            </section>

            <hr className="divider" />

            <section>
              <div className="export-row" ref={exportRef}>
                <button
                  className="export-main"
                  disabled={!result}
                  title={split ? `copies frame ${FRAME_LABEL[active]}` : undefined}
                  onClick={() => void doExport(exportFormat)}
                >
                  ⧉ Copy {FORMAT_LABEL[exportFormat]}
                </button>
                <button
                  className="export-icon"
                  aria-label="choose export format"
                  disabled={!result}
                  onClick={() => setExportMenuOpen((o) => !o)}
                >
                  ▾
                </button>
                {exportMenuOpen && (
                  <div className="menu export-menu">
                    {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((f) => (
                      <button
                        key={f}
                        className={`item ${f === exportFormat ? 'sel' : ''}`}
                        onClick={() => {
                          setExportFormat(f)
                          setExportMenuOpen(false)
                          void doExport(f)
                        }}
                      >
                        {FORMAT_LABEL[f]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {exportMsg && <div className="export-msg">{exportMsg}</div>}
            </section>
          </>
        )}

        {emptyFrame && !split && (
          <p className="controls-empty">controls appear once you have colors</p>
        )}
      </aside>

      <main className="stage">
        {split ? (
          <div className="split">
            {frames.map((f, i) => (
              <div
                key={i}
                className={`split-pane ${active === i ? 'active' : ''}`}
                onClickCapture={() => setActive(i)}
              >
                <div className="frame-indicator">
                  {FRAME_LABEL[i]} · {f.mode}
                  {active === i ? ' · editing' : ''}
                </div>
                {results[i] ? (
                  <PreviewBoundary>
                    <FrameMockup
                      mockup={f.mockup}
                      result={results[i]!}
                      mode={f.mode}
                      uid={FRAME_LABEL[i].toLowerCase()}
                      locateIndex={active === i ? locating : null}
                    />
                  </PreviewBoundary>
                ) : (
                  hero(i)
                )}
              </div>
            ))}
          </div>
        ) : result ? (
          <PreviewBoundary>
            <FrameMockup
              mockup={frame.mockup}
              result={result}
              mode={frame.mode}
              uid="a"
              locateIndex={locating}
            />
          </PreviewBoundary>
        ) : (
          hero(active)
        )}
        {reportOpen && result && (
          <aside className="report-drawer">
            <div className="report-drawer-head">
              <span>report{split ? ` — frame ${FRAME_LABEL[active]}` : ''}</span>
              <button
                className="icon-btn"
                aria-label="close report"
                onClick={() => setReportOpen(false)}
              >
                ✕
              </button>
            </div>
            <ReportPanel result={result} candidates={frame.candidates} />
          </aside>
        )}
      </main>

      {dragOver && (
        <div
          className="drop-overlay"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void imageStartOver(active, file)
          }}
        >
          {frame.candidates.length > 0 ? (
            <>
              <b>drop to start over from this image</b>
              <span className="overlay-warn">replaces your current {nColors}</span>
              <span>you can undo right after</span>
            </>
          ) : (
            <b>drop to extract colors</b>
          )}
        </div>
      )}

      {toast && (
        <div className="toast">
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="toast-undo" onClick={undoStartOver}>
              undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
