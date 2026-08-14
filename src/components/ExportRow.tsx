import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { useDismiss } from './useDismiss'
import './ExportRow.css'

export interface ExportRowProps {
  formats: { id: string; label: string }[]
  current: string
  copied: boolean
  disabled?: boolean
  onCopy: (formatId: string) => void
  onChangeFormat: (formatId: string) => void
}

/**
 * The export split button: one press copies the format you already chose,
 * the caret opens the other formats upward (the row lives at the panel's
 * foot, so a downward menu would fall off the edge).
 */
export function ExportRow({
  formats,
  current,
  copied,
  disabled = false,
  onCopy,
  onChangeFormat,
}: ExportRowProps): ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // a disabled row can't leave a menu hanging open behind it
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const label = formats.find((f) => f.id === current)?.label ?? current

  return (
    <div className="export-row" ref={ref}>
      <button
        className={`export-main${copied ? ' copied' : ''}`}
        disabled={disabled}
        onClick={() => onCopy(current)}
      >
        {copied ? (
          <Check size={14} strokeWidth={1.75} className="export-check" aria-hidden />
        ) : (
          <Copy size={14} strokeWidth={1.75} aria-hidden />
        )}
        <span className="export-main-label">{copied ? `${label} copied` : `Copy ${label}`}</span>
      </button>
      <button
        className="export-caret"
        aria-label="choose export format"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div className="menu export-menu" role="menu">
          {formats.map((f) => (
            <button
              key={f.id}
              className={`item export-item${f.id === current ? ' sel' : ''}`}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onChangeFormat(f.id)
              }}
            >
              <span className="export-item-label">{f.label}</span>
              {f.id === current && (
                <Check size={13} strokeWidth={1.75} className="export-item-check" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
