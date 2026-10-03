/**
 * The popovers a colour row can open.
 *
 * A row has three targets, and each answers a different question:
 *   the LABEL teaches         → <RoleTooltip>   "what is this role for?"
 *   YOUR colour (or + add)    → <AssignPopover> "what fills this seat?" — your
 *                               colours, a picker that sets your input (the
 *                               engine derives from it), and freeing the seat
 *   the colour that SHIPS     → <ShipPopover>   set it, locked as typed
 * and an unused colour opens <PlacePopover>: "put it in a seat".
 *
 * Both are `position: fixed` and measured off their anchor's viewport rect, so
 * no ancestor's `overflow` can clip them — the sidebar body scrolls, and an
 * absolutely-positioned popover inside it would be cut off at the fold.
 *
 * Neither owns any copy that depends on engine state: the gloss, the job list,
 * the per-option consequence hints and the take-over color are all passed in.
 * That keeps the one line that must never lie — what freeing a seat does —
 * answerable from a real engine probe rather than a guess made here.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { Check, SlidersHorizontal } from 'lucide-react'
import type { Role } from '../engine'
import type { Preset } from '../presets'
import { PresetDots } from './PresetDots'
import { EyeDropperButton } from './ColorSwatchPicker'
import { useDismiss } from './useDismiss'
import './RolePopover.css'

/** Viewport breathing room, and the gap between anchor and popover. */
const MARGIN = 8
const GAP = 6

interface Placement {
  left: number
  top: number
  /** True when there was no room below and the popover sits above the anchor. */
  flipped: boolean
}

/**
 * Pin a fixed-position element under (or over) its anchor, clamped to the
 * viewport. Measured with offsetWidth/offsetHeight rather than a rect, because
 * the enter animation scales the element and a rect would report it mid-flight.
 */
function usePlacement(anchor: HTMLElement, ref: RefObject<HTMLElement | null>): Placement | null {
  const [place, setPlace] = useState<Placement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const a = anchor.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Flip only when below genuinely doesn't fit AND above does; otherwise
      // stay below and let the clamp keep it on screen.
      const roomBelow = vh - MARGIN - (a.bottom + GAP)
      const roomAbove = a.top - GAP - MARGIN
      const flipped = h > roomBelow && roomAbove >= h
      const wanted = flipped ? a.top - GAP - h : a.bottom + GAP
      const left = Math.max(MARGIN, Math.min(a.left, vw - w - MARGIN))
      const top = Math.max(MARGIN, Math.min(wanted, vh - h - MARGIN))
      setPlace((prev) =>
        prev && prev.left === left && prev.top === top && prev.flipped === flipped
          ? prev
          : { left, top, flipped },
      )
    }

    measure()
    window.addEventListener('resize', measure)
    // Capture, so a scroll in the sidebar body (not just the window) re-pins us.
    window.addEventListener('scroll', measure, true)
    // The popover's own size can change after mount — the assign popover grows
    // when its adjust section opens — and a grown popover must re-clamp or its
    // tail runs off the bottom of the viewport.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      ro.disconnect()
    }
  }, [anchor, ref])

  return place
}

/**
 * Wiring shared by both popovers: outside-click dismissal (the app's own
 * `useDismiss`), Escape, and placement.
 *
 * The anchor guard exists because the anchor lives outside the popover's own
 * subtree: without it, a parent that opens on pointerdown would have its
 * opening press read as an outside click. Pressing the anchor again is the
 * parent's toggle, so we let it through untouched.
 */
function usePopover(anchor: HTMLElement, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const onAnchor = useRef(false)

  useEffect(() => {
    const mark = (e: PointerEvent) => {
      onAnchor.current = anchor.contains(e.target as Node)
    }
    // Capture phase, so this runs before useDismiss's document listener.
    document.addEventListener('pointerdown', mark, true)
    return () => document.removeEventListener('pointerdown', mark, true)
  }, [anchor])

  const dismiss = useCallback(() => {
    if (!onAnchor.current) onClose()
  }, [onClose])
  useDismiss(ref, true, dismiss)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const place = usePlacement(anchor, ref)
  const style: CSSProperties = {
    left: place ? place.left : 0,
    top: place ? place.top : 0,
    // One frame before measurement the popover has no home yet — hide it
    // rather than let it flash in the corner.
    visibility: place ? 'visible' : 'hidden',
    transformOrigin: place?.flipped ? 'bottom left' : 'top left',
  }

  return { ref, style }
}

// ---------------------------------------------------------------------------
// The teaching tooltip

export interface RoleTooltipProps {
  role: Role | 'chart'
  /** One-line plain-English gloss of what the role is for. */
  gloss: string
  /** Live job names, derived from the ancestry map by the caller. */
  jobs: string[]
  anchor: HTMLElement
  onClose: () => void
}

/** What a seat is for, and what it happens to be doing right now. */
export function RoleTooltip({ role, gloss, jobs, anchor, onClose }: RoleTooltipProps) {
  const { ref, style } = usePopover(anchor, onClose)

  return (
    <div ref={ref} className="rp-pop rp-tip" style={style} role="tooltip">
      <div className="rp-tip-name">{role === 'chart' ? 'Chart series' : role}</div>
      <p className="rp-tip-gloss">{gloss}</p>
      {jobs.length > 0 && (
        <>
          <div className="rp-label">does these jobs right now</div>
          <div className="rp-tip-jobs">
            {jobs.map((job) => (
              <span key={job} className="rp-tip-job">
                {job}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The assign popover

export interface AssignOption {
  candidateIndex: number
  hex: string
  /** The consequence of picking this one, computed by the caller. */
  hint: string
}

export interface AssignPopoverProps {
  role: Role
  /** What currently fills the seat. */
  hex: string
  provenance: 'yours' | 'kept' | 'derived'
  /** Your colors that could fill this seat. */
  options: AssignOption[]
  /** Who steps in if this seat is freed; null when the engine would invent one. */
  takeOver: { hex: string } | null
  anchor: HTMLElement
  onPick: (candidateIndex: number) => void
  /**
   * Commit a hand-picked colour as YOUR colour for this seat. The engine
   * derives from it at the current taste (and any lock is released).
   */
  onInput: (hex: string) => void
  onFree: () => void
  onClose: () => void
}

/**
 * Where the colour in this seat came from. It no longer answers "will riff
 * change this?" — the lock on the seat does, and it is the only thing that
 * does. A derived seat is the one case where the two still coincide: it has no
 * candidate to carry a lock, so it is always riffable.
 */
const PROVENANCE_SUB: Record<AssignPopoverProps['provenance'], string> = {
  yours: 'you placed this one',
  kept: 'derived, then kept by you',
  derived: 'derived — riff re-rolls it',
}

/** Which color goes in this seat — the transpose of the role list. */
export function AssignPopover({
  role,
  hex,
  provenance,
  options,
  takeOver,
  anchor,
  onPick,
  onInput,
  onFree,
  onClose,
}: AssignPopoverProps) {
  const { ref, style } = usePopover(anchor, onClose)
  const current = hex.toLowerCase()
  const derived = provenance === 'derived'
  // The picker's working colour. Nothing regenerates while it changes — the
  // engine only hears about it on apply, which is the whole submit contract.
  // Opened from "+ add" there is no colour of yours yet, so it starts open.
  const [adjusting, setAdjusting] = useState(derived)
  const [draft, setDraft] = useState(hex)

  return (
    <div
      ref={ref}
      className="rp-pop rp-asg"
      style={style}
      role="dialog"
      aria-label={`What fills ${role}?`}
    >
      <div className="rp-asg-head">
        <span className="rp-asg-sw" style={{ background: hex }} />
        <span className="rp-asg-head-txt">
          <span className="rp-asg-q">What fills {role}?</span>
          <span className="rp-asg-sub">{PROVENANCE_SUB[provenance]}</span>
        </span>
      </div>

      <div className="rp-label rp-asg-label">your colors</div>

      <div className="rp-asg-list">
        {options.map((o) => {
          const isCurrent = o.hex.toLowerCase() === current
          return (
            <button
              key={o.candidateIndex}
              type="button"
              className={isCurrent ? 'rp-opt rp-opt--cur' : 'rp-opt'}
              onClick={() => onPick(o.candidateIndex)}
            >
              <span className="rp-opt-sw" style={{ background: o.hex }} />
              <span className="rp-opt-txt">
                <span className="rp-opt-name rp-mono">{o.hex}</span>
                <span className="rp-opt-hint">{o.hint}</span>
              </span>
              {isCurrent && <Check className="rp-opt-check" size={13} strokeWidth={1.75} />}
            </button>
          )
        })}
        {options.length === 0 && (
          <p className="rp-asg-empty">no other colors of yours to put here</p>
        )}
      </div>

      {/* Changing your colour is a third act, distinct from reassigning and
          freeing. The drawer edits a draft; only apply hands it to the engine,
          which derives from it — the right-hand chip shows what it made. */}
      <button
        type="button"
        className="rp-opt rp-adjust-toggle"
        aria-expanded={adjusting}
        onClick={() => {
          setDraft(hex)
          setAdjusting((o) => !o)
        }}
      >
        <SlidersHorizontal className="rp-adjust-icon" size={13} strokeWidth={1.75} />
        <span className="rp-opt-txt">
          <span className="rp-opt-name">{derived ? `give ${role} a color of yours` : 'change your color'}</span>
          <span className="rp-opt-hint">the engine derives {role} from it</span>
        </span>
      </button>
      {adjusting && (
        <div className="rp-adjust">
          <HexColorPicker color={draft} onChange={setDraft} />
          <div className="rp-adjust-row">
            <HexColorInput
              color={draft}
              onChange={setDraft}
              prefixed
              aria-label={`new color for ${role}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onInput(draft)
              }}
            />
            <EyeDropperButton onPick={setDraft} />
            <button type="button" className="rp-adjust-apply" onClick={() => onInput(draft)}>
              apply
            </button>
          </div>
        </div>
      )}

      {/* The one line that must not lie: with colors to spare, freeing a seat
          lets another of yours step in — only name the engine when it truly
          has nothing left to cast. A derived seat has nothing to free. */}
      {!derived && (
        <button type="button" className="rp-opt rp-free" onClick={onFree}>
          <span className="rp-opt-sw rp-opt-sw--auto" />
          <span className="rp-opt-txt">
            <span className="rp-opt-name">free this seat</span>
            <span className="rp-opt-hint">
              {takeOver ? `${takeOver.hex} takes over` : 'the engine derives it'}
            </span>
          </span>
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The shipped colour, or a chart row's input: one picker and its promise

export interface ShipPopoverProps {
  /** "primary", "chart 2". */
  name: string
  hex: string
  /**
   * `output` sets what ships, locked as typed; `input` sets your colour and
   * the engine derives from it. The seats' input side uses AssignPopover.
   */
  side: 'input' | 'output'
  anchor: HTMLElement
  onApply: (hex: string) => void
  onClose: () => void
}

/** Set the colour a row ships (or, on a chart row, your colour behind it). */
export function ShipPopover({ name, hex, side, anchor, onApply, onClose }: ShipPopoverProps) {
  const { ref, style } = usePopover(anchor, onClose)
  const [draft, setDraft] = useState(hex)
  const output = side === 'output'
  return (
    <div
      ref={ref}
      className="rp-pop rp-asg rp-ship"
      style={style}
      role="dialog"
      aria-label={output ? `Set the color ${name} ships` : `Your color for ${name}`}
    >
      <div className="rp-asg-head">
        <span className="rp-asg-sw" style={{ background: hex }} />
        <span className="rp-asg-head-txt">
          <span className="rp-asg-q">{output ? `${name} ships as ${hex}` : `your ${name}`}</span>
          <span className="rp-asg-sub">
            {output
              ? 'Set the color that ships. It is locked as typed: taste and riff leave it alone, and your color takes the same value.'
              : 'Change what you supplied. The color that ships follows, at the current taste.'}
          </span>
        </span>
      </div>
      <div className="rp-adjust">
        <HexColorPicker color={draft} onChange={setDraft} />
        <div className="rp-adjust-row">
          <HexColorInput
            color={draft}
            onChange={setDraft}
            prefixed
            aria-label={output ? `color ${name} ships` : `your color for ${name}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onApply(draft)
            }}
          />
          <EyeDropperButton onPick={setDraft} />
          <button type="button" className="rp-adjust-apply" onClick={() => onApply(draft)}>
            {output ? 'lock' : 'apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// An unused colour: where does it go?

export interface PlaceOption {
  /** A role, or the chart series. */
  target: Role | 'chart'
  /** What that seat ships now (a swatch of the series for chart). */
  hex: string
  /** Who holds it now: your hex, "derived", or for chart "N of 5 yours". */
  holder: string
}

export interface PlacePopoverProps {
  hex: string
  options: PlaceOption[]
  anchor: HTMLElement
  onPlace: (target: Role | 'chart') => void
  /** Drop the colour from your set altogether. */
  onRemove: () => void
  onClose: () => void
}

/** Put an unused colour in a seat — whatever is there moves to unused. */
export function PlacePopover({ hex, options, anchor, onPlace, onRemove, onClose }: PlacePopoverProps) {
  const { ref, style } = usePopover(anchor, onClose)
  return (
    <div ref={ref} className="rp-pop rp-asg rp-place" style={style} role="dialog" aria-label={`Place ${hex}`}>
      <div className="rp-asg-head">
        <span className="rp-asg-sw" style={{ background: hex }} />
        <span className="rp-asg-head-txt">
          <span className="rp-asg-q rp-mono">{hex}</span>
          <span className="rp-asg-sub">Put it in a seat. Whatever is there now moves to unused.</span>
        </span>
      </div>
      <div className="rp-asg-list">
        {options.map((o) => (
          <button key={o.target} type="button" className="rp-opt" onClick={() => onPlace(o.target)}>
            <span className="rp-opt-sw" style={{ background: o.hex }} />
            <span className="rp-opt-txt">
              <span className="rp-opt-name">{o.target === 'chart' ? 'chart series' : o.target}</span>
              <span className="rp-opt-hint">{o.holder}</span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="rp-opt rp-free rp-remove" onClick={onRemove}>
        <span className="rp-opt-sw rp-opt-sw--auto" />
        <span className="rp-opt-txt">
          <span className="rp-opt-name">remove {hex}</span>
          <span className="rp-opt-hint">drop it from your colors</span>
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Start over from a preset, from the foot of the colours section

export interface PresetPopoverProps {
  presets: Preset[]
  /** The preset the set still belongs to, if any. */
  current: string | null
  anchor: HTMLElement
  onPick: (preset: Preset) => void
  onClose: () => void
}

export function PresetPopover({ presets, current, anchor, onPick, onClose }: PresetPopoverProps) {
  const { ref, style } = usePopover(anchor, onClose)
  return (
    <div ref={ref} className="rp-pop rp-asg rp-presets" style={style} role="dialog" aria-label="Start over from a preset">
      <div className="rp-asg-head">
        <span className="rp-asg-head-txt">
          <span className="rp-asg-q">Start over from a preset</span>
          <span className="rp-asg-sub">Replaces your colors; undo is one click. Tuning stays.</span>
        </span>
      </div>
      <div className="rp-asg-list">
        {presets.map((p) => (
          <button
            key={p.name}
            type="button"
            className={p.name === current ? 'rp-opt rp-opt--cur' : 'rp-opt'}
            onClick={() => onPick(p)}
          >
            <PresetDots colors={p.colors} />
            <span className="rp-opt-txt">
              <span className="rp-opt-name">{p.name}</span>
            </span>
            {p.name === current && <Check className="rp-opt-check" size={13} strokeWidth={1.75} />}
          </button>
        ))}
      </div>
    </div>
  )
}
