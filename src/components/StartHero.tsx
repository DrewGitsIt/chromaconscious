import type { ColorCandidate } from '../engine'
import type { Preset } from '../presets'
import { PRESETS } from '../presets'
import { ColorAddField } from './ColorAddField'
import { ImageDrop } from './ImageDrop'
import { PresetDots } from './PresetDots'
import './StartHero.css'

interface Props {
  onAddColors: (inputs: string[]) => void
  onImage: (candidates: ColorCandidate[]) => void
  onPreset: (preset: Preset) => void
}

/**
 * The first-run state, set into the pane as "1 input": the three ways in as a
 * quiet list — a field, one line for an image, the presets as rows. It was
 * three boxed cards, sized for the stage it used to fill; in a 320px pane the
 * boxes were most of what you saw. Once a colour lands, the same three ways
 * fold into the foot of "1 colors".
 */
export function StartHero({ onAddColors, onImage, onPreset }: Props) {
  return (
    <div className="start-hero">
      <p className="si-k">a single color is enough</p>
      <div className="si-add">
        <ColorAddField
          placeholder="or type — #e63946, oklch(…)"
          has={() => false}
          onAdd={onAddColors}
          layout="hero"
        />
      </div>
      <ImageDrop onExtract={onImage} />
      <div className="si-presets">
        <p className="si-k">or start from a preset</p>
        {PRESETS.map((p) => (
          <button key={p.name} className="preset-card" onClick={() => onPreset(p)}>
            <PresetDots colors={p.colors} />
            {p.name}
          </button>
        ))}
      </div>
      <p className="si-foot">you can drop an image anywhere in the window, any time</p>
    </div>
  )
}
