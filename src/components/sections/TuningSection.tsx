import type { ReactElement } from 'react'
import type { Separation } from '../../engine'
import { ContrastControl } from '../ContrastControl'
import { Dial } from '../Dial'
import { SeparationControl } from '../SeparationControl'

/**
 * Section 2. Every value here is per frame, so A and B can sit at different
 * settings side by side. The seam for the taste-motion and page-settings
 * pieces: extend the props, keep the shape.
 */
export interface TuningSectionBodyProps {
  fidelity: number
  /** The dial's live caption — what taste is doing to your colours right now. */
  caption: string
  separation: Separation
  contrast: number
  onFidelity: (v: number) => void
  onSeparation: (s: Separation) => void
  onContrast: (v: number) => void
}

export function TuningSectionBody({
  fidelity,
  caption,
  separation,
  contrast,
  onFidelity,
  onSeparation,
  onContrast,
}: TuningSectionBodyProps): ReactElement {
  return (
    <>
      <Dial value={fidelity} caption={caption} onChange={onFidelity} />
      <SeparationControl value={separation} onChange={onSeparation} />
      <ContrastControl value={contrast} onChange={onContrast} />
    </>
  )
}
