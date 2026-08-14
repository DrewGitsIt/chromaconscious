import type { ReactElement } from 'react'
import { AlertTriangle, Check, ChevronRight } from 'lucide-react'
import './StatusChip.css'

export interface StatusChipProps {
  ok: boolean
  text: string
  onOpenReport: () => void
}

/**
 * The audit verdict, sized like a statement rather than a footnote: one
 * full-width row that says what the checks found and opens the report.
 */
export function StatusChip({ ok, text, onOpenReport }: StatusChipProps): ReactElement {
  return (
    <button className={`status-chip ${ok ? 'ok' : 'warn'}`} onClick={onOpenReport}>
      {ok ? (
        <Check size={13} strokeWidth={1.75} aria-hidden />
      ) : (
        <AlertTriangle size={13} strokeWidth={1.75} aria-hidden />
      )}
      <span className="status-chip-text">{text}</span>
      <span className="status-chip-more">
        report
        <ChevronRight size={11} strokeWidth={1.75} aria-hidden />
      </span>
    </button>
  )
}
