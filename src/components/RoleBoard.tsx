/**
 * The role board: six labeled seats you fill, replacing the old candidate list.
 *
 * Each seat carries TWO targets, because it answers two different questions:
 *   the LABEL teaches  — "what is accent?"      → onExplain
 *   the COLOUR assigns — "what fills accent?"   → onAssign
 * plus one corner action on EVERY seat: the lock, which is the only thing that
 * stops riff moving that colour. On a derived seat locking is `keep` — there is
 * no candidate there to hang a lock on until one is materialised — so that one
 * button wears `.rb-keep` as well, and App picks the verb.
 *
 * Two independent visual languages, because they answer different questions:
 * solid vs dashed-with-the-colour-pooled-behind says where the colour came from
 * (`yours`/`kept` vs `derived`); the lock badge says whether riff may move it.
 * Locking used to be implied by the first, which is why a colour you dragged
 * into a seat silently stopped being riffable.
 *
 * NOTE the slot element itself is `draggable`; there is deliberately no
 * inset:0 drag overlay, because an overlay swallows clicks on the two buttons
 * underneath it — a real bug caught in the mockup.
 */
import { useState, type CSSProperties, type DragEvent, type ReactElement } from 'react'
import { Anchor, HelpCircle, Lock, LockOpen } from 'lucide-react'
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
  /** Seats that just moved on a riff hop — they play the bounce, staggered. */
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
  /**
   * Flip whether riff may move this seat. One handler for three cases —
   * unlock, lock, and lock-a-derived-seat (which has to keep it first) — since
   * only App knows which candidate, if any, sits behind the seat.
   */
  onToggleLock: (role: Role) => void
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

/** The lock's own sentence. It must never be inferred from provenance again. */
const lockTitle = (locked: boolean): string =>
  locked ? 'locked — riff will not move this' : 'unlocked — riff may move this'

export function RoleBoard({
  view,
  openRole,
  anchorRole,
  rerolled,
  onAssign,
  onExplain,
  onToggleLock,
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
        const { role, hex, sourceHex, provenance, locked } = slot
        const solid = provenance !== 'derived'
        const anchored = anchorRole === role
        const bounce = rerollOrder.get(role)

        // Chrome painted on a user colour asks the engine's own APCA solver
        // for its ink, so the sidebar is a live test of the thing being sold.
        // Derived seats get it too: they are shown at full strength now, so
        // the colour you judge is the colour you ship.
        const style = {
          '--c': hex,
          '--ink-on': readableInk(hex),
          '--well': wellOn(hex),
          '--well-strong': wellOn(hex, true),
          ...(bounce == null ? null : { animationDelay: `${bounce * 55}ms` }),
        } as CSSProperties

        const className = [
          'rb-slot',
          picking ? 'is-picking' : '',
          `rb-${provenance}`,
          locked ? 'is-locked' : '',
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
              // `hex` is the colour in the theme; `sourceHex` is what you typed,
              // and only appears when the two have parted company.
              title={`${hex} — ${TAG[provenance]}${sourceHex ? `, from ${sourceHex}` : ''}. Change what fills ${role}.`}
              aria-label={`${role} is ${hex}, ${TAG[provenance]} — change it`}
              onClick={(e) => onAssign(role, e.currentTarget)}
            >
              <span className="rb-hex">{hex}</span>
              <span className="rb-tag">{TAG[provenance]}</span>
            </button>

            {/* The lock. Sits on every seat, because every unlocked colour walks
                — including one you supplied. On a derived seat it doubles as
                `keep`, so it keeps that class and that meaning. */}
            <button
              type="button"
              className={solid ? 'rb-lock' : 'rb-lock rb-keep'}
              data-locked={locked ? 'true' : 'false'}
              // The seat is the drag source; grabbing its buttons should press
              // them, not haul the colour somewhere.
              draggable={false}
              title={lockTitle(locked)}
              aria-pressed={locked}
              aria-label={
                locked
                  ? `unlock ${role} — let riff move it again`
                  : solid
                    ? `lock ${role} — riff will leave ${hex} alone`
                    : `lock ${role} — keeps ${hex} as your colour`
              }
              onClick={() => onToggleLock(role)}
            >
              {locked ? (
                <Lock size={10} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <LockOpen size={10} strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
