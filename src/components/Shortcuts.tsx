import { useEffect, useRef } from 'react'
import { SHORTCUTS } from '../shortcuts'
import { useDismiss } from './useDismiss'
import './Shortcuts.css'

/**
 * The keyboard map. Rendered from the same table the handler switches on and
 * the tooltips append from (src/shortcuts.ts), so a key cannot be listed here
 * and bound to something else there.
 */
export function ShortcutsFlyout({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sc-flyout" ref={ref} role="dialog" aria-label="keyboard shortcuts">
      <div className="sc-head">keyboard</div>
      <ul className="sc-list">
        {SHORTCUTS.map((s) => (
          <li key={s.id}>
            <kbd>{s.key === '?' ? 'shift ?' : s.key}</kbd>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
      <div className="sc-cap">keys are ignored while you are typing in a field</div>
    </div>
  )
}
