import type { ReactElement } from 'react'
import type { Separation } from '../../engine'
import { ContrastControl } from '../ContrastControl'
import { Dial } from '../Dial'
import type { PageSettingsGroupProps } from '../PageSettings'
import { PageSettingsGroup } from '../PageSettings'
import { SeparationControl } from '../SeparationControl'

/**
 * Section 2. Every value here is per frame, so A and B can sit at different
 * settings side by side — corners and font included (pageSettings.ts).
 * The seam for the taste-motion piece: extend the props, keep the shape.
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
  /** Corners and font. */
  page: PageSettingsGroupProps
}

export function TuningSectionBody({
  fidelity,
  caption,
  separation,
  contrast,
  onFidelity,
  onSeparation,
  onContrast,
  page,
}: TuningSectionBodyProps): ReactElement {
  return (
    <>
      <Dial value={fidelity} caption={caption} onChange={onFidelity} />
      <SeparationControl value={separation} onChange={onSeparation} />
      <ContrastControl value={contrast} onChange={onContrast} />
      <PageSettingsGroup {...page} />
    </>
  )
}
