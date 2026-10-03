import type { ReactElement } from 'react'
import type { ColorCandidate } from '../../engine'
import type { Preset } from '../../presets'
import { StartHero } from '../StartHero'
import './sections.css'

/**
 * Section 1 before any colour exists, labelled "input". It becomes "colors"
 * the moment one lands, and these ways in fold into its foot. A quiet list —
 * field, image, presets — rather than boxed cards; the stage meanwhile holds
 * only a quiet placeholder.
 */
export interface InputSectionBodyProps {
  onAddColors: (inputs: string[]) => void
  onImage: (candidates: ColorCandidate[]) => void
  onPreset: (preset: Preset) => void
}

export function InputSectionBody(props: InputSectionBodyProps): ReactElement {
  return (
    <div className="pane-start">
      <StartHero {...props} />
    </div>
  )
}
