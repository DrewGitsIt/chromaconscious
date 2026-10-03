import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Download, TriangleAlert, X } from 'lucide-react'
import type { ExportContext, ExportFormat, FileLine } from './formats'
import { EXPORT_GROUPS } from './formats'
import './ExportDialog.css'

export interface ExportDialogProps {
  formats: ExportFormat[]
  /** Null while the theme id is still being hashed. */
  ctx: ExportContext | null
  /** Failing checks. Information only: a palette that fails still exports. */
  issues: number
  /**
   * The locked seats among those failures — exactly the rows wearing the
   * warning triangle in the colours section (App's `failures`), so the note
   * names every one of them. Each is counted in `issues` too.
   */
  kept?: Array<{ role: string; short: string }>
  /** Which frame this exports, when there are two. */
  frameLabel: string | null
  /** Focus goes back here on close. */
  returnFocus: RefObject<HTMLElement | null>
  onClose: () => void
}

/** Below this the list stacks over the pane instead of beside it. */
const NARROW = 560
const PREVIEW_LINES = 16

/** Inline `code` spans out of a plain sentence. */
function prose(text: string): ReactNode {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))
}

/** The first lines, each with a swatch where it names a colour. */
function CodePreview({ text, label }: { text: string; label: string }) {
  const lines = text.split('\n')
  const shown = lines.slice(0, PREVIEW_LINES)
  return (
    <pre className="xd-pre" tabIndex={0} aria-label={label}>
      {shown.map((line, i) => {
        const hex = /#[0-9a-f]{6}\b/i.exec(line)?.[0]
        return (
          <Fragment key={i}>
            {hex && <span className="xd-sw" style={{ background: hex }} aria-hidden />}
            {line}
            {'\n'}
          </Fragment>
        )
      })}
      {lines.length > PREVIEW_LINES && (
        <span className="xd-more">… {lines.length - PREVIEW_LINES} more lines</span>
      )}
    </pre>
  )
}

/** A lazily built list of files: shows a quiet line until it lands. */
function FilesPreview({ ctx, format }: { ctx: ExportContext; format: ExportFormat }) {
  const [loaded, setState] = useState<{ ctx: ExportContext; lines: FileLine[] | null; error?: string } | null>(null)
  const preview = format.preview
  useEffect(() => {
    if (preview?.kind !== 'files') return
    let live = true
    preview.load(ctx).then(
      (lines) => live && setState({ ctx, lines }),
      (err: unknown) => live && setState({ ctx, lines: null, error: err instanceof Error ? err.message : String(err) }),
    )
    return () => {
      live = false
    }
  }, [ctx, preview])
  if (preview?.kind !== 'files') return null
  // a result for an older theme is not this theme's
  const state = loaded?.ctx === ctx ? loaded : null
  const lines = state?.lines
  return (
    <ul className="xd-files" aria-label={preview.label} aria-busy={!lines && !state?.error}>
      {lines
        ? lines.map((l) => (
            <li key={l.name} className="xd-fileline">
              <span>{l.name}</span>
              <small>{l.detail}</small>
            </li>
          ))
        : <li className="xd-fileline"><small>{state?.error ?? 'building the files…'}</small></li>}
    </ul>
  )
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * Every way out of the app, in one place: a list of formats on the left, what
 * you get on the right.
 *
 * It opens BESIDE the pane, over the stage, and its backdrop starts at the
 * pane's edge: the swatches people judge colour by are never covered, dimmed
 * or blurred. That is why this is not ui/dialog.tsx, whose backdrop is
 * viewport-wide and blurred (surfaces-phase-decisions: a full-viewport scrim
 * dimmed the sidebar ~27%). The pane is covered only by a transparent layer
 * that closes the dialog when clicked.
 */
export function ExportDialog({
  formats,
  ctx,
  issues,
  kept = [],
  frameLabel,
  returnFocus,
  onClose,
}: ExportDialogProps): ReactElement {
  const [selected, setSelected] = useState(formats[0]?.id)
  const [said, setSaid] = useState('')
  const [box, setBox] = useState<{ left: number; top: number; width: number; scrimLeft: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const format = formats.find((f) => f.id === selected) ?? formats[0]
  const narrow = box != null && box.width < NARROW

  // ---- placement: beside the pane, narrower when the room is tight ----
  useLayoutEffect(() => {
    const place = () => {
      const pane = document.querySelector('.sidebar-shell')?.getBoundingClientRect()
      const right = pane && pane.width > 0 ? pane.right : 0
      const room = innerWidth - right - 28
      const width = Math.max(Math.min(620, room), Math.min(320, innerWidth - 24))
      // too tight beside the pane: the stage's own width, centred in what is left
      const left = room >= 320 ? right + 16 : Math.max(12, innerWidth - width - 12)
      const h = ref.current?.offsetHeight ?? 0
      const top = Math.max(12, innerHeight - h - 12)
      setBox({ left, top, width, scrimLeft: right })
    }
    place()
    const ro = new ResizeObserver(place)
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [])

  // ---- focus: the first format once placed (a hidden box can't take
  // focus), back to Export on close ----
  const [firstId] = useState(formats[0]?.id)
  const placed = box != null
  useEffect(() => {
    if (placed) tabRefs.current.get(firstId)?.focus()
  }, [placed, firstId])
  useEffect(() => {
    const back = returnFocus.current
    return () => back?.focus()
  }, [returnFocus])

  // a new format clears the last confirmation
  useEffect(() => setSaid(''), [selected])

  // ---- keyboard: Esc closes, arrows move through formats, Tab is trapped ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current
      if (!el) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      const tab = (e.target as HTMLElement | null)?.closest?.('[role="tab"]')
      const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']
      if (tab && el.contains(tab) && keys.includes(e.key)) {
        const ids = formats.map((f) => f.id)
        const i = ids.indexOf(tab.getAttribute('data-x') ?? '')
        const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1
        const next =
          e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + step + ids.length) % ids.length
        setSelected(ids[next])
        tabRefs.current.get(ids[next])?.focus()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key === 'Tab') {
        const focusable = [
          ...el.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]'),
        ].filter((x) => !x.hasAttribute('disabled'))
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const at = document.activeElement
        if (!el.contains(at)) {
          first?.focus()
          e.preventDefault()
        } else if (e.shiftKey && at === first) {
          last?.focus()
          e.preventDefault()
        } else if (!e.shiftKey && at === last) {
          first?.focus()
          e.preventDefault()
        }
        return
      }
      // while the dialog is up, the app's bare-key shortcuts must not act behind it
      e.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [formats, onClose])

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSaid(done)
    } catch {
      setSaid('copy blocked here: select the text and copy it')
    }
  }

  let lastGroup: string | null = null
  const ordered = EXPORT_GROUPS.flatMap((g) => formats.filter((f) => f.group === g))

  return createPortal(
    <>
      {/* Transparent over the pane, 10% black over the stage, no blur. */}
      <div className="xd-catch" onMouseDown={onClose} aria-hidden="true">
        <div className="xd-scrim" style={{ left: box?.scrimLeft ?? 0 }} />
      </div>
      <div
        ref={ref}
        className={`xd${narrow ? ' narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="xd-title"
        style={box ? { left: box.left, top: box.top, width: box.width } : { visibility: 'hidden' }}
      >
        <div className="xd-head">
          <h2 id="xd-title">Export</h2>
          <span className="xd-sub">
            {frameLabel && `frame ${frameLabel} · `}
            {ctx && <span className="xd-id">{ctx.id}</span>}
          </span>
          <button className="xd-close" aria-label="close" onClick={onClose}>
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        {issues > 0 && (
          <p className="xd-note">
            <TriangleAlert size={13} strokeWidth={1.75} aria-hidden />
            <span>
              exports as you set it — {issues} check{issues > 1 ? 's' : ''} to review
              {kept.length > 0 &&
                ` · locked as typed: ${kept.map((k) => `${k.role} ${k.short}`).join(', ')}; derive safely is on ${kept.length > 1 ? 'their rows' : 'its row'}`}
            </span>
          </p>
        )}
        <div className="xd-main">
          <div
            className="xd-tabs"
            role="tablist"
            aria-label="formats"
            aria-orientation={narrow ? 'horizontal' : 'vertical'}
          >
            {ordered.map((f) => {
              const head = f.group !== lastGroup ? f.group : null
              lastGroup = f.group
              const on = f.id === format.id
              return (
                <Fragment key={f.id}>
                  {head && (
                    <div className="xd-grp" aria-hidden="true">
                      {head}
                    </div>
                  )}
                  <button
                    ref={(b) => {
                      if (b) tabRefs.current.set(f.id, b)
                      else tabRefs.current.delete(f.id)
                    }}
                    className="xd-tab"
                    role="tab"
                    id={`xt-${f.id}`}
                    data-x={f.id}
                    aria-selected={on}
                    aria-controls="xd-pane"
                    tabIndex={on ? 0 : -1}
                    onClick={() => setSelected(f.id)}
                  >
                    <span className="xd-tab-n">{f.name}</span>
                    <small>{f.sub}</small>
                  </button>
                </Fragment>
              )
            })}
          </div>
          <div className="xd-pane" id="xd-pane" role="tabpanel" aria-labelledby={`xt-${format.id}`}>
            <p>{prose(format.about)}</p>
            {ctx && format.preview?.kind === 'code' && (
              <CodePreview text={format.preview.text(ctx)} label={format.preview.label} />
            )}
            {ctx && format.preview?.kind === 'link' && (
              <div className="xd-link" tabIndex={0} aria-label={format.preview.label}>
                {format.preview.text(ctx)}
              </div>
            )}
            {ctx && format.preview?.kind === 'files' && <FilesPreview ctx={ctx} format={format} />}
            {format.hint && <p className="xd-hint">{format.hint}</p>}
            <div className="xd-acts">
              {format.copy.map((a, i) => (
                <button
                  key={a.label}
                  className={`xd-btn${i === 0 ? ' primary' : ''}`}
                  disabled={!ctx}
                  onClick={() => ctx && void copy(a.text(ctx), a.done)}
                >
                  {i === 0 && <Copy size={13} strokeWidth={1.75} aria-hidden />}
                  {a.label}
                </button>
              ))}
              {format.download && ctx && (
                <button
                  className={`xd-btn${format.copy.length === 0 ? ' primary' : ''}`}
                  onClick={async () => {
                    const name = format.download!.filename(ctx)
                    try {
                      download(name, await format.download!.blob(ctx))
                      setSaid(`downloaded ${name}`)
                    } catch (err) {
                      setSaid(err instanceof Error ? err.message : 'download failed')
                    }
                  }}
                >
                  <Download size={13} strokeWidth={1.75} aria-hidden />
                  Download
                </button>
              )}
              <span className="xd-said" role="status" aria-live="polite">
                {said}
              </span>
            </div>
            {format.download && ctx && (
              <p className="xd-file">{format.download.filename(ctx)}</p>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
