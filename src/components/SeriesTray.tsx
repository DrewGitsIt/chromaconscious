/**
 * The chart series tray.
 *
 * Chart is a pooled seat set — several colours at once — so it can't be a
 * single slot. It's a wide tray that takes drops anywhere on itself, and each
 * swatch says whether the smith computed it (dashed = riff may re-roll it) or
 * you did (solid = yours to keep).
 */
import { useCallback, useState } from 'react'
import type { CSSProperties, DragEvent, ReactElement } from 'react'
import { HelpCircle } from 'lucide-react'
import type { SeriesEntry } from '../board'
import { SERIES_SEATS } from '../board'
import type { DragPayload } from '../board'
import './SeriesTray.css'

const DRAG_MIME = 'application/json'

function writeDragPayload(e: DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'move'
}

function readDragPayload(e: DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
      return parsed as DragPayload
    }
    return null
  } catch {
    return null
  }
}

export interface SeriesTrayProps {
  series: SeriesEntry[]
  onDropInSeries: (payload: DragPayload) => void
  onDragStartSeries: (slot: number) => void
  onExplain: (anchor: HTMLElement) => void
}

export function SeriesTray({
  series,
  onDropInSeries,
  onDragStartSeries,
  onExplain,
}: SeriesTrayProps): ReactElement {
  const [dropOk, setDropOk] = useState(false)
  const [dragSlot, setDragSlot] = useState<number | null>(null)

  const handleDragOver = useCallback((e: DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropOk(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent): void => {
    // Ignore the leave events fired while crossing between swatches.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropOk(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent): void => {
      e.preventDefault()
      setDropOk(false)
      const payload = readDragPayload(e)
      if (payload) onDropInSeries(payload)
    },
    [onDropInSeries],
  )

  // "N of 5" counts colours you own — a derived fill is the smith's, not yours.
  const yours = series.filter((entry) => entry.provenance !== 'derived').length

  return (
    <div
      className={dropOk ? 'tray drop-ok' : 'tray'}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="tray-top">
        <button
          type="button"
          className="tray-name"
          onClick={(e) => onExplain(e.currentTarget)}
        >
          chart series
          <HelpCircle size={9} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span className="tray-cap">
          {yours} of {SERIES_SEATS}
        </span>
      </div>

      <div className="tray-set">
        {series.map((entry) => (
          <span
            key={entry.slot}
            className={[
              'series',
              entry.provenance,
              dragSlot === entry.slot ? 'dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--c': entry.hex } as CSSProperties}
            draggable
            title={`${entry.hex} — ${entry.provenance === 'derived' ? 'the smith computed this' : entry.provenance === 'kept' ? 'kept as yours' : 'yours'}`}
            onDragStart={(e) => {
              writeDragPayload(e, { kind: 'series', slot: entry.slot })
              setDragSlot(entry.slot)
              onDragStartSeries(entry.slot)
            }}
            onDragEnd={() => setDragSlot(null)}
          />
        ))}
      </div>
    </div>
  )
}
