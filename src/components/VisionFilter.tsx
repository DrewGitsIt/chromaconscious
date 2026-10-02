import type { ReactElement } from 'react'
import type { Mat3, Vision } from '../engine/cvd'
import { visionTransform } from '../engine/cvd'

/**
 * Brettel's plane test, written into a mask's alpha as `0.5 + K·(normal·rgb)`
 * and then snapped to 0 or 1. K only has to be steep enough that the 8-bit
 * alpha lands on the right side of 0.5 for any color off the plane itself.
 */
const MASK_GAIN = 2000

/** An feColorMatrix `values` string: the 3×3 on RGB, alpha passed through. */
const rgbMatrix = (m: Mat3): string =>
  `${m[0]} ${m[1]} ${m[2]} 0 0  ${m[3]} ${m[4]} ${m[5]} 0 0  ${m[6]} ${m[7]} ${m[8]} 0 0  0 0 0 1 0`

/**
 * One frame's colorblind simulation as an SVG filter, reached from CSS with
 * `filter: url(#id)`. Renders nothing for typical vision.
 *
 * The matrices are defined in linear RGB, so every primitive that applies one
 * runs in linearRGB and the browser does the sRGB decode and encode. Protan
 * and deutan are one matrix. Tritan projects onto both of Brettel's planes,
 * keeps plane 1 where the mask is set and plane 2 where it isn't, and adds the
 * two: the source alpha survives, so the frame's rounded corners and shadow
 * stay what they were.
 *
 * Tritan's chain runs in sRGB everywhere else, on purpose. Chrome stores each
 * intermediate result at 8 bits in the primitive's color space, and 8-bit
 * linear RGB crushes near-black (up to 7/255 off). Stored as sRGB, they stay
 * within 1/255 of cvd.ts. The composites only select and add disjoint halves,
 * so the space they run in doesn't change the math. e2e/vision-filter.spec.ts
 * checks all of this against cvd.ts in a real browser.
 */
export function VisionFilter({
  id,
  vision,
  strength,
}: {
  id: string
  vision: Vision
  strength: number
}): ReactElement | null {
  if (vision === 'typical') return null
  const t = visionTransform(vision, strength)
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter id={id} colorInterpolationFilters={t.kind === 'single' ? 'linearRGB' : 'sRGB'}>
        {t.kind === 'single' ? (
          <feColorMatrix type="matrix" in="SourceGraphic" values={rgbMatrix(t.m)} />
        ) : (
          <>
            <feColorMatrix
              type="matrix"
              in="SourceGraphic"
              result="mask"
              colorInterpolationFilters="linearRGB"
              values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${t.normal.map((n) => n * MASK_GAIN).join(' ')} 0 0.5`}
            />
            <feComponentTransfer in="mask" result="mask">
              <feFuncA type="discrete" tableValues="0 1" />
            </feComponentTransfer>
            <feColorMatrix
              type="matrix"
              in="SourceGraphic"
              result="plane1"
              colorInterpolationFilters="linearRGB"
              values={rgbMatrix(t.m1)}
            />
            <feColorMatrix
              type="matrix"
              in="SourceGraphic"
              result="plane2"
              colorInterpolationFilters="linearRGB"
              values={rgbMatrix(t.m2)}
            />
            <feComposite in="plane1" in2="mask" operator="in" result="kept1" />
            <feComposite in="plane2" in2="mask" operator="out" result="kept2" />
            <feComposite in="kept1" in2="kept2" operator="arithmetic" k2="1" k3="1" />
          </>
        )}
      </filter>
    </svg>
  )
}
