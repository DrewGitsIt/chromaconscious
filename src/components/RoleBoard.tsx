/**
 * The role board: six labeled seats you fill, replacing the old candidate list.
 *
 * Each seat carries TWO targets, because it answers two different questions:
 *   the LABEL teaches  — "what is accent?"      → onExplain
 *   the COLOUR assigns — "what fills accent?"   → onAssign
 * plus one hover action on derived seats: keep, which freezes the smith's
 * colour as yours so riff stops re-rolling it.
 *
 * Provenance is the whole visual language — solid means riff can't touch it
 * (`yours`/`kept`), dashed-with-the-colour-pooled-behind means it will
 * (`derived`). No legend required.
 *
 * NOTE the slot element itself is `draggable`; there is deliberately no
 * inset:0 drag overlay, because an overlay swallows clicks on the two buttons
 * underneath it — a real bug caught in the mockup.
 */
import { useState, type CSSProperties, type DragEvent, type ReactElement } from 'react'
import { Anchor, HelpCircle, Pin } from 'lucide-react'
import type { Role } from '../engine'
import { ROLES } from '../engine'
import type { BoardSlot, BoardView } from '../board'
import { readableInk, wellOn } from '../board'
import type { DragPayload } from '../board'

export type { DragPayload }
import './RoleBoard.css'


export interface RoleBoardProps {
  view: BoardView
  /** Popover currently open for this seat — the label reads as pressed. */
  openRole: Role | null
  /** Mono-lock base, gets an anchor badge. */
  anchorRole: Role | null
  /** Seats that just riffed — they play the bounce, staggered. */
  rerolled?: Role[]
  /**
   * Mono-lock pick mode: the WHOLE seat becomes one target. The hint says
   * "click a seat", so clicking the label or the padding must lock too —
   * not just the colour body.
   */
  picking?: boolean
  onPick?: (role: Role) => void
  onAssign: (role: Role, anchor: HTMLElement) => void
  onExplain: (role: Role, anchor: HTMLElement) => void
  onKeep: (role: Role) => void
  onDropInRole: (payload: DragPayload, role: Role) => void
  onDragStartSlot: (role: Role) => void
  /** Locate mode: the role on hover, null on leave. */
  onLocate: (role: Role | null) => void
}

/** The drag channel. One shape for bench chips, seats and series swatches. */
const MIME = 'application/json'

const isRole = (v: unknown): v is Role => ROLES.includes(v as Role)

/** Read a drag payload defensively — anything can be dropped on us. */
function readPayload(e: DragEvent<HTMLElement>): DragPayload | null {
  const raw = e.dataTransfer.getData(MIME)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const v = parsed as Record<string, unknown>
  if (v.kind === 'bench' && typeof v.candidateIndex === 'number') {
    return { kind: 'bench', candidateIndex: v.candidateIndex }
  }
  if (v.kind === 'slot' && isRole(v.role)) return { kind: 'slot', role: v.role }
  if (v.kind === 'series' && typeof v.slot === 'number') return { kind: 'series', slot: v.slot }
  return null
}

const TAG: Record<BoardSlot['provenance'], string> = {
  yours: 'yours',
  kept: 'kept',
  derived: 'derived',
}

export function RoleBoard({
  view,
  openRole,
  anchorRole,
  rerolled,
  onAssign,
  onExplain,
  onKeep,
  onDropInRole,
  onDragStartSlot,
  onLocate,
  picking = false,
  onPick,
}: RoleBoardProps): ReactElement {
  const [dropRole, setDropRole] = useState<Role | null>(null)
  const [dragRole, setDragRole] = useState<Role | null>(null)

  // Stagger by position within the batch that actually moved, so a lone
  // re-rolled seat bounces immediately rather than waiting its turn.
  const rerollOrder = new Map<Role, number>((rerolled ?? []).map((r, i) => [r, i]))

  return (
    <div className="role-board">
      {view.slots.map((slot) => {
        const { role, hex, provenance } = slot
        const solid = provenance !== 'derived'
        const anchored = anchorRole === role
        const bounce = rerollOrder.get(role)

        // Chrome painted on a user colour asks the engine's own APCA solver
        // for its ink, so the sidebar is a live test of the thing being sold.
        const style = {
          '--c': hex,
          ...(solid
            ? {
                '--ink-on': readableInk(hex),
                '--well': wellOn(hex),
                '--well-strong': wellOn(hex, true),
              }
            : null),
          ...(bounce == null ? null : { animationDelay: `${bounce * 55}ms` }),
        } as CSSProperties

        const className = [
          'rb-slot',
          picking ? 'is-picking' : '',
          `rb-${provenance}`,
          anchored ? 'is-anchored' : '',
          dropRole === role ? 'drop-ok' : '',
          dragRole === role ? 'is-dragging' : '',
          bounce == null ? '' : 'is-rerolling',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div
            key={role}
            className={className}
            style={style}
            data-role={role}
            // In pick mode the seat is one target: swallow the clicks its
            // inner buttons would otherwise take.
            onClickCapture={
              picking
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onPick?.(role)
                  }
                : undefined
            }
            draggable={solid && !picking}
            onDragStart={(e) => {
              if (!solid) return
              const payload: DragPayload = { kind: 'slot', role }
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData(MIME, JSON.stringify(payload))
              e.dataTransfer.setData('text/plain', hex)
              setDragRole(role)
              onDragStartSlot(role)
            }}
            onDragEnd={() => {
              setDragRole(null)
              setDropRole(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropRole(role)
            }}
            onDragLeave={(e) => {
              // Children fire dragleave as the pointer crosses them; only a
              // departure from the slot itself should clear the state.
              const to = e.relatedTarget
              if (to instanceof Node && e.currentTarget.contains(to)) return
              setDropRole((cur) => (cur === role ? null : cur))
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDropRole(null)
              setDragRole(null)
              const payload = readPayload(e)
              if (payload) onDropInRole(payload, role)
            }}
            onMouseEnter={() => onLocate(role)}
            onMouseLeave={() => onLocate(null)}
          >
            <div className="rb-top">
              <button
                type="button"
                className={`rb-name${openRole === role ? ' open' : ''}`}
                title={`what is ${role}?`}
                aria-expanded={openRole === role}
                onClick={(e) => onExplain(role, e.currentTarget)}
              >
                {role}
                <HelpCircle size={10} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {anchored ? (
                <span className="rb-anchor" title="mono base">
                  <Anchor size={11} strokeWidth={1.75} aria-hidden="true" />
                </span>
              ) : null}
            </div>

            <button
              type="button"
              className="rb-body"
              title={`${hex} — ${TAG[provenance]}. Change what fills ${role}.`}
              aria-label={`${role} is ${hex}, ${TAG[provenance]} — change it`}
              onClick={(e) => onAssign(role, e.currentTarget)}
            >
              <span className="rb-hex">{hex}</span>
              <span className="rb-tag">
                {provenance === 'kept' ? (
                  <Pin size={9} strokeWidth={1.75} className="rb-pinmark" aria-hidden="true" />
                ) : null}
                {TAG[provenance]}
              </span>
            </button>

            {provenance === 'derived' ? (
              <button
                type="button"
                className="rb-keep"
                title="keep this — riff will stop changing it"
                aria-label={`keep ${hex} as your ${role}`}
                onClick={() => onKeep(role)}
              >
                <Pin size={10} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
