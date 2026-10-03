import type { ReactElement } from 'react'
import { Guitar, Undo2 } from 'lucide-react'
import { withKey } from '../../shortcuts'
import './sections.css'

/**
 * Section 3. The seam for the riff-motion piece (the trail of the last n
 * hops goes under this row).
 */
export interface RiffSectionBodyProps {
  /** Hops walked so far; 0 is the un-riffed theme. */
  hop: number
  /** False when every seat and every chart colour of yours is locked. */
  canRiff: boolean
  onRiff: () => void
  onBack: () => void
}

export function RiffSectionBody({ hop, canRiff, onRiff, onBack }: RiffSectionBodyProps): ReactElement {
  return (
    // Both stay mounted and grey out in place, so riff never slides out from
    // under a pointer about to press it again.
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
  )
}
