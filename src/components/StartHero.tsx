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
 * The first-run state: with zero candidates there is no theme to preview, so
 * the stage hosts the three ways in — large and undistracted. It yields to
 * the live mockup the moment a first color, image, or preset lands. The only
 * time controls live in the canvas, and only while there's nothing to show.
 */
export function StartHero({ onAddColors, onImage, onPreset }: Props) {
  return (
    <div className="start-hero">
      <h2>Start with anything</h2>
      <p className="hero-sub">a single color, a photo, or a ready-made palette</p>
      <div className="hero-cards">
        <div className="hero-card">
          <h3>Pick a color</h3>
          <div className="hero-color">
            <ColorAddField
              placeholder="or type — #e63946, oklch(…)"
              has={() => false}
              onAdd={onAddColors}
              layout="hero"
            />
          </div>
          <p className="hero-hint">themesmith forges a full theme from even one color</p>
        </div>
        <div className="hero-card">
          <h3>Drop an image</h3>
          <ImageDrop onExtract={onImage} />
          <p className="hero-hint">pulls the strongest colors out of a photo, logo, or screenshot</p>
        </div>
        <div className="hero-card">
          <h3>Start from a preset</h3>
          <div className="hero-presets">
            {PRESETS.map((p) => (
              <button key={p.name} className="preset-card" onClick={() => onPreset(p)}>
                <PresetDots colors={p.colors} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="hero-foot">tip: you can drop an image anywhere in the window, any time</p>
    </div>
  )
}
