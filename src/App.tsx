import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Blend,
  Columns2,
  Guitar,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Undo2,
  X,
} from 'lucide-react'
import type { ColorCandidate, Role, ThemeResult, TokenAncestor } from './engine'
import {
  candidatesFromList,
  generateTheme,
  parseColor,
  ROLES,
  themeTailwind,
  themeTokensJson,
  toHex,
} from './engine'
import type { BoardView, DragPayload } from './board'
import {
  describePlacement,
  hasRiffableSeats,
  nameOf,
  readBoard,
  wouldTakeOver,
} from './board'
import { GLOSS, jobsForRole } from './roleCopy'
import type { Seat } from './roleCopy'
import type { ExportFormat } from './components/Preview'
import { Bench } from './components/Bench'
import { ColorAddField } from './components/ColorAddField'
import { Dial } from './components/Dial'
import { ExportRow } from './components/ExportRow'
import { FrameCard } from './components/FrameCard'
import { fileToCandidates } from './components/ImageDrop'
import { PresetDots } from './components/PresetDots'
import { PreviewBoundary } from './components/PreviewBoundary'
import { ReportPanel } from './components/ReportPanel'
import { RoleBoard } from './components/RoleBoard'
import { AssignPopover, RoleTooltip } from './components/RolePopover'
import { SeparationControl } from './components/SeparationControl'
import { SeriesTray } from './components/SeriesTray'
import { Section, SidebarShell } from './components/SidebarShell'
import { ShortcutsFlyout } from './components/Shortcuts'
import { SHORTCUTS, isTypingTarget, withKey } from './shortcuts'
import { StartHero } from './components/StartHero'
import { StatusChip } from './components/StatusChip'
import type { MockupProps } from './mockups'
import { MOCKUPS, mockupById } from './mockups'
import { PRESETS } from './presets'
import { useDismiss } from './components/useDismiss'
import type { Op, ThemeState } from './ops'
import { applyOp, emptyThemeState } from './ops'
import './styles/tokens.css'
import './styles/base.css'
import './App.css'

type Mode = 'light' | 'dark'

/** A theme's state (see ops.ts) plus how this frame shows it. */
interface FrameState extends ThemeState {
  mode: Mode
  /** Which design-space mockup this frame renders into. */
  mockup: string
}

/** What "start over" replaces — and what undo brings back. */
type StartOverState = Pick<FrameState, 'candidates' | 'preset' | 'monoBase' | 'seed'>

interface Toast {
  text: string
  undo: { frameIndex: number; prev: StartOverState } | null
}

/** Which popover is open, and off which element. */
type SeatMenu = { kind: 'explain' | 'assign'; seat: Seat; anchor: HTMLElement }

const FRAME_LABEL = ['A', 'B'] as const

const FORMAT_LABEL: Record<ExportFormat, string> = {
  css: 'CSS variables',
  tailwind: 'Tailwind v4 CSS',
  json: 'Design tokens JSON',
}
const EXPORT_FORMATS = (Object.keys(FORMAT_LABEL) as ExportFormat[]).map((id) => ({
  id,
  label: FORMAT_LABEL[id],
}))

const emptyFrameState = (): FrameState => ({ ...emptyThemeState(), mode: 'dark', mockup: 'app' })

/** Every seat and every chart slot already holds a colour of yours. */
const boardIsFull = (v: BoardView): boolean =>
  v.slots.every((s) => s.provenance !== 'derived') &&
  v.series.every((s) => s.provenance !== 'derived')

const cloneFrame = (f: FrameState): FrameState => ({
  ...f,
  candidates: f.candidates.map((c) => ({ ...c })),
})

/** Proper component wrapper so each mockup's hooks stay its own. */
function FrameMockup({ mockup, ...props }: { mockup: string } & MockupProps) {
  const M = mockupById(mockup).Component
  return <M {...props} />
}

/**
 * Keyed on the engine's inputs, not the frame object: switching mockup or
 * light/dark replaces the frame but not the theme, and used to rebuild it.
 */
function useThemeResult(f: FrameState | undefined) {
  const candidates = f?.candidates
  const fidelity = f?.fidelity
  const monoBase = f?.monoBase
  const seed = f?.seed
  const separation = f?.separation
  return useMemo(() => {
    if (!candidates || candidates.length === 0) return null
    try {
      return generateTheme({ candidates, fidelity, monoBase: monoBase ?? undefined, seed, separation })
    } catch (err) {
      console.error(err)
      return null
    }
  }, [candidates, fidelity, monoBase, seed, separation])
}

/**
 * The regenerate callback the placement probes (describePlacement,
 * wouldTakeOver) run once per option. They read only who sits where, and
 * casting happens before the riff walk and never depends on it — so the probe
 * builds at seed 0. At the frame's own seed each probe replayed the whole walk
 * for a board it then read nothing from: 65–273 ms per popover at hop 200.
 */
const probeCasting = (f: FrameState) => (next: ColorCandidate[]) =>
  generateTheme({
    candidates: next,
    fidelity: f.fidelity,
    monoBase: f.monoBase ?? undefined,
    separation: f.separation,
    seed: 0,
  })

export default function App() {
  // One or two independent frames. All sidebar edits target the active one;
  // the canvas splits when a second frame exists. Frames boot empty — the
  // first move belongs to the user, made in the stage's start hero.
  const [frames, setFrames] = useState<FrameState[]>(() => [emptyFrameState()])
  const [active, setActive] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  // Mono lock pick mode: the padlock was clicked, the board is the menu.
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
  const [copied, setCopied] = useState(false)
  // Board chrome: which popover is open, whether the bench is expanded, and
  // which seats just re-rolled (so they bounce once, then stop).
  const [seatMenu, setSeatMenu] = useState<SeatMenu | null>(null)
  const [benchOpen, setBenchOpen] = useState(false)
  const [benchFlash, setBenchFlash] = useState(false)
  const [rerolled, setRerolled] = useState<Role[]>([])
  // The keyboard map's flyout, and the add popover — which a key can open, so
  // its open state has to live out here rather than inside the control.
  const [helpOpen, setHelpOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const frame = frames[active]
  const updateFrame = (i: number, patch: Partial<FrameState>) => {
    setFrames((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }

  const results = [useThemeResult(frames[0]), useThemeResult(frames[1])]
  const result = results[active]

  // The board is a pure read of the engine's result — see src/board.ts.
  const view: BoardView | null = useMemo(
    () => (result ? readBoard(result, frame.candidates, frame.mode) : null),
    [result, frame.candidates, frame.mode],
  )

  // Every theme edit is an op (ops.ts) — the same verbs the remote API runs.
  // The active frame reuses the board already on screen; another frame's ops
  // (the start hero in split view) build their own.
  const dispatchTo = (i: number, op: Op) => {
    const f = frames[i]
    const next = applyOp(f, op, { mode: f.mode, view: i === active ? view : undefined })
    if (next !== f) updateFrame(i, next)
    return next !== f
  }
  const dispatch = (op: Op) => dispatchTo(active, op)

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
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } else {
      setToast({ text: 'copy failed', undo: null })
    }
  }

  // ---- candidate edits ----------------------------------------------------
  // Placement is explicit now, so an edit needs no seat-transfer detective
  // work: the board shows the consequence in the seat you just changed.
  const addCandidates = (inputs: string[]) => {
    const before = view
    if (!dispatch({ op: 'add', colors: inputs })) return
    // A colour that lands on a collapsed bench would vanish silently, and with
    // every seat already filled that is where it goes. Deliberately NOT
    // `hasRiffableSeats` — this asks "is the board full", which is a question
    // about seats, not about what riff may move.
    if (before && boardIsFull(before)) {
      setBenchFlash(true)
      setTimeout(() => setBenchFlash(false), 1000)
    }
  }
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
    dispatchTo(i, { op: 'start', candidates, preset })
    setPicking(false)
    setSeatMenu(null)
    if (prev.candidates.length > 0) {
      setToast({
        text: label,
        undo: {
          frameIndex: i,
          prev: {
            candidates: prev.candidates,
            preset: prev.preset,
            monoBase: prev.monoBase,
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

  // ---- riff ---------------------------------------------------------------
  // A hop walks every UNLOCKED seat — derived or yours alike. Capture which
  // ones those are so they bounce, then clear the flag so the next hop replays
  // it. (It used to capture the derived ones, back when those were the only
  // seats that could move.)
  const riff = () => {
    if (!view) return
    const moving = view.slots.filter((s) => !s.locked).map((s) => s.role)
    dispatch({ op: 'riff' })
    setSeatMenu(null)
    setRerolled(moving)
    setTimeout(() => setRerolled([]), 700)
  }
  const riffBack = () => {
    dispatch({ op: 'back' })
    setSeatMenu(null)
  }

  // ---- board verbs --------------------------------------------------------
  const applyDrop = (payload: DragPayload, target: { kind: 'role'; role: Role } | { kind: 'series' } | { kind: 'bench' }) => {
    if (!view) return
    // Resolve the dragged thing to a candidate index. A derived seat has no
    // candidate behind it, so it cannot be dragged anywhere.
    let idx: number | null = null
    if (payload.kind === 'bench') idx = payload.candidateIndex
    else if (payload.kind === 'slot') {
      idx = view.slots.find((s) => s.role === payload.role)?.candidateIndex ?? null
    } else {
      idx = view.series.find((s) => s.slot === payload.slot)?.candidateIndex ?? null
    }
    if (idx == null) return
    if (target.kind === 'role') dispatch({ op: 'place', index: idx, role: target.role })
    else if (target.kind === 'series') dispatch({ op: 'series', index: idx })
    else dispatch({ op: 'bench', index: idx })
  }

  /**
   * The lock is the only thing that stops riff moving a colour, so this is the
   * single control the board offers for it. Three cases, not two: a derived
   * seat has no candidate to carry a lock, so locking it means keeping it
   * first — that materialises one at exactly the colour on screen.
   */
  const toggleSeatLock = (role: Role) => {
    const slot = view?.slots.find((s) => s.role === role)
    if (slot) dispatch({ op: slot.locked ? 'unlock' : 'lock', role })
  }

  // A derived chart fill has no candidate behind it and no `keep` verb to
  // materialise one, so the tray only offers the lock on slots of yours.
  const toggleSeriesLock = (slot: number) => {
    const entry = view?.series.find((s) => s.slot === slot)
    if (entry) dispatch({ op: entry.locked ? 'unlockSeries' : 'lockSeries', slot })
  }

  const freeSeat = (role: Role) => {
    dispatch({ op: 'derive', role })
    setSeatMenu(null)
  }

  // ---- the assign popover's options and their consequences ----------------
  const assignOptions = useMemo(() => {
    if (!view || !result || !seatMenu || seatMenu.kind !== 'assign') return []
    const role = seatMenu.seat as Role
    const here = view.slots.find((s) => s.role === role)?.candidateIndex ?? null
    const regen = probeCasting(frame)
    const seen = new Set<number>()
    const out: Array<{ candidateIndex: number; hex: string; hint: string }> = []
    const add = (candidateIndex: number, hex: string) => {
      if (seen.has(candidateIndex) || candidateIndex === here) return
      seen.add(candidateIndex)
      // Probe the engine rather than predict from the current casting — see
      // describePlacement. Each probe is one sub-millisecond solve.
      out.push({ candidateIndex, hex, hint: describePlacement(frame.candidates, candidateIndex, role, view, regen) })
    }
    // Every option names the CANDIDATE's own hex, never the hex the board shows
    // for the seat it sits in — see nameOf. A seat displays the seed the engine
    // resolved (fidelity, repair, riff hop) and a tray swatch the chart-adjusted
    // token, so either would name a colour other than the one being seated.
    for (const b of view.bench) add(b.candidateIndex, b.hex)
    for (const group of [view.slots, view.series]) {
      for (const s of group) {
        const h = nameOf(frame.candidates, s.candidateIndex)
        if (h != null && s.candidateIndex != null) add(s.candidateIndex, h)
      }
    }
    return out
  }, [view, result, seatMenu, frame])

  // What would step in if this seat's holder left — so the popover names the
  // successor instead of promising a derived result it can't guarantee.
  const takeOver = useMemo(() => {
    if (!view || !seatMenu || seatMenu.kind !== 'assign') return null
    return wouldTakeOver(frame.candidates, seatMenu.seat as Role, view, probeCasting(frame))
  }, [view, seatMenu, frame])

  // ---- locate mode --------------------------------------------------------
  // Hovering a seat lights that seat's colour in the mockup. Debounced so
  // casual mouse travel doesn't strobe.
  //
  // Keyed by ROLE, not by candidate. A derived seat has no candidate behind
  // it, but it still owns tokens — a derived neutral drives the backgrounds,
  // text and borders — and "where does this colour show up?" is worth
  // answering whether or not the colour was yours. Locating used to bail out
  // on derived seats for a provenance reason that has nothing to do with the
  // question being asked.
  const [locating, setLocating] = useState<TokenAncestor | null>(null)
  const locateTimer = useRef<number | null>(null)
  const onLocateSeat = (role: Role | null) => {
    if (locateTimer.current != null) window.clearTimeout(locateTimer.current)
    locateTimer.current = null
    if (role == null || !view) {
      setLocating(null)
      return
    }
    locateTimer.current = window.setTimeout(() => setLocating({ kind: 'role', role }), 150)
  }
  useEffect(() => {
    setLocating(null)
  }, [frame.candidates])

  // ---- mono lock ----------------------------------------------------------
  const locked = frame.monoBase != null && frame.candidates[frame.monoBase] != null
  const anchorRole = useMemo(() => {
    if (!locked || !view) return null
    return view.slots.find((s) => s.candidateIndex === frame.monoBase)?.role ?? null
  }, [locked, view, frame.monoBase])
  /** The colour ruling the theme, named on the chip so the pick is visible. */
  const baseHex =
    frame.monoBase != null && frame.candidates[frame.monoBase]
      ? toHex(frame.candidates[frame.monoBase].color)
      : null
  // Engaging the lock ALWAYS asks which colour, once there is more than one to
  // choose. It used to remember the last base and silently restore it, which
  // saved a click and cost the ability to ever change your mind — off, on, and
  // you were back on the same base with no way to reach the picker again.
  const lockClick = () => {
    if (picking) setPicking(false)
    else if (locked) dispatch({ op: 'mono', index: null })
    else if (frame.candidates.length === 1) dispatch({ op: 'mono', index: 0 })
    else if (frame.candidates.length > 1) setPicking(true)
  }
  useEffect(() => {
    if (!picking) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])

  // ---- keyboard -----------------------------------------------------------
  // One key per control in the row, read from the same table its tooltips and
  // the flyout read (components/Shortcuts.tsx). Bare keys, so they are ignored
  // while a field has focus and whenever a modifier is down — Ctrl+R still
  // reloads the page, and typing a hex no longer riffs on its way past.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      // `?` is shift+/ on a US layout and the browser hands us the mapped
      // character — but only when the layout maps it that way, and automation
      // hands us the raw `/` instead. Accept both rather than trusting either.
      const pressed = e.key === '/' && e.shiftKey ? '?' : e.key.toLowerCase()
      const hit = SHORTCUTS.find((s) => s.key === pressed)
      if (!hit) return
      // Every branch below needs a forged theme; only help works without one.
      if (hit.id !== 'help' && (!view || emptyFrame)) return
      e.preventDefault()
      switch (hit.id) {
        case 'help':
          setHelpOpen((o) => !o)
          break
        case 'add':
          setAddOpen((o) => !o)
          break
        case 'mono':
          lockClick()
          break
        case 'riff':
          if (hasRiffableSeats(view!)) riff()
          break
        case 'back':
          if (frame.seed > 0) riffBack()
          break
        case 'reset':
          if (hasPlacements) dispatch({ op: 'reset' })
          break
        case 'startOver':
          setStartOverPage('root')
          setStartOverOpen((o) => !o)
          break
        case 'bench':
          setBenchOpen((o) => !o)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- the dial's live caption -------------------------------------------
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

  const checkStats = useMemo(() => {
    if (!result) return null
    const rows = [...result.light.report, ...result.dark.report]
    const fails = rows.filter((r) => !r.pass).length
    return { total: rows.length, fails, issues: fails + clashes }
  }, [result, clashes])
  const chipText = checkStats
    ? checkStats.issues === 0
      ? `all ${checkStats.total} checks pass`
      : `${checkStats.issues} issue${checkStats.issues > 1 ? 's' : ''} · ${[
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
  const hasPlacements = frame.candidates.some((c) => c.pin || c.benched)

  const hero = (i: number) => (
    <StartHero
      onAddColors={(inputs) => dispatchTo(i, { op: 'add', colors: inputs })}
      onImage={(candidates) => startOverAt(i, candidates, null, 'extracted colors')}
      onPreset={(p) => startOverAt(i, candidatesFromList(p.colors), p.name, `started with ${p.name}`)}
    />
  )

  const seatOf = (seat: Seat) =>
    seat === 'chart' ? null : (view?.slots.find((s) => s.role === seat) ?? null)

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
      <SidebarShell
        title="themesmith"
        tagline="any colors in, working theme out"
        footer={
          emptyFrame && !split ? null : (
            <div className="foot-stack">
              {checkStats && (
                <StatusChip
                  ok={checkStats.issues === 0}
                  text={chipText}
                  onOpenReport={() => setReportOpen((o) => !o)}
                />
              )}
              <ExportRow
                formats={EXPORT_FORMATS}
                current={exportFormat}
                copied={copied}
                disabled={!result}
                onCopy={(id) => void doExport(id as ExportFormat)}
                onChangeFormat={(id) => {
                  setExportFormat(id as ExportFormat)
                  void doExport(id as ExportFormat)
                }}
              />
            </div>
          )
        }
      >
        <div>
          {!emptyFrame && view && (
            <Section
              label="colors"
              actions={
                <span className="sec-tools" ref={startOverRef}>
                  {/* The header keeps exactly one verb. The other four moved to
                      the row below: five controls plus a data-dependent mono
                      label overran the header by 33px in the busiest state, and
                      `.sec-rule` bottoming out at its 8px floor turned the
                      overflow into a horizontal scrollbar under the sidebar
                      rather than anything you could see. */}
                  <button
                    className="mini ctl-head"
                    onClick={() => {
                      setStartOverPage('root')
                      setStartOverOpen((o) => !o)
                    }}
                    title={withKey('startOver', 'start over')}
                  >
                    <Palette size={12} strokeWidth={1.75} />
                    start over
                  </button>
                  {/* The keyboard map lives up here rather than in the row it
                      documents: the row runs 286px of a 287px box at its
                      busiest, and flex shrank this button to 10px — well under
                      the target floor everything else in the row now clears. */}
                  <button
                    className="mini ctl-head ctl-help"
                    onClick={() => setHelpOpen((o) => !o)}
                    aria-expanded={helpOpen}
                    aria-label="keyboard shortcuts"
                    title={withKey('help', 'keyboard shortcuts')}
                  >
                    ?
                  </button>
                  {helpOpen && <ShortcutsFlyout onClose={() => setHelpOpen(false)} />}
                  {startOverOpen && (
                    <div className="menu startover-menu">
                      {startOverPage === 'root' ? (
                        <>
                          <button className="item" onClick={() => fileInputRef.current?.click()}>
                            <ImageIcon size={13} strokeWidth={1.75} /> from an image…
                          </button>
                          <button className="item" onClick={() => setStartOverPage('presets')}>
                            <Palette size={13} strokeWidth={1.75} /> from a preset…
                          </button>
                          <button
                            className="item"
                            onClick={() => {
                              setStartOverOpen(false)
                              startOverAt(active, [], null, `cleared ${nColors}`)
                            }}
                          >
                            <Ban size={13} strokeWidth={1.75} /> start empty
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
                </span>
              }
            >
              {/* The palette's four verbs, spelled out. Nothing here appears or
                  disappears with state — `reset` and `back` grey out in place
                  rather than unmounting, so `riff` never slides out from under
                  a pointer that is about to press it again. */}
              <div className="ctl-row">
                <button
                  className={`ctl${locked ? ' on' : ''}${picking ? ' picking' : ''}`}
                  onClick={lockClick}
                  title={withKey(
                    'mono',
                    locked
                      ? `unlock — back to the full-palette engine (ruled by ${baseHex})`
                      : "lock the theme to one color's hue",
                  )}
                >
                  {/* Engaged, the glyph IS the base colour — it names the hue
                      ruling the theme in the space the icon was using anyway.
                      The label used to read the base's ROLE, which was always
                      "primary" because the base was crowned, so it said nothing. */}
                  {locked && baseHex ? (
                    <i className="mono-dot" style={{ background: baseHex }} aria-hidden="true" />
                  ) : (
                    <Blend size={12} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  mono
                </button>
                <button
                  className="ctl"
                  onClick={() => dispatch({ op: 'reset' })}
                  disabled={!hasPlacements}
                  title={withKey(
                    'reset',
                    hasPlacements
                      ? "clear your placements — back to the engine's own casting"
                      : 'nothing to reset — you have not placed a color by hand yet',
                  )}
                >
                  <RotateCcw size={12} strokeWidth={1.75} aria-hidden="true" />
                  reset
                </button>
                <button
                  className="ctl"
                  onClick={riff}
                  disabled={!hasRiffableSeats(view)}
                  title={withKey(
                    'riff',
                    hasRiffableSeats(view)
                      ? // NB avoid the substring "unlock" — the mono control
                        // beside this one is addressed by it in the e2e suite
                        'riff — walk the palette one hop; locked seats hold still'
                      : 'nothing to riff — every seat is locked',
                  )}
                >
                  <Guitar size={12} strokeWidth={1.75} aria-hidden="true" />
                  riff
                  {frame.seed > 0 && <span className="ctl-hop">{frame.seed}</span>}
                </button>
                <button
                  className="ctl"
                  onClick={riffBack}
                  disabled={frame.seed === 0}
                  title={withKey(
                    'back',
                    frame.seed > 0 ? 'back one riff' : 'no hops to step back through',
                  )}
                >
                  <Undo2 size={12} strokeWidth={1.75} aria-hidden="true" />
                  back
                </button>
              </div>
              {picking && (
                <div className="pick-hint">click a seat to lock its hue · esc to cancel</div>
              )}
              <RoleBoard
                view={view}
                openRole={seatMenu && seatMenu.seat !== 'chart' ? (seatMenu.seat as Role) : null}
                anchorRole={anchorRole}
                rerolled={rerolled}
                picking={picking}
                onPick={(role) => {
                  const idx = view.slots.find((s) => s.role === role)?.candidateIndex ?? null
                  // a derived seat has no colour of yours to lock onto
                  if (idx != null) dispatch({ op: 'mono', index: idx })
                  setPicking(false)
                }}
                onAssign={(role, anchor) => setSeatMenu({ kind: 'assign', seat: role, anchor })}
                onExplain={(role, anchor) => setSeatMenu({ kind: 'explain', seat: role, anchor })}
                onToggleLock={toggleSeatLock}
                onDropInRole={(payload, role) => applyDrop(payload, { kind: 'role', role })}
                onDragStartSlot={() => setSeatMenu(null)}
                onLocate={onLocateSeat}
              />

              <SeriesTray
                series={view.series}
                onDropInSeries={(payload) => applyDrop(payload, { kind: 'series' })}
                onDragStartSeries={() => setSeatMenu(null)}
                onToggleLock={toggleSeriesLock}
                onExplain={(anchor) => setSeatMenu({ kind: 'explain', seat: 'chart', anchor })}
              />

              <Bench
                entries={view.bench}
                open={benchOpen}
                flash={benchFlash}
                onToggle={() => setBenchOpen((o) => !o)}
                onDropToBench={(payload) => applyDrop(payload, { kind: 'bench' })}
                onDragStartBench={() => setSeatMenu(null)}
                onRemove={(i) => dispatch({ op: 'drop', index: i })}
              />

              {/* No wrapper: the control lays out its own row now, and the
                  `.add-row` box this sat in was a second, competing one. */}
              <ColorAddField
                placeholder="add a color — #e63946, oklch(…)"
                has={inList}
                onAdd={addCandidates}
                open={addOpen}
                onOpenChange={setAddOpen}
              />
            </Section>
          )}

          {!emptyFrame && (
            <Section label="tuning">
              <Dial
                value={frame.fidelity}
                caption={caption}
                onChange={(v) => dispatch({ op: 'fidelity', value: v })}
              />
              {/* Per-frame, like fidelity/mode/seed: two frames side by side at
                  different settings is how the trade reads clearest. */}
              <SeparationControl
                value={frame.separation}
                onChange={(s) => dispatch({ op: 'separation', value: s })}
              />
            </Section>
          )}

          {emptyFrame && !split && (
            <p className="controls-empty">controls appear once you have colors</p>
          )}
        </div>

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
      </SidebarShell>

      {/* ---- popovers: fixed-positioned, so no ancestor overflow clips them ---- */}
      {seatMenu?.kind === 'explain' && result && (
        <RoleTooltip
          role={seatMenu.seat}
          gloss={GLOSS[seatMenu.seat]}
          jobs={jobsForRole(result, frame.mode, seatMenu.seat)}
          anchor={seatMenu.anchor}
          onClose={() => setSeatMenu(null)}
        />
      )}
      {seatMenu?.kind === 'assign' && seatMenu.seat !== 'chart' && seatOf(seatMenu.seat) && (
        <AssignPopover
          role={seatMenu.seat as Role}
          hex={seatOf(seatMenu.seat)!.hex}
          provenance={seatOf(seatMenu.seat)!.provenance}
          options={assignOptions}
          takeOver={takeOver}
          anchor={seatMenu.anchor}
          onPick={(idx) => {
            dispatch({ op: 'place', index: idx, role: seatMenu.seat as Role })
            setSeatMenu(null)
          }}
          onAdjust={(hex) => {
            dispatch({ op: 'adjust', role: seatMenu.seat as Role, color: hex })
            setSeatMenu(null)
          }}
          onFree={() => freeSeat(seatMenu.seat as Role)}
          onClose={() => setSeatMenu(null)}
        />
      )}

      {/* The stage: a fixed, ruled drafting table the frames sit on. It is
          never a palette colour, so the frame's edge holds whatever theme is
          inside it — the sidebar and the frame used to share a surface, and
          the boundary vanished on any dark palette near #17181c. */}
      <main className="stage">
        {emptyFrame && !split ? (
          hero(active)
        ) : (
          <div className={`boards${split ? ' split' : ''}`}>
            {frames.map((f, i) => (
              <section
                key={i}
                className={`artboard${active === i ? ' active' : ''}`}
                aria-label={`frame ${FRAME_LABEL[i]}`}
                onClickCapture={split ? () => setActive(i) : undefined}
              >
                <FrameCard
                  label={FRAME_LABEL[i]}
                  active={active === i}
                  mockups={MOCKUPS.map((m) => ({ id: m.id, name: m.name }))}
                  mockup={f.mockup}
                  mode={f.mode}
                  supportsDark={mockupById(f.mockup).supportsDark}
                  copyTarget={split ? FRAME_LABEL[1 - i] : null}
                  onSelect={() => setActive(i)}
                  onChangeMockup={(id) => setMockup(i, id)}
                  onToggleMode={() => toggleMode(i)}
                  onCopyTo={() => duplicateFrame(i)}
                  actions={
                    split ? (
                      <button
                        className="board-btn"
                        onClick={() => closeFrame(i)}
                        title={`close frame ${FRAME_LABEL[i]}`}
                      >
                        <X size={13} strokeWidth={2} aria-hidden />
                        close {FRAME_LABEL[i]}
                      </button>
                    ) : (
                      <button
                        className="board-btn"
                        onClick={() => duplicateFrame(active)}
                        title="compare two frames"
                      >
                        <Columns2 size={13} strokeWidth={1.75} aria-hidden />
                        compare
                      </button>
                    )
                  }
                />
                <div className="frame">
                  {results[i] ? (
                    <PreviewBoundary>
                      <FrameMockup
                        mockup={f.mockup}
                        result={results[i]!}
                        mode={f.mode}
                        uid={FRAME_LABEL[i].toLowerCase()}
                        locateTarget={active === i ? locating : null}
                      />
                    </PreviewBoundary>
                  ) : (
                    hero(i)
                  )}
                </div>
              </section>
            ))}
          </div>
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
                <X size={13} strokeWidth={2} />
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

export { ROLES }
