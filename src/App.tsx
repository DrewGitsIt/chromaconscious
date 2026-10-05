import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Columns2,
  ExternalLink,
  Guitar,
  SlidersHorizontal,
  Undo2,
  X,
} from 'lucide-react'
import type { ColorCandidate, Role, TokenAncestor } from './engine'
import {
  candidatesFromList,
  contrastLevelName,
  generateTheme,
  parseColor,
  ROLES,
  toHex,
} from './engine'
import type { BoardView, DragPayload, SeatFailure } from './board'
import {
  describePlacement,
  hasRiffableSeats,
  lockedFailure,
  nameOf,
  readBoard,
  wouldTakeOver,
} from './board'
import { GLOSS, jobsForRole } from './roleCopy'
import type { Seat } from './roleCopy'
import { ExportButton } from './components/export/ExportButton'
import { ExportDialog } from './components/export/ExportDialog'
import type { ExportContext } from './components/export/formats'
import { EXPORT_FORMATS, visionParams } from './components/export/formats'
import { FrameCard } from './components/FrameCard'
import { XFADE_MS } from './components/chips'
import { fileToCandidates } from './components/ImageDrop'
import { PreviewBoundary } from './components/PreviewBoundary'
import { ReportPanel } from './components/ReportPanel'
import { AssignPopover, PlacePopover, PresetPopover, RoleTooltip, ShipPopover } from './components/RolePopover'
import type { PaneSection } from './components/SidebarShell'
import { SidebarShell } from './components/SidebarShell'
import { revealSection } from './components/rail'
import { ColorsSectionBody } from './components/sections/ColorsSection'
import { CompareSectionBody } from './components/sections/CompareSection'
import { InputSectionBody } from './components/sections/InputSection'
import { RiffSectionBody } from './components/sections/RiffSection'
import { TuningSectionBody } from './components/sections/TuningSection'
import { ShortcutsFlyout } from './components/Shortcuts'
import type { SectionId } from './shortcuts'
import { SHORTCUTS, isTypingTarget, withKey } from './shortcuts'
import { StatusChip } from './components/StatusChip'
import type { MockupProps } from './mockups'
import { MOCKUPS, mockupById } from './mockups'
import { PRESETS } from './presets'
import { EMBED, embedPreset, fullAppHref } from './embed'
import { decodeState, encodeState, themeId } from './api/state'
import { payloadState, statePayload } from './api/stateLink'
import { parseThemeHash } from './visionLink'
import { usePageSettings } from './usePageSettings'
import { pageLinkParams } from './pageSettings'
import type { Vision } from './engine/cvd'
import { VISIONS } from './engine/cvd'
import { VisionFilter } from './components/VisionFilter'
import { PortalScope } from './components/PortalContainer'
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
  /**
   * A colorblind simulation over this frame's mockup. View state like `mode`:
   * it never reaches the engine, and neither opening a link nor an op resets it.
   */
  vision: Vision
  /** 0..1, how far toward the full dichromacy. Meaningless for typical. */
  strength: number
  /**
   * The furthest riff hop walked since the set was last replaced — how far
   * the riff trail reaches. View state: going back keeps the hops ahead on
   * the trail (the walk is deterministic, so they are still exactly there).
   */
  trailMax: number
}

/** What "start over" replaces — and what undo brings back. */
type StartOverState = Pick<FrameState, 'candidates' | 'preset' | 'monoBase' | 'seed'>

interface Toast {
  text: string
  undo: { frameIndex: number; prev: StartOverState } | null
}

/**
 * Which popover is open, and off which element.
 *   explain — what a seat is for
 *   assign  — your colour for a seat (your chip, or "+ add")
 *   ship    — the colour a seat or chart row ships; `input` on a chart row
 *   place   — an unused colour: which seat?
 *   presets — start over from a preset, from the colours section's foot
 */
type SeatMenu =
  | { kind: 'explain' | 'assign'; seat: Seat; anchor: HTMLElement }
  | { kind: 'ship'; seat: Role; anchor: HTMLElement }
  | { kind: 'series'; slot: number; side: 'input' | 'output'; anchor: HTMLElement }
  | { kind: 'place'; candidateIndex: number; anchor: HTMLElement }
  | { kind: 'presets'; anchor: HTMLElement }

const FRAME_LABEL = ['A', 'B'] as const

const emptyFrameState = (): FrameState => ({
  ...emptyThemeState(),
  mode: 'dark',
  mockup: 'app',
  vision: 'typical',
  strength: 1,
  trailMax: 0,
})

/** The CSS filter for frame i's simulation (see VisionFilter), or null. */
const visionFilter = (f: FrameState, i: number): string | null =>
  f.vision === 'typical' ? null : `url(#vision-${FRAME_LABEL[i].toLowerCase()})`

/** Where the app opens: blank for the full app, a preset in an embed (see embed.ts). */
const initialFrame = (): FrameState => {
  const f = emptyFrameState()
  if (!EMBED) return f
  const p = embedPreset()
  return applyOp(f, { op: 'preset', name: p.name, colors: p.colors }, { mode: f.mode })
}

/** Every seat and every chart slot already holds a colour of yours. */
const boardIsFull = (v: BoardView): boolean =>
  v.slots.every((s) => s.provenance !== 'derived') &&
  v.series.every((s) => s.provenance !== 'derived')

const cloneFrame = (f: FrameState): FrameState => ({
  ...f,
  candidates: f.candidates.map((c) => ({ ...c })),
})

/**
 * The stage before a frame has colours. The ways in live in the pane's first
 * section now; this only says where, and that a drop works anywhere.
 */
function StageEmpty({ frame }: { frame?: string }) {
  return (
    <div className="stage-empty">
      <p>
        {frame ? `frame ${frame} is empty` : 'drop an image anywhere'}
        <br />
        {frame ? 'select it, then start in the sidebar' : 'or start in the sidebar'}
      </p>
    </div>
  )
}

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
  const contrast = f?.contrast
  return useMemo(() => {
    if (!candidates || candidates.length === 0) return null
    try {
      return generateTheme({ candidates, fidelity, monoBase: monoBase ?? undefined, seed, separation, contrast })
    } catch (err) {
      console.error(err)
      return null
    }
  }, [candidates, fidelity, monoBase, seed, separation, contrast])
}

/** How many hops the riff trail shows; older ones fold into "+N". */
const TRAIL_LEN = 10

/**
 * The riff trail's columns: each hop in the window as its six shipped seat
 * colours, under the frame's current settings — so a column is exactly where
 * a jump lands. Built off a deferred copy of the inputs, so a taste drag
 * repaints the board first and the trail catches up a frame later (eleven
 * builds cost ~12ms; the walk's trail cache makes each hop incremental).
 */
function useRiffTrail(f: FrameState) {
  const key = {
    candidates: f.candidates,
    fidelity: f.fidelity,
    monoBase: f.monoBase,
    separation: f.separation,
    contrast: f.contrast,
    max: Math.max(f.trailMax ?? 0, f.seed),
  }
  const d = useDeferredValue(key)
  const { candidates, fidelity, monoBase, separation, contrast, max } = d
  return useMemo(() => {
    if (candidates.length === 0 || max === 0) return { first: 0, columns: [] }
    const first = Math.max(0, max + 1 - TRAIL_LEN)
    const columns = []
    for (let hop = first; hop <= max; hop++) {
      const r = generateTheme({ candidates, fidelity, monoBase: monoBase ?? undefined, seed: hop, separation, contrast })
      columns.push({ hop, colors: ROLES.map((role) => toHex(r.assignments.find((a) => a.role === role)!.seed)) })
    }
    return { first, columns }
  }, [candidates, fidelity, monoBase, separation, contrast, max])
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
  const [frames, setFrames] = useState<FrameState[]>(() => [initialFrame()])
  // Corners and type: view state for both frames, never theme state.
  const { page, setRadius, setFont } = usePageSettings()
  const [active, setActive] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  // Mono lock pick mode: the padlock was clicked, the board is the menu.
  const [picking, setPicking] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Window-wide image drop + the undo toast that forgives any start-over.
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  // The Export dialog, and the id it exports under: `t_` + a hash of the
  // frame's state, the same id the API gives the same theme.
  const [exportOpen, setExportOpen] = useState(false)
  const [exportId, setExportId] = useState<string | null>(null)
  const exportBtnRef = useRef<HTMLButtonElement>(null)
  // Board chrome: which popover is open, whether the chart rows are unfolded,
  // and which seats just re-rolled (so they bounce once, then stop).
  const [seatMenu, setSeatMenu] = useState<SeatMenu | null>(null)
  const [chartOpen, setChartOpen] = useState(false)
  const [unusedFlash, setUnusedFlash] = useState(false)
  // Seats a riff hop is moving right now: their shipped chips cross-fade
  // (FadeChip) for the length of --d-xfade, then the flag clears.
  const [fading, setFading] = useState<Role[]>([])
  const fadeTimer = useRef<number | null>(null)
  // The keyboard map's flyout, and the add popover — which a key can open, so
  // its open state has to live out here rather than inside the control.
  const [helpOpen, setHelpOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // Which pane sections are folded. Shared by every frame: folding is about
  // what you want to look at, not about the theme. Anything absent is open.
  const [folded, setFolded] = useState<ReadonlySet<SectionId>>(() => new Set())
  const toggleSection = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id as SectionId)) next.add(id as SectionId)
      return next
    })
  // Embed only: the sidebar is a drawer over the stage (see embed.ts).
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

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
    const applied = applyOp(f, op, { mode: f.mode, view: i === active ? view : undefined })
    // The trail reaches the furthest hop walked; replacing the set starts it over.
    const trailMax = op.op === 'start' || op.op === 'preset' ? 0 : Math.max(f.trailMax ?? 0, applied.seed)
    const next = applied === f || trailMax === f.trailMax ? applied : { ...applied, trailMax }
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

  const setVision = (i: number, vision: Vision, strength: number) =>
    updateFrame(i, { vision, strength })

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

  // Hash only while the dialog is up; a theme with nothing in it has no export.
  useEffect(() => {
    if (!exportOpen || !result) return
    let live = true
    setExportId(null)
    void themeId(encodeState(frame)).then((id) => live && setExportId(id))
    return () => {
      live = false
    }
  }, [exportOpen, result, frame])
  useEffect(() => {
    if (!result) setExportOpen(false)
  }, [result])
  // One object per theme and view, so a lazy exporter's build is reused
  // across renders (figmaFormat caches on it) instead of rerun on each.
  const exportCtx = useMemo<ExportContext | null>(
    () =>
      exportId && result
        ? {
            result,
            state: frame,
            id: exportId,
            payload: statePayload(encodeState(frame)),
            origin: location.origin,
            linkParams: { ...visionParams(frame.vision, frame.strength), ...pageLinkParams(page) },
          }
        : null,
    [exportId, result, frame, page],
  )

  // ---- candidate edits ----------------------------------------------------
  // Placement is explicit now, so an edit needs no seat-transfer detective
  // work: the board shows the consequence in the seat you just changed.
  const addCandidates = (inputs: string[]) => {
    const before = view
    if (!dispatch({ op: 'add', colors: inputs })) return
    // With every seat already filled a new colour lands in "unused"; pulse it
    // so the add visibly went somewhere. Deliberately NOT `hasRiffableSeats` —
    // this asks "is the board full", a question about seats, not about riff.
    if (before && boardIsFull(before)) {
      setUnusedFlash(true)
      setTimeout(() => setUnusedFlash(false), 1000)
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

  /** The header's one verb: clear the set. Undoable from the toast. */
  const startEmpty = () => {
    if (frame.candidates.length === 0) return
    startOverAt(active, [], null, `cleared ${frame.candidates.length} color${frame.candidates.length === 1 ? '' : 's'}`)
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

  // ---- open a theme from a link -------------------------------------------
  // `#s=<payload>` carries the whole state (api/stateLink.ts) and opens with
  // no network. `#t_…` is a stored theme: every API summary that saved one
  // links here, and its state comes from the same API. Either way this app
  // runs the engine itself, so what opens is rebuilt locally from the state.
  useEffect(() => {
    const link = parseThemeHash(location.hash)
    if (!link) return
    const { vision } = link
    if (link.page.radius !== undefined) setRadius(link.page.radius)
    if (link.page.font !== undefined) setFont(link.page.font)
    const open = (state: ThemeState, note: string) => {
      // A vision link opens in compare: the theme as it is next to the theme
      // as it is seen, so the simulation never stands in for the real thing.
      setFrames((prev) => {
        const a = { ...prev[0], ...state }
        if (!vision) return prev.map((f, i) => (i === 0 ? a : f))
        return [
          { ...a, vision: 'typical', strength: 1 },
          { ...cloneFrame(a), vision: vision.vision, strength: vision.strength },
        ]
      })
      setActive(0)
      setToast({ text: note, undo: null })
    }
    if (link.state !== undefined) {
      // A malformed link opens the start screen with a quiet note; never a crash.
      try {
        open(decodeState(payloadState(link.state)), 'opened the theme in this link')
      } catch (err) {
        setToast({ text: `couldn't read this link: ${err instanceof Error ? err.message : String(err)}`, undo: null })
      }
      return
    }
    const { id } = link
    let live = true
    fetch(`/api/chromaconscious/v1/state?theme=${id}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`theme ${id} not found`))))
      .then((text) => {
        if (live) open(decodeState(text), `opened ${id}`)
      })
      .catch((err: unknown) => {
        if (live) setToast({ text: err instanceof Error ? err.message : `couldn't open ${id}`, undo: null })
      })
    return () => {
      live = false
    }
  }, [setRadius, setFont])

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
  // A hop walks every UNLOCKED seat — derived or yours alike — and moves only
  // the shipped column: your inputs never change. The seats that walk
  // cross-fade to the new colour; a locked seat is not in the list and does
  // not change, so it holds perfectly still. back and a trail jump are hops
  // too, and look the same.
  const hopTo = (op: Op) => {
    if (!view) return
    const moving = view.slots.filter((s) => !s.locked).map((s) => s.role)
    if (!dispatch(op)) return
    setSeatMenu(null)
    setFading(moving)
    if (fadeTimer.current != null) window.clearTimeout(fadeTimer.current)
    fadeTimer.current = window.setTimeout(() => setFading([]), XFADE_MS + 60)
  }
  const riff = () => hopTo({ op: 'riff' })
  const riffBack = () => hopTo({ op: 'back' })
  const jumpTo = (hop: number) => hopTo({ op: 'hop', hop })
  const trail = useRiffTrail(frame)

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
      // Every branch below needs a built theme; only help works without one.
      if (hit.id !== 'help' && (!view || emptyFrame)) return
      e.preventDefault()
      // A key aimed at a folded section opens it and brings it into view
      // first, so the press is never silent and its result is on screen. An
      // open section is left where it is: no scroll jump on every riff.
      if (hit.section && folded.has(hit.section)) {
        const id = hit.section
        setFolded((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        requestAnimationFrame(() => revealSection(id))
      }
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
          startEmpty()
          break
        case 'chart':
          setChartOpen((o) => !o)
          break
        case 'vision':
          setVision(active, VISIONS[(VISIONS.indexOf(frame.vision) + 1) % VISIONS.length], frame.strength)
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
    ? 'add colors to make a theme'
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
  // Locked seats that fail one of the engine's own checks — the contrast
  // report or a repair residual (see board.lockedFailure). Keeping them is the
  // default; the row warns and offers one fix.
  const failures = useMemo(() => {
    const out: Partial<Record<Role, SeatFailure>> = {}
    if (!result || !view) return out
    for (const s of view.slots) {
      if (!s.locked) continue
      const f = lockedFailure(result, s.role, frame.mode)
      if (f) out[s.role] = f
    }
    return out
  }, [result, view, frame.mode])

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

  const seatOf = (seat: Seat) =>
    seat === 'chart' ? null : (view?.slots.find((s) => s.role === seat) ?? null)

  // ---- compare: what differs between the two frames -----------------------
  const otherResult = split ? results[1 - active] : null
  const otherFrame = split ? frames[1 - active] : null
  const otherView: BoardView | null = useMemo(
    () => (otherResult && otherFrame ? readBoard(otherResult, otherFrame.candidates, otherFrame.mode) : null),
    [otherResult, otherFrame],
  )
  const compareRows = useMemo(() => {
    if (!view || !otherView) return []
    return ROLES.flatMap((role) => {
      const mine = view.slots.find((s) => s.role === role)?.hex
      const theirs = otherView.slots.find((s) => s.role === role)?.hex
      return mine && theirs && mine !== theirs ? [{ role, mine, theirs }] : []
    })
  }, [view, otherView])

  // ---- the pane's sections --------------------------------------------------
  // Each exists only once it applies: before any colour there is one section,
  // "input", and nothing greyed out beneath it. It becomes "colors" (a new key,
  // so it re-enters) with tuning and riff after it; compare joins only while
  // the stage is split. The shell numbers them and gives each a rail tick.
  const colorsActions = (
    <span className="sec-tools">
      {/* The header keeps exactly one verb. An image or a preset start over
          from the foot of this section, where the ways in fold once colours
          exist; this is the one way out. A plain button rather than a menu of
          one, and no confirm: the toast's undo forgives it, the same
          forgiveness every other replace-the-set gets. */}
      <button
        className="mini ctl-head"
        onClick={startEmpty}
        title={withKey('startOver', `start empty — clears your ${nColors}; undo is one click`)}
      >
        <Ban size={12} strokeWidth={1.75} />
        start empty
      </button>
      {/* The keyboard map lives up here rather than in the row it documents:
          flex squeezed it under the target floor there. */}
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
    </span>
  )

  const sections: PaneSection[] = []
  if (emptyFrame || !view) {
    sections.push({
      id: 'input',
      label: 'input',
      body: (
        <InputSectionBody
          onAddColors={(inputs) => dispatch({ op: 'add', colors: inputs })}
          onImage={(candidates) => startOverAt(active, candidates, null, 'extracted colors')}
          onPreset={(p) =>
            startOverAt(active, candidatesFromList(p.colors), p.name, `started with ${p.name}`)
          }
        />
      ),
    })
  } else {
    const yours = view.slots.filter((s) => s.provenance !== 'derived').length
    sections.push(
      {
        id: 'colors',
        label: 'colors',
        readout: `${yours} yours · ${view.slots.length - yours} derived`,
        actions: colorsActions,
        body: (
          <ColorsSectionBody
            controls={{
              locked,
              picking,
              baseHex,
              hasPlacements,
              onMono: lockClick,
              onReset: () => dispatch({ op: 'reset' }),
            }}
            board={{
              view,
              failures,
              openRole:
                (seatMenu?.kind === 'explain' || seatMenu?.kind === 'assign' || seatMenu?.kind === 'ship') &&
                seatMenu.seat !== 'chart'
                  ? (seatMenu.seat as Role)
                  : null,
              anchorRole,
              fading,
              picking,
              onPick: (role) => {
                const idx = view.slots.find((s) => s.role === role)?.candidateIndex ?? null
                // a derived seat has no colour of yours to lock onto
                if (idx != null) dispatch({ op: 'mono', index: idx })
                setPicking(false)
              },
              onEditInput: (role, anchor) => setSeatMenu({ kind: 'assign', seat: role, anchor }),
              onEditOutput: (role, anchor) => setSeatMenu({ kind: 'ship', seat: role, anchor }),
              // The one fix a failing lock offers: unlock, and the engine
              // re-derives from your colour.
              onDeriveSafely: (role) => dispatch({ op: 'deriveSafely', role }),
              onExplain: (role, anchor) => setSeatMenu({ kind: 'explain', seat: role, anchor }),
              onToggleLock: toggleSeatLock,
              onDropInRole: (payload, role) => applyDrop(payload, { kind: 'role', role }),
              onDragStartSlot: () => setSeatMenu(null),
              onLocate: onLocateSeat,
            }}
            tray={{
              series: view.series,
              fading: fading.length > 0,
              open: chartOpen,
              onToggle: () => setChartOpen((o) => !o),
              onEditInput: (slot, anchor) => setSeatMenu({ kind: 'series', slot, side: 'input', anchor }),
              onEditOutput: (slot, anchor) => setSeatMenu({ kind: 'series', slot, side: 'output', anchor }),
              onDropInSeries: (payload) => applyDrop(payload, { kind: 'series' }),
              onDragStartSeries: () => setSeatMenu(null),
              onToggleLock: toggleSeriesLock,
              onExplain: (anchor) => setSeatMenu({ kind: 'explain', seat: 'chart', anchor }),
            }}
            unused={{
              entries: view.bench,
              extracted: frame.candidates.some((c) => c.source === 'image'),
              flash: unusedFlash,
              onPick: (candidateIndex, anchor) => setSeatMenu({ kind: 'place', candidateIndex, anchor }),
              onDropToBench: (payload) => applyDrop(payload, { kind: 'bench' }),
              onDragStartBench: () => setSeatMenu(null),
            }}
            add={{ has: inList, onAdd: addCandidates, open: addOpen, onOpenChange: setAddOpen }}
            input={{
              onImage: () => fileInputRef.current?.click(),
              onPresets: (anchor) => setSeatMenu({ kind: 'presets', anchor }),
            }}
          />
        ),
      },
      {
        id: 'tuning',
        label: 'tuning',
        readout: `${frame.fidelity.toFixed(2)} · ${frame.separation} · ${contrastLevelName(frame.contrast) ?? frame.contrast.toFixed(2)}`,
        body: (
          <TuningSectionBody
            fidelity={frame.fidelity}
            caption={caption}
            separation={frame.separation}
            contrast={frame.contrast}
            onFidelity={(v) => dispatch({ op: 'fidelity', value: v })}
            onSeparation={(v) => dispatch({ op: 'separation', value: v })}
            onContrast={(v) => dispatch({ op: 'contrast', value: v })}
            page={{ page, onRadius: setRadius, onFont: setFont, applies: mockupById(frame.mockup).followsPage }}
          />
        ),
      },
      {
        id: 'riff',
        label: 'riff',
        readout: frame.seed > 0 ? `hop ${frame.seed}` : 'as derived',
        body: (
          <RiffSectionBody
            hop={frame.seed}
            canRiff={hasRiffableSeats(view)}
            onRiff={riff}
            onBack={riffBack}
            trail={trail}
            onJump={jumpTo}
          />
        ),
      },
    )
    if (split) {
      sections.push({
        id: 'compare',
        label: 'compare',
        readout: `${compareRows.length} differ · editing ${FRAME_LABEL[active]}`,
        body: (
          <CompareSectionBody
            editing={FRAME_LABEL[active]}
            rows={compareRows}
            onTake={(role, hex) => dispatch({ op: 'adjust', role, color: hex })}
          />
        ),
      })
    }
  }

  return (
    <div
      className={`app${EMBED ? ' embed' : ''}${drawerOpen ? ' drawer-open' : ''}`}
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
    >
      <SidebarShell
        title="ChromaConscious"
        tagline="any colors in, working theme out"
        sections={sections}
        folded={folded}
        onToggle={toggleSection}
        footer={
          <div className="foot-stack">
            {checkStats && (
              <StatusChip
                ok={checkStats.issues === 0}
                text={chipText}
                onOpenReport={() => setReportOpen((o) => !o)}
              />
            )}
            {/* Always here, greyed before any input: the one deliberate grey
                in the pane, because it answers "what do I get out of this?"
                before you have given it anything. */}
            <ExportButton
              ref={exportBtnRef}
              disabled={!result}
              captionId="exp-cap"
              open={exportOpen}
              onOpen={() => setExportOpen(true)}
            />
            {!result && (
              <p className="exp-cap" id="exp-cap">
                add a color to export CSS, Tailwind, Figma variables or a share link
              </p>
            )}
          </div>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void imageStartOver(active, file)
          e.target.value = ''
        }}
      />

      {exportOpen && result && (
        <ExportDialog
          formats={EXPORT_FORMATS}
          ctx={exportCtx}
          issues={checkStats?.issues ?? 0}
          kept={Object.entries(failures).map(([role, f]) => ({ role, short: f!.short }))}
          frameLabel={split ? FRAME_LABEL[active] : null}
          returnFocus={exportBtnRef}
          onClose={() => setExportOpen(false)}
        />
      )}

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
          hex={seatOf(seatMenu.seat)!.inputHex ?? seatOf(seatMenu.seat)!.hex}
          provenance={seatOf(seatMenu.seat)!.provenance}
          options={assignOptions}
          takeOver={takeOver}
          anchor={seatMenu.anchor}
          onPick={(idx) => {
            dispatch({ op: 'place', index: idx, role: seatMenu.seat as Role })
            setSeatMenu(null)
          }}
          onInput={(hex) => {
            dispatch({ op: 'input', role: seatMenu.seat as Role, color: hex })
            setSeatMenu(null)
          }}
          onFree={() => freeSeat(seatMenu.seat as Role)}
          onClose={() => setSeatMenu(null)}
        />
      )}
      {seatMenu?.kind === 'ship' && seatOf(seatMenu.seat) && (
        <ShipPopover
          key={`ship-${seatMenu.seat}`}
          name={seatMenu.seat}
          hex={seatOf(seatMenu.seat)!.hex}
          side="output"
          anchor={seatMenu.anchor}
          onApply={(hex) => {
            // locked as typed — the lock stays the only freeze
            dispatch({ op: 'adjust', role: seatMenu.seat, color: hex })
            setSeatMenu(null)
          }}
          onClose={() => setSeatMenu(null)}
        />
      )}
      {seatMenu?.kind === 'series' && view && (
        <ShipPopover
          key={`series-${seatMenu.slot}-${seatMenu.side}`}
          name={`chart ${seatMenu.slot}`}
          hex={
            (seatMenu.side === 'input'
              ? view.series[seatMenu.slot - 1]?.inputHex
              : view.series[seatMenu.slot - 1]?.hex) ?? view.series[seatMenu.slot - 1]?.hex ?? '#808080'
          }
          side={seatMenu.side}
          anchor={seatMenu.anchor}
          onApply={(hex) => {
            dispatch({ op: 'seriesColor', slot: seatMenu.slot, side: seatMenu.side, color: hex })
            setSeatMenu(null)
          }}
          onClose={() => setSeatMenu(null)}
        />
      )}
      {seatMenu?.kind === 'place' && view && frame.candidates[seatMenu.candidateIndex] && (
        <PlacePopover
          hex={toHex(frame.candidates[seatMenu.candidateIndex].color)}
          options={[
            ...view.slots.map((s) => ({
              target: s.role,
              hex: s.hex,
              holder: s.inputHex ?? 'derived',
            })),
            {
              target: 'chart' as const,
              hex: view.series.find((e) => e.candidateIndex == null)?.hex ?? view.series[0].hex,
              holder: `${view.series.filter((e) => e.candidateIndex != null && e.leadsFrom == null).length} of ${view.series.length} yours`,
            },
          ]}
          anchor={seatMenu.anchor}
          onPlace={(target) => {
            const index = seatMenu.candidateIndex
            dispatch(target === 'chart' ? { op: 'series', index } : { op: 'place', index, role: target })
            setSeatMenu(null)
          }}
          onRemove={() => {
            dispatch({ op: 'drop', index: seatMenu.candidateIndex })
            setSeatMenu(null)
          }}
          onClose={() => setSeatMenu(null)}
        />
      )}
      {seatMenu?.kind === 'presets' && (
        <PresetPopover
          presets={PRESETS}
          current={frame.preset}
          anchor={seatMenu.anchor}
          onPick={(p) => {
            setSeatMenu(null)
            startOverAt(active, candidatesFromList(p.colors), p.name, `started over with ${p.name}`)
          }}
          onClose={() => setSeatMenu(null)}
        />
      )}

      {/* The stage: a fixed, ruled drafting table the frames sit on. It is
          never a palette colour, so the frame's edge holds whatever theme is
          inside it — the sidebar and the frame used to share a surface, and
          the boundary vanished on any dark palette near #17181c. */}
      {EMBED && drawerOpen && (
        <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      )}
      <main className="stage">
        {emptyFrame && !split ? (
          <StageEmpty />
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
                  vision={f.vision}
                  strength={f.strength}
                  copyTarget={split ? FRAME_LABEL[1 - i] : null}
                  onSelect={() => setActive(i)}
                  onChangeMockup={(id) => setMockup(i, id)}
                  onToggleMode={() => toggleMode(i)}
                  onChangeVision={(v, s) => setVision(i, v, s)}
                  onCopyTo={() => duplicateFrame(i)}
                  actions={
                    EMBED ? (
                      <>
                        <button
                          className={`board-btn${drawerOpen ? ' on' : ''}`}
                          onClick={() => setDrawerOpen((o) => !o)}
                          aria-expanded={drawerOpen}
                          title="colors, taste and export"
                        >
                          <SlidersHorizontal size={13} strokeWidth={1.75} aria-hidden />
                          tune
                        </button>
                        <button
                          className="board-btn"
                          onClick={riff}
                          disabled={!view || !hasRiffableSeats(view)}
                          title="riff — walk the palette one hop"
                        >
                          <Guitar size={13} strokeWidth={1.75} aria-hidden />
                          riff
                        </button>
                        <button
                          className="board-btn"
                          onClick={riffBack}
                          disabled={frame.seed === 0}
                          title="back one riff"
                        >
                          <Undo2 size={13} strokeWidth={1.75} aria-hidden />
                          back
                        </button>
                        <a
                          className="board-btn"
                          href={fullAppHref()}
                          target="_blank"
                          rel="noopener"
                          title="open the full app in a new tab"
                        >
                          <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
                          open
                        </a>
                      </>
                    ) : split ? (
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
                <VisionFilter
                  id={`vision-${FRAME_LABEL[i].toLowerCase()}`}
                  vision={f.vision}
                  strength={f.strength}
                />
                {/* The filter sits on .frame itself, so everything the mockup
                    draws is simulated and the label row above never is. Its
                    menus and dialogs get the same filter on their own layer. */}
                <PortalScope filter={visionFilter(f, i)}>
                  <div
                    className="frame"
                    data-vision={f.vision === 'typical' ? undefined : f.vision}
                    style={f.vision === 'typical' ? undefined : { filter: visionFilter(f, i)! }}
                  >
                    {results[i] ? (
                      <PreviewBoundary>
                        <FrameMockup
                          mockup={f.mockup}
                          result={results[i]!}
                          mode={f.mode}
                          uid={FRAME_LABEL[i].toLowerCase()}
                          locateTarget={active === i ? locating : null}
                          page={page}
                        />
                      </PreviewBoundary>
                    ) : (
                      <StageEmpty frame={FRAME_LABEL[i]} />
                    )}
                  </div>
                </PortalScope>
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
