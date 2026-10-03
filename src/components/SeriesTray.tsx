/**
 * The chart series tray.
 *
 * Chart is a pooled seat set — several colours at once — so it can't be a
 * single slot. It's a wide tray that takes drops anywhere on itself, and each
 * swatch says whether the engine computed it (dashed) or you did (solid).
 *
 * A swatch of yours also carries a lock, the only thing that stops riff moving
 * it. A derived fill has none: there is no candidate behind it to hang a lock
 * on, and unlike a role seat there is no `keep` verb here to materialise one —
 * so it is always riffable, and showing an inert padlock would only lie.
 */
import { useCallback, useState } from 'react'
import type { CSSProperties, DragEvent, ReactElement } from 'react'
import { HelpCircle, Lock, LockOpen } from 'lucide-react'
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

/** What a swatch is, in one word — provenance only; the lock speaks for itself. */
const ORIGIN: Record<SeriesEntry['provenance'], string> = {
  derived: 'the engine computed this',
  kept: 'kept as yours',
  yours: 'yours',
}

export interface SeriesTrayProps {
  series: SeriesEntry[]
  onDropInSeries: (payload: DragPayload) => void
  onDragStartSeries: (slot: number) => void
  /** Flip whether riff may move this slot's colour. Only sent for slots of yours. */
  onToggleLock: (slot: number) => void
  onExplain: (anchor: HTMLElement) => void
}

export function SeriesTray({
  series,
  onDropInSeries,
  onDragStartSeries,
  onToggleLock,
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

  // "N of 5" counts colours you own — a derived fill is the engine's, not yours.
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
              entry.locked ? 'is-locked' : '',
              dragSlot === entry.slot ? 'dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--c': entry.hex } as CSSProperties}
            draggable
            title={`${entry.hex} — ${ORIGIN[entry.provenance]}`}
            onDragStart={(e) => {
              writeDragPayload(e, { kind: 'series', slot: entry.slot })
              setDragSlot(entry.slot)
              onDragStartSeries(entry.slot)
            }}
            onDragEnd={() => setDragSlot(null)}
          >
            {entry.candidateIndex == null ? null : (
              <button
                type="button"
                className="series-lock"
                data-locked={entry.locked ? 'true' : 'false'}
                // the swatch is the drag source; the badge must press, not drag
                draggable={false}
                title={
                  entry.locked
                    ? 'locked — riff will not move this'
                    : 'unlocked — riff may move this'
                }
                aria-pressed={entry.locked}
                aria-label={`${entry.locked ? 'unlock' : 'lock'} chart ${entry.slot}`}
                onClick={() => onToggleLock(entry.slot)}
              >
                {entry.locked ? (
                  <Lock size={9} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <LockOpen size={9} strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
