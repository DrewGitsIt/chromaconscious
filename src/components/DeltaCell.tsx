/**
 * The middle cell of a colour row: what the engine did between your colour
 * (left) and the one that ships (right).
 *
 *   delta null       — no colour of yours: the seat is derived, and says so
 *   delta.same       — "=" over "same": the engine left your colour alone
 *   otherwise        — "→" over "ΔE .046" and the direction, in words
 *   failure          — a warning triangle and the failing number ("1.9:1");
 *                      the reason and the fix live on the line under the row
 *
 * The "=" and the "→" are one glyph — two bars that part into an equals sign
 * or close into a shaft and grow a head — so a later change (taste dragging,
 * a riff hop) can animate the one cell from "same" to "moved" without a swap.
 * The shaft's length scales with ΔE through `--len`, clamped so a tiny move is
 * still an arrow and a big one still fits.
 *
 * Every state is said in text as well as shape, and none of them by colour.
 */
import type { CSSProperties, ReactElement } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { SeatDelta, SeatFailure } from '../board'
import { formatDeltaE } from '../board'

export interface DeltaCellProps {
  /** Null when the seat has no colour of yours to measure from. */
  delta: SeatDelta | null
  /** A locked colour failing a check — wins over the delta. */
  failure?: SeatFailure | null
  /** What the row is, for the cell's tooltip ("primary", "chart 2"). */
  name: string
  /** Shown instead of "derived" on a row led by another seat ("accent"). */
  derivedLabel?: string
}

/** Arrow length in px for a ΔE: long enough to read, short enough to fit. */
const shaftLength = (e: number) => Math.max(14, Math.min(40, e * 520))

export function DeltaCell({ delta, failure, name, derivedLabel }: DeltaCellProps): ReactElement {
  if (failure) {
    return (
      <span className="dc dc-fail" data-kind="fail" title={`${name}: ${failure.reason}`}>
        <TriangleAlert size={13} strokeWidth={1.75} aria-hidden="true" />
        <span className="dc-short">{failure.short}</span>
      </span>
    )
  }
  if (!delta) {
    return (
      <span className="dc dc-derived" data-kind="derived" title={`${name}: derived by the engine`}>
        {derivedLabel ?? 'derived'}
      </span>
    )
  }
  const kind = delta.same ? 'same' : 'moved'
  return (
    <span
      className={`dc dc-${kind}`}
      data-kind={kind}
      style={{ '--len': `${delta.same ? 12 : shaftLength(delta.e)}px` } as CSSProperties}
      title={
        delta.same
          ? `${name}: the engine left your color as it is`
          : `${name}: ΔE ${delta.e.toFixed(3)}, ${delta.words}`
      }
    >
      <span className="dc-shaft" aria-hidden="true">
        <i className="dc-b1" />
        <i className="dc-b2" />
        <i className="dc-hd" />
      </span>
      <span className="dc-why">
        <b>{delta.same ? 'same' : `ΔE ${formatDeltaE(delta.e)}`}</b>
        {!delta.same && <span>{delta.words}</span>}
      </span>
    </span>
  )
}
