import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ChevronDown, Copy, Eye, Moon, Sun } from 'lucide-react'
import type { Vision } from '../engine/cvd'
import { VISIONS } from '../engine/cvd'
import { withKey } from '../shortcuts'
import { useDismiss } from './useDismiss'
import './FrameCard.css'

export interface FrameCardProps {
  label: 'A' | 'B'
  active: boolean
  mockups: { id: string; name: string }[]
  mockup: string
  mode: 'light' | 'dark'
  supportsDark: boolean
  vision: Vision
  /** 0..1; how far toward the full dichromacy. Ignored for typical. */
  strength: number
  /** only rendered when a second frame exists */
  copyTarget: 'A' | 'B' | null
  /** Right-justified: how many frames exist — `compare`, or `close` once split. */
  actions?: ReactNode
  onSelect: () => void
  onChangeMockup: (id: string) => void
  onToggleMode: () => void
  onChangeVision: (vision: Vision, strength: number) => void
  onCopyTo: () => void
}

const VISION_HINT: Record<Vision, string> = {
  typical: 'as designed',
  protan: 'red-blind',
  deutan: 'green-blind',
  tritan: 'blue-blind',
}

/** `deutan · full`, `protan · 60%` — plain text, so a screenshot says what it is. */
const visionText = (vision: Vision, strength: number): string =>
  `${vision} · ${strength >= 1 ? 'full' : `${Math.round(strength * 100)}%`}`

/**
 * A frame's label row, sitting on the stage above the frame like an artboard
 * name — outside the frame, so it can never be mistaken for the mockup's own
 * UI. Left: what THIS frame is (which mockup, which mode, copying itself over
 * a sibling). Right: `actions`, which owns how many frames exist. Nothing here
 * is a readout; every item is a control.
 */
export function FrameCard({
  label,
  active,
  mockups,
  mockup,
  mode,
  supportsDark,
  vision,
  strength,
  copyTarget,
  actions,
  onSelect,
  onChangeMockup,
  onToggleMode,
  onChangeVision,
  onCopyTo,
}: FrameCardProps): ReactElement {
  const next = mode === 'light' ? 'dark' : 'light'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const eyeRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      eyeRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const simulating = vision !== 'typical'
  const pct = Math.round(strength * 100)
  return (
    <div className={`frame-card${active ? ' active' : ''}`}>
      <button
        className="frame-dot"
        aria-label={`edit frame ${label}`}
        aria-pressed={active}
        title={`edit frame ${label}`}
        onClick={onSelect}
      >
        {label}
      </button>
      <span className="frame-pick">
        <select
          className="frame-mockup"
          aria-label={`mockup for frame ${label}`}
          value={mockup}
          onChange={(e) => onChangeMockup(e.target.value)}
        >
          {mockups.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
      </span>
      <button
        className="frame-icon"
        aria-label={`switch frame ${label} to ${next}`}
        title={supportsDark ? `switch frame ${label} to ${next}` : 'this mockup has no dark mode'}
        disabled={!supportsDark}
        onClick={onToggleMode}
      >
        {mode === 'light' ? (
          <Moon size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <Sun size={14} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <span className="frame-vision" ref={ref}>
        <button
          ref={eyeRef}
          className={`frame-icon${simulating ? ' on' : ''}`}
          aria-label={`colorblind view for frame ${label}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-pressed={simulating}
          title={withKey('vision', `colorblind view for frame ${label}`)}
          onClick={() => setOpen((o) => !o)}
        >
          <Eye size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {open && (
          <div
            className="frame-vision-menu"
            role="dialog"
            aria-label={`colorblind view for frame ${label}`}
          >
            <div role="radiogroup" aria-label={`vision for frame ${label}`}>
              {VISIONS.map((v) => (
                <label key={v} className="frame-vision-opt">
                  <input
                    type="radio"
                    name={`vision-${label}`}
                    value={v}
                    checked={vision === v}
                    onChange={() => onChangeVision(v, strength)}
                  />
                  <span className="frame-vision-name">{v}</span>
                  <span className="frame-vision-hint">{VISION_HINT[v]}</span>
                </label>
              ))}
            </div>
            <label className="frame-vision-strength">
              <span>strength</span>
              <input
                type="range"
                min={10}
                max={100}
                step={10}
                value={pct}
                disabled={!simulating}
                aria-label={`vision strength for frame ${label}`}
                onChange={(e) => onChangeVision(vision, Number(e.target.value) / 100)}
              />
              <output>{pct}%</output>
            </label>
          </div>
        )}
        {simulating && <span className="frame-vision-tag">{visionText(vision, strength)}</span>}
      </span>
      {copyTarget !== null && (
        <button
          className="frame-icon"
          aria-label={`copy frame ${label} over frame ${copyTarget}`}
          title={`copy ${label} → ${copyTarget}`}
          onClick={onCopyTo}
        >
          <Copy size={14} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {actions == null ? null : <span className="frame-actions">{actions}</span>}
    </div>
  )
}
