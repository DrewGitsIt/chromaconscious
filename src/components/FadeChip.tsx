/**
 * A colour chip that can cross-fade to its next colour.
 *
 * A chip used to paint from one CSS variable, so on a riff its colour blended
 * through `transition: background-color` while its hex snapped — the text said
 * the new colour before the swatch showed it. Here the previous colour is
 * kept: the chip keeps painting it underneath while the new colour fades in
 * over it, and the old hex fades out as the new one fades in (~420ms, the
 * mockup's --d-xfade). When the fade is over the old layer is dropped.
 *
 * Only a change made with `fade` on cross-fades. Everything else — a taste
 * drag, an edit, a preset — snaps, because there the colour follows your hand
 * and a lag would read as the app being slow. A chip whose colour did not
 * change (a locked seat on a riff) renders nothing extra at all, so it holds
 * perfectly still. Under prefers-reduced-motion every change snaps.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from 'react'
import { XFADE_MS, chipStyle } from './chips'

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface FadeChipProps {
  hex: string
  /** Cross-fade a change of `hex` (a riff); otherwise it snaps. */
  fade?: boolean
  className: string
  /** Class of the visible hex label (`rb-hex`, `rb-chip-hex`). */
  hexClass: string
  title: string
  ariaLabel: string
  disabled?: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  children?: ReactNode
}

export function FadeChip({
  hex,
  fade = false,
  className,
  hexClass,
  title,
  ariaLabel,
  disabled,
  onClick,
  children,
}: FadeChipProps): ReactElement {
  // The colour this chip showed last render, and the one it is fading from.
  const [shown, setShown] = useState(hex)
  const [from, setFrom] = useState<string | null>(null)
  if (shown !== hex) {
    // Adjusting state during render, React's pattern for "derived from the
    // previous prop": no extra paint with the new colour un-faded.
    setShown(hex)
    setFrom(fade && !reducedMotion() ? shown : null)
  }
  useEffect(() => {
    if (from == null) return
    const t = window.setTimeout(() => setFrom(null), XFADE_MS + 40)
    return () => window.clearTimeout(t)
  }, [from, hex])

  const style = {
    ...chipStyle(hex),
    ...(from ? { '--c-from': from } : null),
  } as CSSProperties

  return (
    <button
      type="button"
      className={`${className}${from ? ' is-fading' : ''}`}
      style={style}
      draggable={false}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {from && <i className="fc-in" key={hex} aria-hidden="true" />}
      {from && (
        <span className="fc-out" style={chipStyle(from)} aria-hidden="true">
          {from}
        </span>
      )}
      <span className={`${hexClass}${from ? ' fc-new' : ''}`} key={from ? `n${hex}` : 'h'}>
        {hex}
      </span>
      {children}
    </button>
  )
}
