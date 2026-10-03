/**
 * The colour rows: one per seat, `[your colour] [what happened] [what ships]`,
 * with the role's name above.
 *
 * Input and derived used to be two places — a list of your colours and a board
 * of seats — and the question that mattered most, "what did the engine do to
 * MY colour?", was answered only in a tooltip. Now every seat is the same grid
 * and the middle cell says it: "=" when nothing moved, an arrow and the ΔE in
 * words when something did (see DeltaCell). Both chips always show, even when
 * they agree; a spanning chip would make "unchanged" a different shape.
 *
 * Both sides are editable, and they make opposite promises:
 *   your colour (left)  — the engine derives from it at the current taste
 *   what ships (right)  — locked as typed; the left takes the same value
 * A seat with no colour of yours has an empty left cell, and that cell is the
 * "+ add" verb rather than a placeholder.
 *
 * The lock is still the one thing that freezes a colour, and it sits on every
 * row. On a derived seat it is `keep` (no candidate to hang a lock on until one
 * is materialised), so it also wears `.rb-keep` and App picks the verb.
 *
 * A locked colour that fails a check keeps its place — shipping it is allowed —
 * but the middle cell turns into a warning, a line under the row says why, and
 * one button offers the fix: derive safely, which is the unlock.
 *
 * The row is the drag source (only rows holding a colour of yours), and a drop
 * target for any colour; the chips are buttons, never drag handles.
 */
import { useRef, useState, type ReactElement } from 'react'
import { Anchor, HelpCircle, Lock, LockOpen, Plus, TriangleAlert } from 'lucide-react'
import type { Role } from '../engine'
import type { BoardSlot, BoardView, SeatFailure } from '../board'
import { seatDelta } from '../board'
import type { DragPayload } from '../board'
import { DeltaCell } from './DeltaCell'
import { FadeChip } from './FadeChip'
import { DRAG_MIME as MIME, chipStyle, readPayload } from './chips'

export type { DragPayload }
import './RoleBoard.css'

export interface RoleBoardProps {
  view: BoardView
  /** Locked seats failing a check, by role (see board.lockedFailure). */
  failures?: Partial<Record<Role, SeatFailure>>
  /** Popover currently open for this seat — the label reads as pressed. */
  openRole: Role | null
  /** Mono-lock base, gets an anchor badge. */
  anchorRole: Role | null
  /**
   * Seats a riff hop (or a trail jump) is moving right now: their shipped
   * chip cross-fades to the new colour. Everything else snaps — a taste drag
   * follows your hand — and a locked seat does not change, so it holds still.
   */
  fading?: Role[]
  /**
   * Mono-lock pick mode: the WHOLE row becomes one target. The hint says
   * "click a seat", so clicking the label or the padding must lock too.
   */
  picking?: boolean
  onPick?: (role: Role) => void
  /** Your colour's chip, or the "+ add" cell: what you supply for this seat. */
  onEditInput: (role: Role, anchor: HTMLElement) => void
  /** The shipped colour's chip: set it, locked as typed. */
  onEditOutput: (role: Role, anchor: HTMLElement) => void
  /** The failing lock's one fix: unlock and let the engine re-derive. */
  onDeriveSafely: (role: Role) => void
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

const TAG: Record<BoardSlot['provenance'], string> = {
  yours: 'yours',
  kept: 'kept',
  derived: 'derived',
}

/** The lock's own sentence. It must never be inferred from provenance again. */
const lockTitle = (locked: boolean): string =>
  locked ? 'locked — riff and taste will not move this' : 'unlocked — riff and taste may move this'

export function RoleBoard({
  view,
  failures = {},
  openRole,
  anchorRole,
  fading,
  onEditInput,
  onEditOutput,
  onDeriveSafely,
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
  const located = useRef<Role | null>(null)

  const fadingSet = new Set<Role>(fading ?? [])

  return (
    <div className="role-board">
      <div className="rb-cols" aria-hidden="true">
        <span>yours</span>
        <span />
        <span>derived</span>
      </div>
      {view.slots.map((slot) => {
        const { role, hex, inputHex, sourceHex, provenance, locked } = slot
        const solid = provenance !== 'derived'
        const anchored = anchorRole === role
        const failure = locked ? (failures[role] ?? null) : null
        const delta = inputHex ? seatDelta(inputHex, hex) : null
        const state = locked ? (delta?.same ? 'locked · as typed' : 'locked') : ''

        const className = [
          'rb-slot',
          picking ? 'is-picking' : '',
          `rb-${provenance}`,
          locked ? 'is-locked' : '',
          anchored ? 'is-anchored' : '',
          delta?.same && !failure ? 'is-same' : '',
          failure ? 'is-failing' : '',
          dropRole === role ? 'drop-ok' : '',
          dragRole === role ? 'is-dragging' : '',
          fadingSet.has(role) ? 'is-riffing' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div
            key={role}
            className={className}
            data-role={role}
            // In pick mode the row is one target: swallow the clicks its
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
              e.dataTransfer.setData('text/plain', inputHex ?? hex)
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
              // departure from the row itself should clear the state.
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
            // Move, not enter: a preset click swaps the pane under a resting
            // pointer, and `mouseenter` then fired on whichever row landed
            // beneath it — locating a seat nobody pointed at.
            onMouseMove={() => {
              if (located.current !== role) {
                located.current = role
                onLocate(role)
              }
            }}
            onMouseLeave={() => {
              located.current = null
              onLocate(null)
            }}
          >
            <div className="rb-top">
              <button
                type="button"
                className={`rb-name${openRole === role ? ' open' : ''}`}
                title={`what is ${role}?`}
                aria-expanded={openRole === role}
                draggable={false}
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
              <span className="rb-state">{state}</span>
              {/* The lock. Sits on every row, because every unlocked colour walks
                  — including one you supplied. On a derived seat it doubles as
                  `keep`, so it keeps that class and that meaning. */}
              <button
                type="button"
                className={solid ? 'rb-lock' : 'rb-lock rb-keep'}
                data-locked={locked ? 'true' : 'false'}
                draggable={false}
                title={lockTitle(locked)}
                aria-pressed={locked}
                aria-label={
                  locked
                    ? `unlock ${role} — let riff and taste move it again`
                    : solid
                      ? `lock ${role} — riff and taste will leave ${hex} alone`
                      : `lock ${role} — keeps ${hex} as your colour`
                }
                onClick={() => onToggleLock(role)}
              >
                {locked ? (
                  <Lock size={11} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <LockOpen size={11} strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="rb-pair">
              {inputHex ? (
                <button
                  type="button"
                  className="rb-chip rb-in"
                  style={chipStyle(inputHex)}
                  draggable={false}
                  title={`your ${role}: ${inputHex}. Change it and the engine derives from it.`}
                  aria-label={`your ${role} is ${inputHex} — change it`}
                  onClick={(e) => onEditInput(role, e.currentTarget)}
                >
                  <span className="rb-chip-hex">{inputHex}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="rb-add"
                  draggable={false}
                  title={`give ${role} a color of yours`}
                  aria-label={`add a color of yours for ${role}`}
                  onClick={(e) => onEditInput(role, e.currentTarget)}
                >
                  <Plus size={12} strokeWidth={1.75} aria-hidden="true" />
                  add
                </button>
              )}
              <DeltaCell delta={delta} failure={failure} name={role} />
              {/* `hex` is the colour in the theme; `sourceHex` is what you typed,
                  and only appears when the two have parted company. */}
              <FadeChip
                hex={hex}
                fade={fadingSet.has(role)}
                className={`rb-chip rb-body${solid ? '' : ' is-derived'}`}
                hexClass="rb-hex"
                title={`${hex} — ${TAG[provenance]}${sourceHex ? `, from ${sourceHex}` : ''}. Set the color ${role} ships; it locks as typed.`}
                ariaLabel={`${role} ships as ${hex}, ${TAG[provenance]} — set it`}
                onClick={(e) => onEditOutput(role, e.currentTarget)}
              />
            </div>

            {failure && (
              <div className="rb-fail" role="note">
                <TriangleAlert size={13} strokeWidth={1.75} aria-hidden="true" />
                <span className="rb-fail-why">{failure.reason}</span>
                <button
                  type="button"
                  className="rb-derive"
                  draggable={false}
                  title={`unlock ${role}: the engine derives it from your color again`}
                  onClick={() => onDeriveSafely(role)}
                >
                  derive safely
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
