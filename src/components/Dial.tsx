import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import './Dial.css'

export interface DialProps {
  value: number
  caption: string
  onChange: (v: number) => void
}

/** Tick count under the track — one per 0.1 of the range, ends included. */
const TICKS = Array.from({ length: 11 }, (_, i) => i)

/** Matches --d-fast: the caption fades out, swaps, fades back in. */
const FADE_MS = 120

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The fidelity dial — the app's marquee control. Cool end is the smith's
 * judgment, warm end the user's raw colors; the readout travels with the
 * thumb and the caption cross-fades so dragging never snaps text.
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
      <div className="dial-ends">
        <span className="dial-end cool">smith&rsquo;s taste</span>
        <span className="dial-end warm">raw colors</span>
      </div>
      <div className="dial-track-wrap">
        <span className="dial-bubble" style={{ left: `${value * 100}%` }} aria-hidden>
          {value.toFixed(2)}
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
        <span className="dial-ticks" aria-hidden>
          {TICKS.map((i) => (
            <i key={i} />
          ))}
        </span>
      </div>
      <div className={`dial-caption${swapping ? ' swapping' : ''}`}>
        <span>{shown}</span>
      </div>
    </div>
  )
}
