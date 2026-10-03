/**
 * The chart series: five rows with the same grid as the seats —
 * `[your colour] [what happened] [what ships]` — folded by default under one
 * line that carries a swatch strip of what ships, so the folded state still
 * shows the series.
 *
 * Edits make the seats' two promises: your colour derives, the shipped colour
 * locks as typed. A row led by a role (chart-1 wearing the accent) is not a
 * series colour of its own; it changes through that role's row, and says so in
 * its middle cell instead of offering an edit that would unseat the accent.
 *
 * A row of yours also carries a lock, the only thing that stops riff moving
 * it. A derived row has none: there is no candidate behind it to hang a lock
 * on, so it is always riffable, and an inert padlock would only lie. Setting
 * its shipped colour is what makes one.
 */
import { useCallback, useState } from 'react'
import type { CSSProperties, DragEvent, ReactElement } from 'react'
import { ChevronDown, HelpCircle, Lock, LockOpen, Plus } from 'lucide-react'
import type { SeriesEntry } from '../board'
import { seatDelta } from '../board'
import type { DragPayload } from '../board'
import { DeltaCell } from './DeltaCell'
import { chipStyle, readPayload } from './chips'
import './SeriesTray.css'

const DRAG_MIME = 'application/json'

export interface SeriesTrayProps {
  series: SeriesEntry[]
  /** Unfolded. Folded by default; App owns it so a drop can open it. */
  open: boolean
  onToggle: () => void
  onEditInput: (slot: number, anchor: HTMLElement) => void
  onEditOutput: (slot: number, anchor: HTMLElement) => void
  onDropInSeries: (payload: DragPayload) => void
  onDragStartSeries: (slot: number) => void
  /** Flip whether riff may move this slot's colour. Only sent for slots of yours. */
  onToggleLock: (slot: number) => void
  onExplain: (anchor: HTMLElement) => void
}

export function SeriesTray({
  series,
  open,
  onToggle,
  onEditInput,
  onEditOutput,
  onDropInSeries,
  onDragStartSeries,
  onToggleLock,
  onExplain,
}: SeriesTrayProps): ReactElement {
  const [dropOk, setDropOk] = useState(false)
  const [dragSlot, setDragSlot] = useState<number | null>(null)

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>): void => {
      e.preventDefault()
      setDropOk(false)
      const payload = readPayload(e)
      if (payload) onDropInSeries(payload)
    },
    [onDropInSeries],
  )

  // "N of 5" counts colours you own — a derived fill is the engine's, not yours.
  const yours = series.filter((e) => e.provenance !== 'derived' && e.leadsFrom == null).length

  return (
    <div
      className={['tray', open ? 'open' : '', dropOk ? 'drop-ok' : ''].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropOk(true)
      }}
      onDragLeave={(e) => {
        // Ignore the leave events fired while crossing between rows.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDropOk(false)
      }}
      onDrop={handleDrop}
    >
      <div className="tray-top">
        <button
          type="button"
          className="tray-toggle"
          aria-expanded={open}
          onClick={onToggle}
          title={open ? 'fold the chart series' : 'show the chart series, one row per color'}
        >
          <span className="tray-name">chart</span>
          <span className="tray-cap">
            {yours} of {series.length} yours
          </span>
          {/* What ships, even folded: the strip is the series in miniature. */}
          <span className="tray-sum" aria-hidden="true">
            {series.map((e) => (
              <i key={e.slot} style={{ background: e.hex }} />
            ))}
          </span>
          <ChevronDown className="tray-chev" size={12} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tray-help"
          title="what is the chart series?"
          aria-label="what is the chart series?"
          onClick={(e) => onExplain(e.currentTarget)}
        >
          <HelpCircle size={11} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="tray-reveal">
        <div className="tray-set" inert={!open}>
          {series.map((entry) => {
            const own = entry.candidateIndex != null && entry.leadsFrom == null
            const delta = entry.inputHex && own ? seatDelta(entry.inputHex, entry.hex) : null
            const name = `chart ${entry.slot}`
            return (
              <div
                key={entry.slot}
                className={[
                  'series',
                  entry.leadsFrom ? 'led' : entry.provenance,
                  entry.locked ? 'is-locked' : '',
                  delta?.same ? 'is-same' : '',
                  dragSlot === entry.slot ? 'dragging' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-slot={entry.slot}
                style={{ '--c': entry.hex } as CSSProperties}
                draggable={own}
                onDragStart={(e) => {
                  if (!own) return
                  e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'series', slot: entry.slot }))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragSlot(entry.slot)
                  onDragStartSeries(entry.slot)
                }}
                onDragEnd={() => setDragSlot(null)}
              >
                {entry.leadsFrom ? (
                  <span className="series-led">{entry.leadsFrom} leads</span>
                ) : own && entry.inputHex ? (
                  <button
                    type="button"
                    className="rb-chip series-in"
                    style={chipStyle(entry.inputHex)}
                    draggable={false}
                    title={`your ${name}: ${entry.inputHex}. Change it and the engine derives from it.`}
                    aria-label={`your ${name} is ${entry.inputHex} — change it`}
                    onClick={(e) => onEditInput(entry.slot, e.currentTarget)}
                  >
                    <span className="rb-chip-hex">{entry.inputHex}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rb-add series-add"
                    draggable={false}
                    title="add a chart color of yours"
                    aria-label={`add a color of yours for ${name}`}
                    onClick={(e) => onEditInput(entry.slot, e.currentTarget)}
                  >
                    <Plus size={11} strokeWidth={1.75} aria-hidden="true" />
                    add
                  </button>
                )}
                <DeltaCell
                  delta={delta}
                  name={name}
                  derivedLabel={entry.leadsFrom ? `from ${entry.leadsFrom}` : undefined}
                />
                <button
                  type="button"
                  className={`rb-chip series-out${own ? '' : ' is-derived'}`}
                  style={chipStyle(entry.hex)}
                  draggable={false}
                  disabled={entry.leadsFrom != null}
                  title={
                    entry.leadsFrom
                      ? `${entry.hex} — chart 1 wears ${entry.leadsFrom}; change it in the ${entry.leadsFrom} row`
                      : `${entry.hex} — ${own ? 'yours' : 'derived'}. Set the color ${name} ships; it locks as typed.`
                  }
                  aria-label={`${name} ships as ${entry.hex}${entry.leadsFrom ? `, led by ${entry.leadsFrom}` : ' — set it'}`}
                  onClick={(e) => onEditOutput(entry.slot, e.currentTarget)}
                >
                  <span className="rb-chip-hex">{entry.hex}</span>
                </button>
                {own ? (
                  <button
                    type="button"
                    className="series-lock"
                    data-locked={entry.locked ? 'true' : 'false'}
                    draggable={false}
                    title={entry.locked ? 'locked — riff will not move this' : 'unlocked — riff may move this'}
                    aria-pressed={entry.locked}
                    aria-label={`${entry.locked ? 'unlock' : 'lock'} chart ${entry.slot}`}
                    onClick={() => onToggleLock(entry.slot)}
                  >
                    {entry.locked ? (
                      <Lock size={10} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <LockOpen size={10} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
