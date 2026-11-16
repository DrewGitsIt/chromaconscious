import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { Guitar, Undo2 } from 'lucide-react'
import { withKey } from '../../shortcuts'
import './sections.css'

/**
 * Section 3: riff and back, and under them the trail — the last ten hops as
 * columns of their six seat colours, newest on the right. Any column is a
 * jump to that hop; older hops fold into "+N", which jumps home to hop 0.
 * The walk is deterministic, so hops ahead of where you are stay on the
 * trail after `back` and land exactly where they were.
 */
export interface TrailColumn {
  hop: number
  /** The six seats' shipped colours at this hop, in ROLES order. */
  colors: string[]
}
export interface RiffSectionBodyProps {
  /** Hops walked so far; 0 is the un-riffed theme. */
  hop: number
  /** False when every seat and every chart colour of yours is locked. */
  canRiff: boolean
  onRiff: () => void
  onBack: () => void
  /** Columns from hop `first` to the furthest hop walked; empty before a riff. */
  trail?: { first: number; columns: TrailColumn[] }
  onJump?: (hop: number) => void
}

const ROLE_NAMES = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning']

export function RiffSectionBody({
  hop,
  canRiff,
  onRiff,
  onBack,
  trail,
  onJump,
}: RiffSectionBodyProps): ReactElement {
  // The trail is what a riff shows you. Riff sits last in the pane, so its
  // newest column used to land under the pinned footer; after every hop,
  // bring the trail into view (only as far as it takes).
  // The trail is built from a deferred copy of the state, so it lands a frame
  // after the hop does: follow the trail's own size, not just the hop.
  const trailRef = useRef<HTMLDivElement>(null)
  const seen = useRef<string | null>(null)
  const columns = trail?.columns.length ?? 0
  const trailKey = `${hop}:${trail?.first ?? 0}:${columns}`
  useEffect(() => {
    const before = seen.current
    seen.current = trailKey
    // not on mount: opening the section is not a riff
    if (before === null || columns === 0) return
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    trailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [trailKey, columns])
  return (
    <>
    {/* Both stay mounted and grey out in place, so riff never slides out from
        under a pointer about to press it again. */}
    <div className="ctl-row ctl-row-2">
      <button
        className="ctl"
        onClick={onRiff}
        disabled={!canRiff}
        title={withKey(
          'riff',
          canRiff
            ? // NB avoid the substring "unlock" — the mono control is
              // addressed by it in the e2e suite
              'riff — walk the palette one hop; locked seats hold still'
            : 'nothing to riff — every seat is locked',
        )}
      >
        <Guitar size={12} strokeWidth={1.75} aria-hidden="true" />
        riff
        {hop > 0 && <span className="ctl-hop">{hop}</span>}
      </button>
      <button
        className="ctl"
        onClick={onBack}
        disabled={hop === 0}
        title={withKey('back', hop > 0 ? 'back one riff' : 'no hops to step back through')}
      >
        <Undo2 size={12} strokeWidth={1.75} aria-hidden="true" />
        back
      </button>
    </div>
    {trail && trail.columns.length > 0 && (
      <div className="trail" role="group" aria-label="riff trail" ref={trailRef}>
        {trail.first > 0 && (
          <button
            type="button"
            className="trail-more"
            title={`${trail.first} older hop${trail.first > 1 ? 's' : ''} — jump home to hop 0`}
            aria-label={`jump to hop 0 (${trail.first} older hops)`}
            onClick={() => onJump?.(0)}
          >
            +{trail.first}
          </button>
        )}
        {trail.columns.map((c) => (
          <button
            key={c.hop}
            type="button"
            className={`hopcol${c.hop === hop ? ' cur' : ''}${c.hop > hop ? ' ahead' : ''}`}
            data-hop={c.hop}
            aria-pressed={c.hop === hop}
            aria-label={c.hop === 0 ? 'jump to hop 0, as derived' : `jump to hop ${c.hop}`}
            title={`${c.hop === 0 ? 'hop 0: as derived' : `hop ${c.hop}`} — ${c.colors
              .map((x, i) => `${ROLE_NAMES[i]} ${x}`)
              .join(', ')}`}
            onClick={() => onJump?.(c.hop)}
          >
            {c.colors.map((x, i) => (
              <i key={i} style={{ background: x }} />
            ))}
            <span>{c.hop}</span>
          </button>
        ))}
      </div>
    )}
    </>
  )
}
