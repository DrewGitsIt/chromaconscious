/**
 * The bench — colors you brought that aren't in play.
 *
 * Collapsed by default, because a bench is a parking spot, not a workspace:
 * the bar alone has to say "something is parked here" (hence the dot row) and
 * has to accept a color dragged off a seat without being opened first.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, ReactElement } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { BenchEntry, DragPayload } from '../board'
import './Bench.css'

/**
 * What a drag across the board carries. Defined here and mirrored (structurally
 * identically) by the role board, so neither module owns the other.
 */
export type { DragPayload }

/** The one channel every board surface writes and reads. */
const DRAG_MIME = 'application/json'

/** Arm a drag with the shared payload. */
function writeDragPayload(e: DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'move'
}

/** Read a drop's payload, or null when it came from outside the board. */
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

/** How long the bar pulses when a color lands while the drawer is shut. */
const FLASH_MS = 900

export interface BenchProps {
  entries: BenchEntry[]
  open: boolean
  onToggle: () => void
  onDropToBench: (payload: DragPayload) => void
  onDragStartBench: (candidateIndex: number) => void
  onRemove: (candidateIndex: number) => void
  /** flash the bar when a color lands while collapsed */
  flash?: boolean
}

export function Bench({
  entries,
  open,
  onToggle,
  onDropToBench,
  onDragStartBench,
  onRemove,
  flash = false,
}: BenchProps): ReactElement {
  const innerRef = useRef<HTMLDivElement>(null)
  const [drawerHeight, setDrawerHeight] = useState(0)
  const [dropOk, setDropOk] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [pulsing, setPulsing] = useState(false)

  // `auto` can't be animated, so the drawer runs on a measured pixel height.
  // Re-measured whenever the contents can rewrap (chips added, sidebar resized).
  const contentKey = entries.map((entry) => entry.hex).join(',')
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const sync = (): void => setDrawerHeight(open ? inner.offsetHeight : 0)
    sync()
    if (!open) return
    const observer = new ResizeObserver(sync)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [open, contentKey])

  // The flash is a fixed-length pulse, not a state the parent has to unwind.
  useEffect(() => {
    if (!flash) {
      setPulsing(false)
      return
    }
    setPulsing(true)
    const timer = window.setTimeout(() => setPulsing(false), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  const handleDragOver = useCallback((e: DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropOk(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent): void => {
    // dragleave bubbles from the caret/label/dots too — only the real exit counts.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropOk(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent): void => {
      e.preventDefault()
      setDropOk(false)
      const payload = readDragPayload(e)
      if (payload) onDropToBench(payload)
    },
    [onDropToBench],
  )

  const count = entries.length
  const barClass = [
    'bench-bar',
    open ? 'open' : '',
    dropOk ? 'drop-ok' : '',
    pulsing ? 'flashing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="bench">
      <button
        type="button"
        className={barClass}
        aria-expanded={open}
        onClick={onToggle}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="bench-caret">
          <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="bench-label">
          bench · {count} color{count === 1 ? '' : 's'} not in play
        </span>
        {count > 0 && (
          <span className="bench-dots" aria-hidden="true">
            {entries.map((entry) => (
              <i key={entry.candidateIndex} style={{ background: entry.hex }} />
            ))}
          </span>
        )}
      </button>

      <div
        className="bench-drawer"
        style={{ height: `${drawerHeight}px` }}
        aria-hidden={!open}
        onDragOver={open ? handleDragOver : undefined}
        onDragLeave={open ? handleDragLeave : undefined}
        onDrop={open ? handleDrop : undefined}
      >
        <div className="bench-inner" ref={innerRef}>
          {count > 0 ? (
            <div className="bench-set">
              {entries.map((entry) => (
                <span
                  key={entry.candidateIndex}
                  className={
                    dragIndex === entry.candidateIndex ? 'benched dragging' : 'benched'
                  }
                  draggable
                  title={
                    entry.parked
                      ? `${entry.hex} — you parked this`
                      : `${entry.hex} — didn't win a seat`
                  }
                  onDragStart={(e) => {
                    writeDragPayload(e, {
                      kind: 'bench',
                      candidateIndex: entry.candidateIndex,
                    })
                    setDragIndex(entry.candidateIndex)
                    onDragStartBench(entry.candidateIndex)
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <i style={{ background: entry.hex } as CSSProperties} />
                  <span className="bench-hex">{entry.hex}</span>
                  <button
                    type="button"
                    className="bench-kill"
                    aria-label={`remove ${entry.hex}`}
                    title="remove"
                    tabIndex={open ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(entry.candidateIndex)
                    }}
                  >
                    <X size={10} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="bench-empty">every color you added is in play</div>
          )}
        </div>
      </div>
    </div>
  )
}
