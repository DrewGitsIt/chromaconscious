import { useEffect, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import './Dial.css'

export interface DialProps {
  value: number
  caption: string
  onChange: (v: number) => void
}

/** Ticks over the track — one per 0.05 step, ends included. Every fifth is a
    major tick; the middle one is the detent, where the dial starts. */
const TICKS = Array.from({ length: 21 }, (_, i) => i)
const DETENT = 10

/** Matches --d-fast: the caption fades out, swaps, fades back in. */
const FADE_MS = 120

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The fidelity dial — the app's marquee control, drawn as an instrument: a
 * large numeric readout, a ruled scale with a detent at the default, and a
 * hairline needle. Left is the engine's judgment, right the user's raw colors.
 * The caption cross-fades so dragging never snaps text.
 */
export function Dial({ value, caption, onChange }: DialProps): ReactElement {
  // `shown` lags `caption` by one fade so the text swaps while invisible.
  const [shown, setShown] = useState(caption)
  const [swapping, setSwapping] = useState(false)

  useEffect(() => {
    if (caption === shown) return
    if (prefersReducedMotion()) {
      setShown(caption)
      return
    }
    setSwapping(true)
    const t = window.setTimeout(() => {
      setShown(caption)
      setSwapping(false)
    }, FADE_MS)
    return () => window.clearTimeout(t)
  }, [caption, shown])

  return (
    <div className="dial">
      <div className="dial-read">
        <span className="dial-name">taste</span>
        <span className="dial-value" aria-hidden>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="dial-track-wrap" style={{ '--v': `${value * 100}%` } as CSSProperties}>
        <span className="dial-ticks" aria-hidden>
          {TICKS.map((i) => (
            <i key={i} className={i === DETENT ? 'detent' : i % 5 === 0 ? 'major' : undefined} />
          ))}
        </span>
        <input
          type="range"
          className="dial-slider"
          aria-label="fidelity"
          aria-valuetext={`${value.toFixed(2)} — ${caption}`}
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
      <div className="dial-ends" aria-hidden>
        <span>engine</span>
        <span>raw</span>
      </div>
      <div className={`dial-caption${swapping ? ' swapping' : ''}`}>
        <span>{shown}</span>
      </div>
    </div>
  )
}
