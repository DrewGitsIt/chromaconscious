import type { ReactElement, ReactNode } from 'react'
import { ChevronDown, Copy, Moon, Sun } from 'lucide-react'
import './FrameCard.css'

export interface FrameCardProps {
  label: 'A' | 'B'
  active: boolean
  mockups: { id: string; name: string }[]
  mockup: string
  mode: 'light' | 'dark'
  supportsDark: boolean
  /** only rendered when a second frame exists */
  copyTarget: 'A' | 'B' | null
  /** Right-justified: how many frames exist — `compare`, or `close` once split. */
  actions?: ReactNode
  onSelect: () => void
  onChangeMockup: (id: string) => void
  onToggleMode: () => void
  onCopyTo: () => void
}

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
  copyTarget,
  actions,
  onSelect,
  onChangeMockup,
  onToggleMode,
  onCopyTo,
}: FrameCardProps): ReactElement {
  const next = mode === 'light' ? 'dark' : 'light'
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
