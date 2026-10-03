import { forwardRef } from 'react'
import { Download } from 'lucide-react'
import './ExportButton.css'

export interface ExportButtonProps {
  /** Before any input: still here, greyed, and it says why. */
  disabled: boolean
  /** The caption's id, read with the button while it is greyed. */
  captionId?: string
  open: boolean
  onOpen: () => void
}

/**
 * The footer's one solid button. It opens the Export dialog.
 *
 * Greyed with `aria-disabled`, not `disabled`, so it stays focusable: a screen
 * reader lands on "Export, dimmed" and hears the caption that says what it
 * will give you once there is a colour. A press does nothing until then.
 */
export const ExportButton = forwardRef<HTMLButtonElement, ExportButtonProps>(function ExportButton(
  { disabled, captionId, open, onOpen },
  ref,
) {
  return (
    <button
      ref={ref}
      className="export-btn"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-disabled={disabled || undefined}
      aria-describedby={disabled ? captionId : undefined}
      title={
        disabled
          ? 'add a color first; then export CSS, Tailwind, design tokens or a link'
          : 'export: CSS, Tailwind, design tokens, links'
      }
      onClick={() => {
        if (!disabled) onOpen()
      }}
    >
      <Download size={14} strokeWidth={1.75} aria-hidden />
      Export
    </button>
  )
})
