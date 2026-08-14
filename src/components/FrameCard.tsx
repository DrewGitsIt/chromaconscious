import type { ReactElement } from 'react'
import { Copy, Moon, Sun } from 'lucide-react'
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
  onSelect: () => void
  onChangeMockup: (id: string) => void
  onToggleMode: () => void
  onCopyTo: () => void
}

/**
 * One frame, as a thing rather than a toolbar row. One verb per level: the
 * section header owns how many frames exist, this card owns what THIS frame
 * is — which mockup, which mode, and (only when a sibling exists) copying
 * itself over that sibling.
 */
export function FrameCard({
  label,
  active,
  mockups,
  mockup,
  mode,
  supportsDark,
  copyTarget,
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
      <button
        className="frame-icon"
        aria-label={`switch frame ${label} to ${next}`}
        title={supportsDark ? `switch frame ${label} to ${next}` : 'this mockup has no dark mode'}
        disabled={!supportsDark}
        onClick={onToggleMode}
      >
        {mode === 'light' ? (
          <Moon size={13} strokeWidth={1.75} aria-hidden />
        ) : (
          <Sun size={13} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {copyTarget !== null && (
        <button
          className="frame-icon"
          aria-label={`copy frame ${label} over frame ${copyTarget}`}
          title={`copy ${label} → ${copyTarget}`}
          onClick={onCopyTo}
        >
          <Copy size={13} strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </div>
  )
}
