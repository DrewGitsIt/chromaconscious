import { useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { ColorCandidate, Role } from '../engine'
import { ROLES, parseColor, toHex } from '../engine'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { useDismiss } from './useDismiss'
import './CandidateStrip.css'

interface Props {
  candidates: ColorCandidate[]
  roleByCandidate: Map<number, Role | 'chart' | 'unused'>
  /** Mono lock: index of the base candidate (shown with a static "base" badge). */
  baseIndex?: number | null
  /** Pick mode: rows become targets; clicking one crowns it the mono base. */
  picking?: boolean
  onPickBase?: (i: number) => void
  onUpdate: (i: number, patch: Partial<ColorCandidate>) => void
  onRemove: (i: number) => void
  onReorder: (from: number, to: number) => void
}

export function CandidateStrip({
  candidates,
  roleByCandidate,
  baseIndex = null,
  picking = false,
  onPickBase,
  onUpdate,
  onRemove,
  onReorder,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  // Which row's role menu is open. The badge shows the engine's decision;
  // clicking it opens the pin menu (auto · primary · accent · …).
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismiss(menuRef, menuIndex != null, () => setMenuIndex(null))

  const endDrag = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  if (candidates.length === 0) {
    return <div className="strip-empty">no candidates yet</div>
  }
  return (
    <ul className="candidate-strip">
      {candidates.map((c, i) => {
        const role = roleByCandidate.get(i)
        const isBase = i === baseIndex
        const dropTarget = dragIndex != null && overIndex === i && dragIndex !== i
        return (
          <li
            key={i}
            className={[
              role === 'unused' ? 'unused' : '',
              dropTarget ? 'drop-target' : '',
              dragIndex === i ? 'dragging' : '',
              isBase ? 'is-base' : '',
              picking ? 'pickable' : '',
            ].join(' ')}
            aria-label={picking ? `lock to ${c.raw}` : undefined}
            onClickCapture={
              picking
                ? (e) => {
                    // In pick mode the whole row is one target — swallow the
                    // clicks its inner controls would otherwise receive.
                    e.preventDefault()
                    e.stopPropagation()
                    onPickBase?.(i)
                  }
                : undefined
            }
            onDragOver={(e) => {
              if (dragIndex == null) return
              e.preventDefault()
              setOverIndex(i)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIndex != null) onReorder(dragIndex, i)
              endDrag()
            }}
          >
            <span
              className="drag-handle"
              draggable
              title="Drag to reorder — position sets prominence"
              aria-label={`Reorder ${c.raw}`}
              onDragStart={(e) => {
                setDragIndex(i)
                e.dataTransfer?.setData('text/plain', String(i))
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={endDrag}
            >
              <GripVertical size={14} />
            </span>
            <ColorSwatchPicker
              color={toHex(c.color)}
              onChange={(hex) => {
                const parsed = parseColor(hex)
                if (parsed) onUpdate(i, { color: parsed, raw: hex })
              }}
              title={`Edit ${c.raw}`}
            />
            <div className="candidate-meta">
              <code>{c.raw}</code>
              <div
                className="weight-bar"
                title={`prominence ${Math.round(c.weight * 100)}% — how strongly this color claims major roles; drag to change`}
              >
                <div className="weight-fill" style={{ width: `${Math.round(c.weight * 100)}%` }} />
              </div>
            </div>
            {isBase ? (
              <span
                className="badge badge-base"
                title="mono base — the padlock above controls this"
                style={{
                  background: toHex(c.color),
                  color: c.color.l > 0.6 ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.92)',
                }}
              >
                ⬤ base
              </span>
            ) : (
            <div className="picker-anchor" ref={menuIndex === i ? menuRef : undefined}>
              <button
                className={[
                  'badge',
                  'badge-ctl',
                  `badge-${role ?? 'unused'}`,
                  c.pin ? 'badge-pinned' : '',
                ].join(' ')}
                title={
                  c.pin
                    ? `pinned to ${c.pin} — click to change`
                    : `role: ${role ?? 'none'} — click to pin`
                }
                onClick={() => setMenuIndex(menuIndex === i ? null : i)}
              >
                {c.pin ?? role ?? '—'}
              </button>
              {menuIndex === i && (
                <div className="menu role-menu">
                  <button
                    className={`item ${!c.pin ? 'sel' : ''}`}
                    onClick={() => {
                      onUpdate(i, { pin: undefined })
                      setMenuIndex(null)
                    }}
                  >
                    auto
                  </button>
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      className={`item ${c.pin === r ? 'sel' : ''}`}
                      onClick={() => {
                        onUpdate(i, { pin: r })
                        setMenuIndex(null)
                      }}
                    >
                      pin to → {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
            <button className="candidate-remove" onClick={() => onRemove(i)} title="Remove">
              ✕
            </button>
          </li>
        )
      })}
    </ul>
  )
}
