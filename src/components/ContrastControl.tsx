import type { CSSProperties, ReactElement } from 'react'
import { contrastLevelName, contrastTargets } from '../engine'
import './ContrastControl.css'

export interface ContrastControlProps {
  /** 0 standard, 0.5 medium, 1 high. */
  value: number
  onChange: (next: number) => void
}

/** One tick per 0.05, like the taste dial; the three named levels are the detents. */
const TICKS = Array.from({ length: 21 }, (_, i) => i)
const DETENTS = new Set([0, 10, 20])

/** 62 → "62", 68.5 → "68.5"; 4.5 → "4.5", 5.75 → "5.75". Never more digits than the report quotes. */
const num = (v: number, places: number) => String(+v.toFixed(places))

/** What the level promises, in the units the report checks: "Lc 75 · 7:1". */
function contrastReadout(level: number): string {
  const { text } = contrastTargets(level)
  return `Lc ${num(Math.floor(text.lc * 10) / 10, 1)} · ${num(Math.floor(text.wcag * 100) / 100, 2)}:1`
}

/**
 * Contrast level — raises every target the engine solves for (contrastLevel.ts).
 *
 * Drawn as the taste dial's sibling: a ruled scale with a needle, so the two
 * read as one instrument family, but with three detents instead of one,
 * because the scale has three named stops. The readout is not the slider's
 * position but what the position BUYS — the floor every text pair is held to,
 * in the same units the report checks — so moving it answers "what changes?"
 * before you look at the frame. Achromatic, like the rest of the chrome: the
 * level is told by position and words, never by colour.
 */
export function ContrastControl({ value, onChange }: ContrastControlProps): ReactElement {
  const name = contrastLevelName(value)
  const t = contrastTargets(value)
  const readout = contrastReadout(value)
  const hairlines =
    t.border > 1 ? `hairlines ${num(t.border, 2)}:1 · inputs ${num(t.input, 2)}:1` : 'hairlines as separation sets them'
  return (
    <div className="ctr">
      <div className="ctr-read">
        <span className="ctr-name">contrast</span>
        <span className="ctr-value" aria-hidden>
          {readout}
        </span>
      </div>
      <div className="ctr-track-wrap" style={{ '--v': `${value * 100}%` } as CSSProperties}>
        <span className="ctr-ticks" aria-hidden>
          {TICKS.map((i) => (
            <i key={i} className={DETENTS.has(i) ? 'detent' : i % 5 === 0 ? 'major' : undefined} />
          ))}
        </span>
        <input
          type="range"
          className="ctr-slider"
          aria-label="contrast"
          aria-valuetext={`${name ?? value.toFixed(2)} — text at least ${readout}`}
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
      <div className="ctr-ends" aria-hidden>
        {(['standard', 'medium', 'high'] as const).map((n) => (
          <span key={n} className={name === n ? 'on' : undefined}>
            {n}
          </span>
        ))}
      </div>
      <p className="ctr-caption">
        every text pair clears {readout}; focus ring and marks {num(t.mark.wcag, 2)}:1; {hairlines}
      </p>
    </div>
  )
}
