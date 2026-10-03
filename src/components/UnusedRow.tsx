/**
 * "unused": colours of yours that hold no seat — extracted ones that didn't
 * win one, and ones you parked (a freed seat's colour lands here). A quiet row
 * under the seats, because nothing here is in the theme; clicking a chip asks
 * where to put it (or whether to remove it), so the row is the control.
 *
 * It replaces the bench drawer. The drawer hid exactly the colours an image
 * extraction left over, behind a bar you had to open to learn their hexes.
 *
 * Empty, it shrinks to its one label line, which stays as the place to drop
 * a seat to park it. (Hiding it and showing it only during a drag was tried:
 * the row popping in pushed the chart tray down under the pointer mid-drag.)
 */
import { useState } from 'react'
import type { DragEvent, ReactElement } from 'react'
import type { BenchEntry, DragPayload } from '../board'
import { DRAG_MIME } from '../board'
import { readPayload } from './chips'
import './UnusedRow.css'

export interface UnusedRowProps {
  entries: BenchEntry[]
  /** The set came from an image, so these were extracted. */
  extracted?: boolean
  /** Pulse once: a colour just landed here (e.g. added with every seat full). */
  flash?: boolean
  /** Open the "put it in a seat" popover for this colour. */
  onPick: (candidateIndex: number, anchor: HTMLElement) => void
  onDropToBench: (payload: DragPayload) => void
  onDragStartBench: (candidateIndex: number) => void
}

export function UnusedRow({
  entries,
  extracted = false,
  flash = false,
  onPick,
  onDropToBench,
  onDragStartBench,
}: UnusedRowProps): ReactElement {
  const [dropOk, setDropOk] = useState(false)

  const parked = entries.some((e) => e.parked)
  const read =
    entries.length === 0
      ? 'none · drop a seat here to park it'
      : parked
        ? 'parked, or didn’t win a seat'
        : extracted
          ? 'extracted · didn’t win a seat'
          : 'didn’t win a seat'

  return (
    <div
      className={['unused', entries.length === 0 ? 'is-empty' : '', dropOk ? 'drop-ok' : '', flash ? 'flashing' : ''].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropOk(true)
      }}
      onDragLeave={(e: DragEvent<HTMLElement>) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDropOk(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDropOk(false)
        const payload = readPayload(e)
        if (payload) onDropToBench(payload)
      }}
    >
      <div className="unused-head">
        <span className="unused-lbl">unused</span>
        <span className="unused-read">{read}</span>
      </div>
      {entries.length > 0 && (
        <div className="unused-row">
          {entries.map((entry) => (
            <button
              key={entry.candidateIndex}
              type="button"
              className="unused-chip"
              draggable
              title={`${entry.hex} — ${entry.parked ? 'you parked this' : 'didn’t win a seat'}. Put it in a seat.`}
              aria-label={`put ${entry.hex} in a seat`}
              onClick={(e) => onPick(entry.candidateIndex, e.currentTarget)}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  DRAG_MIME,
                  JSON.stringify({ kind: 'bench', candidateIndex: entry.candidateIndex }),
                )
                e.dataTransfer.effectAllowed = 'move'
                onDragStartBench(entry.candidateIndex)
              }}
            >
              <i style={{ background: entry.hex }} aria-hidden="true" />
              <span className="unused-hex">{entry.hex}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
