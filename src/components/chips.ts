/**
 * Shared by the colour rows, the chart rows and the unused row: the drag
 * channel's reader, and the style that paints a chip in its own colour.
 * Kept out of the component files so fast refresh keeps working on them.
 */
import type { CSSProperties, DragEvent } from 'react'
import type { Role } from '../engine'
import { ROLES } from '../engine'
import type { DragPayload } from '../board'
import { DRAG_MIME, readableInk, wellOn } from '../board'

export { DRAG_MIME }

const isRole = (v: unknown): v is Role => ROLES.includes(v as Role)

/** Read a drag payload defensively — anything can be dropped on us. */
export function readPayload(e: DragEvent<HTMLElement>): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME)
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

/** A chip painted in its own colour, with ink the engine's APCA solver picked. */
export const chipStyle = (hex: string): CSSProperties =>
  ({ '--c': hex, '--ink-on': readableInk(hex), '--well': wellOn(hex) }) as CSSProperties


/** The riff cross-fade's length; matches --d-xfade in styles/tokens.css. */
export const XFADE_MS = 420
