/**
 * The two popovers a seat on the role board can open.
 *
 * A seat has two targets, and each answers a different question:
 *   the LABEL teaches   → <RoleTooltip>   "what is this role for?"
 *   the COLOUR reassigns → <AssignPopover> "what fills this seat?"
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
  /** Commit a hand-picked colour for this seat; the theme rebuilds around it. */
  onAdjust: (hex: string) => void
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
  onAdjust,
  onFree,
  onClose,
}: AssignPopoverProps) {
  const { ref, style } = usePopover(anchor, onClose)
  const current = hex.toLowerCase()
  // The adjust drawer's working colour. Nothing regenerates while it changes —
  // the engine only hears about it on apply, which is the whole submit contract.
  const [adjusting, setAdjusting] = useState(false)
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

      {/* Adjusting is a third act, distinct from reassigning and freeing: the
          colour itself changes. The drawer edits a draft; only apply hands it
          to the engine. */}
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
          <span className="rp-opt-name">adjust this color</span>
          <span className="rp-opt-hint">pick a new value for {role}</span>
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
                if (e.key === 'Enter') onAdjust(draft)
              }}
            />
            <EyeDropperButton onPick={setDraft} />
            <button type="button" className="rp-adjust-apply" onClick={() => onAdjust(draft)}>
              apply
            </button>
          </div>
        </div>
      )}

      {/* The one line that must not lie: with colors to spare, freeing a seat
          lets another of yours step in — only name the engine when it truly
          has nothing left to cast. */}
      <button type="button" className="rp-opt rp-free" onClick={onFree}>
        <span className="rp-opt-sw rp-opt-sw--auto" />
        <span className="rp-opt-txt">
          <span className="rp-opt-name">free this seat</span>
          <span className="rp-opt-hint">
            {takeOver ? `${takeOver.hex} takes over` : 'the engine derives it'}
          </span>
        </span>
      </button>
    </div>
  )
}
