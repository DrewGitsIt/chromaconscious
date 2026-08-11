import { useRef, useState } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { Pipette } from 'lucide-react'
import { useDismiss } from './useDismiss'
import './ColorSwatchPicker.css'

const canEyeDrop = typeof window !== 'undefined' && 'EyeDropper' in window

async function sampleScreen(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new (window as any).EyeDropper().open()
    return result.sRGBHex as string
  } catch {
    return null // user pressed Esc
  }
}

/** Screen color sampler (EyeDropper API). Renders nothing where unsupported. */
export function EyeDropperButton({
  onPick,
  title = 'Pick a color from anywhere on screen',
}: {
  onPick: (hex: string) => void
  title?: string
}) {
  if (!canEyeDrop) return null
  return (
    <button
      type="button"
      className="eyedrop-btn"
      title={title}
      onClick={async () => {
        const hex = await sampleScreen()
        if (hex) onPick(hex)
      }}
    >
      <Pipette size={13} />
    </button>
  )
}

interface Props {
  color: string
  onChange: (hex: string) => void
  /** When provided, the popover shows an Add button that commits and closes. */
  onAdd?: (hex: string) => void
  /** 'row' = candidate-strip size; 'inline' = compact, sits inside a field.
      Dimensions live in ColorSwatchPicker.css — this only picks the variant. */
  variant?: 'row' | 'inline'
  title?: string
}

/** A swatch button that opens a hex/HSL picker popover with optional eyedropper. */
export function ColorSwatchPicker({ color, onChange, onAdd, variant = 'row', title = 'Edit color' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  return (
    <div className="picker-anchor" ref={ref}>
      <button
        type="button"
        className={variant === 'inline' ? 'swatch-btn swatch-btn--sm' : 'swatch-btn'}
        style={{ background: color }}
        title={title}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="picker-pop">
          <HexColorPicker color={color} onChange={onChange} />
          <div className="picker-pop-row">
            <HexColorInput color={color} onChange={onChange} prefixed />
            <EyeDropperButton onPick={onChange} />
            {onAdd && (
              <button
                type="button"
                onClick={() => {
                  onAdd(color)
                  setOpen(false)
                }}
              >
                Add color
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
