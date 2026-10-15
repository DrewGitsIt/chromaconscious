import { gradientMap } from './gradientMap'
import './TokenPhoto.css'

export interface TokenPhotoProps {
  /** Filter id. Must carry the frame's uid: split view mounts two of these. */
  id: string
  src: string
  /** Token names, dark to light in the light theme. */
  stops: string[]
  tokens: Record<string, string>
  alt: string
  /** Contrast pushed before mapping, about mid-grey. 1 leaves the photo as shot. */
  contrast?: number
  position?: string
  /** The figure's class: each mockup lays its photographs out itself. */
  className: string
}

/**
 * A photograph recoloured by tokens, for the showcase mockups. The filter sits
 * beside the image and is rebuilt from `tokens` on every render, so locate
 * mode's substituted tokens reach the photo the same way they reach a card.
 * Text never sits on one of these: a photo is no surface the contrast report
 * checks.
 */
export function TokenPhoto({ id, src, stops, tokens, alt, contrast = 1, position, className }: TokenPhotoProps) {
  const [r, g, b] = gradientMap(tokens, stops)
  const k = contrast
  const lift = (1 - k) / 2
  return (
    <figure className={`token-photo ${className}`}>
      <svg width="0" height="0" aria-hidden className="token-photo-defs">
        <filter id={id} colorInterpolationFilters="sRGB" data-stops={stops.join(' ')}>
          <feColorMatrix
            type="matrix"
            values=".2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0"
          />
          <feComponentTransfer>
            <feFuncR type="linear" slope={k} intercept={lift} />
            <feFuncG type="linear" slope={k} intercept={lift} />
            <feFuncB type="linear" slope={k} intercept={lift} />
          </feComponentTransfer>
          <feComponentTransfer>
            <feFuncR type="table" tableValues={r} />
            <feFuncG type="table" tableValues={g} />
            <feFuncB type="table" tableValues={b} />
          </feComponentTransfer>
        </filter>
      </svg>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{ filter: `url(#${id})`, objectPosition: position }}
      />
    </figure>
  )
}
