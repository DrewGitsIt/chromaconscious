import type { ReactElement } from 'react'
import { Blend, Image as ImageIcon, RotateCcw } from 'lucide-react'
import { ColorAddField } from '../ColorAddField'
import type { RoleBoardProps } from '../RoleBoard'
import { RoleBoard } from '../RoleBoard'
import type { SeriesTrayProps } from '../SeriesTray'
import { SeriesTray } from '../SeriesTray'
import type { UnusedRowProps } from '../UnusedRow'
import { UnusedRow } from '../UnusedRow'
import { withKey } from '../../shortcuts'
import './sections.css'

/**
 * Section 1, once colours exist: one row per seat (your colour → what ships),
 * the unused colours under them, the chart series folded below, and the ways
 * in — add, image, presets — folded into the foot, where "1 input" put them
 * before there was anything to show.
 */
export interface ColorsSectionBodyProps {
  controls: {
    /** Mono is engaged. */
    locked: boolean
    /** Mono is waiting for a seat to be clicked. */
    picking: boolean
    /** The colour ruling the theme while mono is engaged. */
    baseHex: string | null
    /** Any colour placed or benched by hand — what `reset` would clear. */
    hasPlacements: boolean
    onMono: () => void
    onReset: () => void
  }
  board: RoleBoardProps
  tray: SeriesTrayProps
  unused: UnusedRowProps
  add: {
    has: (hex: string) => boolean
    onAdd: (inputs: string[]) => void
    open: boolean
    onOpenChange: (open: boolean) => void
  }
  /** The other two ways in; both replace the set, and both are undoable. */
  input: {
    onImage: () => void
    onPresets: (anchor: HTMLElement) => void
  }
}

export function ColorsSectionBody({ controls, board, tray, unused, add, input }: ColorsSectionBodyProps): ReactElement {
  const { locked, picking, baseHex, hasPlacements, onMono, onReset } = controls
  return (
    <>
      {/* Nothing in this row appears or disappears with state — `reset` greys
          out in place rather than unmounting. riff and back moved to their
          own section (3 riff). */}
      <div className="ctl-row ctl-row-2">
        <button
          className={`ctl${locked ? ' on' : ''}${picking ? ' picking' : ''}`}
          onClick={onMono}
          title={withKey(
            'mono',
            locked
              ? `unlock — back to the full-palette engine (ruled by ${baseHex})`
              : "lock the theme to one color's hue",
          )}
        >
          {/* Engaged, the glyph IS the base colour — it names the hue ruling
              the theme in the space the icon was using anyway. */}
          {locked && baseHex ? (
            <i className="mono-dot" style={{ background: baseHex }} aria-hidden="true" />
          ) : (
            <Blend size={12} strokeWidth={1.75} aria-hidden="true" />
          )}
          mono
        </button>
        <button
          className="ctl"
          onClick={onReset}
          disabled={!hasPlacements}
          title={withKey(
            'reset',
            hasPlacements
              ? "clear your placements — back to the engine's own casting"
              : 'nothing to reset — you have not placed a color by hand yet',
          )}
        >
          <RotateCcw size={12} strokeWidth={1.75} aria-hidden="true" />
          reset
        </button>
      </div>
      {picking && <div className="pick-hint">click a seat to lock its hue · esc to cancel</div>}
      <RoleBoard {...board} />
      <UnusedRow {...unused} />
      <SeriesTray {...tray} />
      <div className="colors-verbs">
        {/* No wrapper: the control lays out its own row. */}
        <ColorAddField
          placeholder="add a color — #e63946, oklch(…)"
          has={add.has}
          onAdd={add.onAdd}
          open={add.open}
          onOpenChange={add.onOpenChange}
        />
        <button
          type="button"
          className="ctl colors-verb"
          onClick={input.onImage}
          title="replace your colors with an image's (undo is one click)"
          aria-label="replace with an image's colors"
        >
          <ImageIcon size={12} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ctl colors-verb"
          onClick={(e) => input.onPresets(e.currentTarget)}
          title="replace your colors with a preset (undo is one click)"
        >
          presets
        </button>
      </div>
    </>
  )
}
