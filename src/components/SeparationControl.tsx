import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'
import { Layers2, Square, SquareStack } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Separation } from '../engine'
import { SEPARATIONS } from '../engine'
import './SeparationControl.css'

export interface SeparationControlProps {
  value: Separation
  onChange: (next: Separation) => void
}

/**
 * One plane, two planes, a plane floating clear of the stack. The icons are the
 * only glyphs here — the words underneath do the teaching.
 */
const ICON: Record<Separation, LucideIcon> = {
  flat: Square,
  layered: Layers2,
  lifted: SquareStack,
}

/**
 * What each setting DOES, in the terms a designer sees rather than the tokens
 * it moves. Every line names both halves of the trade, because the whole point
 * of the control is that a border and a shadow are two ways to buy the same
 * separation — see the comments in engine/ramp.ts and engine/elevation.ts.
 *
 * Deliberately silent about hue: separation is lightness-only, so any hint of
 * "warmer"/"cooler" here would be a lie.
 */
const SAYS: Record<Separation, string> = {
  flat: 'card and page meet at one level — the hairline does the separating, and nothing casts a shadow at rest',
  layered:
    'the familiar stack — the card sits a step off the page, with hairline and shadow sharing the work',
  lifted:
    'the page recedes and the card floats above it — hairlines soften and the shadow does the separating',
}

/**
 * Separation — the border↔shadow balance, as a segmented control.
 *
 * Three discrete settings on one axis, so it is one object with a sliding
 * indicator rather than three buttons: the thumb's position IS the reading.
 * Left to right it runs from "borders carry it" to "shadow carries it".
 *
 * Hovering (or arrowing onto) a setting previews its sentence in the caption
 * without committing — that is how the control answers "why would I move
 * this?" for someone who has never touched it. Arrow keys select as they move,
 * which is the standard radio-group behaviour and here also means the preview
 * and the frame agree at every step.
 */
export function SeparationControl({ value, onChange }: SeparationControlProps): ReactElement {
  const groupRef = useRef<HTMLDivElement>(null)
  // Which setting the caption is explaining: whatever is under the pointer or
  // focus, falling back to the one actually in force.
  const [peek, setPeek] = useState<Separation | null>(null)
  const shown = peek ?? value
  const index = Math.max(0, SEPARATIONS.indexOf(value))

  const select = (next: Separation) => {
    if (next !== value) onChange(next)
    // Roving tabindex: the new radio is the only tab stop, so focus follows it.
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-sep="${next}"]`)?.focus()
  }
  const step = (delta: number) =>
    select(SEPARATIONS[(index + delta + SEPARATIONS.length) % SEPARATIONS.length])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = e.key
    if (key === 'ArrowRight' || key === 'ArrowDown') step(1)
    else if (key === 'ArrowLeft' || key === 'ArrowUp') step(-1)
    else if (key === 'Home') select(SEPARATIONS[0])
    else if (key === 'End') select(SEPARATIONS[SEPARATIONS.length - 1])
    else return
    e.preventDefault()
  }

  return (
    <div className="sep">
      <span className="sep-name">separation</span>
      <div
        className="sep-seg"
        role="radiogroup"
        aria-label="separation"
        ref={groupRef}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setPeek(null)}
      >
        <span
          className="sep-thumb"
          style={{ '--sep-i': index } as CSSProperties}
          aria-hidden="true"
        />
        {SEPARATIONS.map((s) => {
          const Icon = ICON[s]
          return (
            <button
              key={s}
              type="button"
              data-sep={s}
              className={`sep-opt${s === value ? ' on' : ''}`}
              role="radio"
              aria-checked={s === value}
              tabIndex={s === value ? 0 : -1}
              title={SAYS[s]}
              onClick={() => select(s)}
              onMouseEnter={() => setPeek(s)}
              onFocus={() => setPeek(s)}
              onBlur={() => setPeek(null)}
            >
              <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
              <span className="sep-opt-label">{s}</span>
            </button>
          )
        })}
      </div>
      {/* keyed so the sentence fades in on every swap, preview included */}
      <p className="sep-caption">
        <span key={shown}>{SAYS[shown]}</span>
      </p>
    </div>
  )
}
