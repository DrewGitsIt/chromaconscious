import { useState } from 'react'
import { parseColor, toHex } from '../engine'
import { ColorSwatchPicker } from './ColorSwatchPicker'

interface Props {
  placeholder: string
  /** Whether a hex is already in the candidate list (dedup for the picker). */
  has: (hex: string) => boolean
  onAdd: (inputs: string[]) => void
  /** 'inline' tucks the swatch inside the field (the strip's add-row);
      'hero' renders it as a large block above (the first-run card). */
  layout?: 'inline' | 'hero'
}

/**
 * The additive way in: a swatch-picker + free-text field + Add button.
 * Used by the first-run hero and by the add-row at the foot of the strip —
 * same behavior in both, only the arrangement differs.
 */
export function ColorAddField({ placeholder, has, onAdd, layout = 'inline' }: Props) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState('#7aa2f7')
  // True once the user has picked a color in the popover but not yet added it,
  // so the main Add button commits it even after the popover has closed.
  const [dirty, setDirty] = useState(false)

  // The picked swatch color joins an Add unless it's already in the list —
  // so removing it and hitting Add again re-adds it, but a committed pick
  // doesn't duplicate on later Adds.
  const commit = () => {
    const tokens = text.split(/[\s,]+/).filter(Boolean)
    if (dirty && !has(pending)) tokens.push(pending)
    onAdd(tokens)
    setText('')
  }

  // The embedded swatch previews what's being typed; otherwise the last pick.
  const lastTyped = text.trim().split(/[\s,]+/).filter(Boolean).pop()
  const typedColor = lastTyped ? parseColor(lastTyped) : null
  const previewHex = typedColor ? toHex(typedColor) : pending

  const picker = (
    <ColorSwatchPicker
      color={previewHex}
      variant="inline"
      title="Pick a color"
      onChange={(hex) => {
        setPending(hex)
        setDirty(true)
      }}
      onAdd={(hex) => onAdd([hex])}
    />
  )

  return (
    <>
      {layout === 'hero' && picker}
      <div className="hexfield">
        {layout === 'inline' && picker}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={placeholder}
        />
      </div>
      <button onClick={commit}>Add</button>
    </>
  )
}
