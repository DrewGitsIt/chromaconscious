import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { railGeometry, revealSection } from './rail'
import '../styles/motion.css'
import './SidebarShell.css'

/**
 * One numbered section of the pane, as data. The shell renders the header,
 * the fold, the number and the rail tick from this; `body` is whatever the
 * section's own component renders. Pieces that rebuild a section swap `body`
 * (and `readout`) and never touch the shell.
 */
export interface PaneSection {
  /** Stable key. A section that keeps its id keeps its DOM across renders. */
  id: string
  /** The name in the header, e.g. "colors". */
  label: string
  /** A one-line summary shown in the header while the section is folded. */
  readout?: ReactNode
  /** Header tools, outside the toggle button. Hidden while folded. */
  actions?: ReactNode
  body: ReactNode
}

export interface SidebarShellProps {
  /** The wordmark. Rendered inside the fixed header. */
  title: ReactNode
  /** One line under the wordmark. */
  tagline: ReactNode
  /** Pinned to the bottom. */
  footer: ReactNode
  /**
   * The sections that apply right now, in order. A section that does not apply
   * is not passed at all: there is no greyed-out placeholder state.
   */
  sections: PaneSection[]
  /** Ids of folded sections. Anything not listed is open. */
  folded: ReadonlySet<string>
  onToggle: (id: string) => void
}

/**
 * The sidebar's frame: fixed header, a scrolling body of numbered sections
 * with a rail beside it, and a pinned footer.
 *
 * The rail and the scroller share one positioned box (`.sb-mid`), so the
 * rail's coordinate frame is the scroll viewport (see rail.ts). Thumb and
 * ticks are written straight to the DOM on every scroll and every resize of
 * the single content wrapper, so they track 1:1 and move on every frame of a
 * fold — no React render, no easing, no lag.
 */
export function SidebarShell({
  title,
  tagline,
  footer,
  sections,
  folded,
  onToggle,
}: SidebarShellProps): ReactElement {
  const shellRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const ids = sections.map((s) => s.id)
  const idsRef = useRef(ids)
  idsRef.current = ids

  const sync = useCallback(() => {
    const body = bodyRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    if (!body || !rail || !thumb) return
    const keys = idsRef.current
    const secs = keys.map((k) => body.querySelector<HTMLElement>(`[data-sec="${k}"]`))
    const g = railGeometry({
      railH: rail.clientHeight,
      scrollH: body.scrollHeight,
      clientH: body.clientHeight,
      scrollTop: body.scrollTop,
      tops: secs.map((s) => s?.offsetTop ?? 0),
    })
    thumb.style.top = `${g.thumbTop}px`
    thumb.style.height = `${g.thumbH}px`
    thumb.style.visibility = g.scrollable ? '' : 'hidden'
    keys.forEach((k, i) => {
      const t = rail.querySelector<HTMLElement>(`[data-tick="${k}"]`)
      if (!t) return
      t.style.top = `${g.ticks[i]}px`
      t.classList.toggle('here', i === g.here)
    })
    shellRef.current?.classList.toggle('behind', g.behind)
  }, [])

  useEffect(() => {
    const body = bodyRef.current
    const inner = innerRef.current
    const rail = railRef.current
    if (!body) return
    body.addEventListener('scroll', sync, { passive: true })
    // The scroller's box (window resize), the ONE wrapper around every section
    // (every frame of a fold, a section arriving or leaving), and the rail.
    // v1 watched the first section only, so folding any other one left the
    // ticks behind.
    const ro = new ResizeObserver(sync)
    ro.observe(body)
    if (inner) ro.observe(inner)
    if (rail) ro.observe(rail)
    // fonts arrive late and change every section's height
    void document.fonts?.ready.then(sync)
    return () => {
      body.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [sync])

  // A section can arrive or leave with no net change in height; re-measure
  // after every render that could have moved one.
  useLayoutEffect(sync)

  return (
    <div className="sidebar-shell" ref={shellRef}>
      <header className="sb-head">
        <h1 className="sb-wordmark">{title}</h1>
        <p className="sb-tagline">{tagline}</p>
      </header>
      <div className="sb-mid">
        <nav className="rail" ref={railRef} aria-label="sections">
          <span className="rail-line" aria-hidden="true" />
          <span className="rail-thumb" ref={thumbRef} aria-hidden="true" />
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="rail-tick"
              data-tick={s.id}
              aria-label={`go to ${i + 1} ${s.label}`}
              onClick={() => revealSection(s.id)}
            >
              <i aria-hidden="true" />
              <span className="rail-tip" aria-hidden="true">
                {i + 1} · {s.label}
              </span>
            </button>
          ))}
        </nav>
        <div className="sb-body" ref={bodyRef}>
          <div className="sb-body-inner" ref={innerRef}>
            {sections.map((s, i) => (
              <Section
                key={s.id}
                n={i + 1}
                id={s.id}
                label={s.label}
                readout={s.readout}
                actions={s.actions}
                open={!folded.has(s.id)}
                onToggle={onToggle}
              >
                {s.body}
              </Section>
            ))}
          </div>
        </div>
      </div>
      <div className="sb-foot">{footer}</div>
    </div>
  )
}

interface SectionProps {
  n: number
  id: string
  label: string
  readout?: ReactNode
  actions?: ReactNode
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}

/**
 * One numbered, foldable section. The header is a real button
 * (`aria-expanded`/`aria-controls`); the body folds by animating its grid row
 * between 1fr and 0fr, so it needs no measured height.
 *
 * The body clips only while folded or mid-fold. Open and at rest it does not,
 * so an absolutely positioned popover inside (the first-run picker) is never
 * cut off at the section's edge. A folded body is `inert`: nothing in it can
 * take focus or a click.
 */
function Section({ n, id, label, readout, actions, open, onToggle, children }: SectionProps): ReactElement {
  const uid = useId()
  const headId = `${uid}-head`
  const bodyId = `${uid}-body`
  const [moving, setMoving] = useState(false)
  const fallback = useRef<number | null>(null)

  useEffect(() => () => {
    if (fallback.current != null) window.clearTimeout(fallback.current)
  }, [])

  const toggle = () => {
    setMoving(true)
    // transitionend is the normal end; this covers a transition that never
    // starts (display changes, a tab in the background).
    if (fallback.current != null) window.clearTimeout(fallback.current)
    fallback.current = window.setTimeout(() => setMoving(false), 700)
    onToggle(id)
  }

  return (
    <section
      className={`sec${open ? '' : ' shut'}${moving ? ' moving' : ''}`}
      data-sec={id}
      aria-labelledby={headId}
    >
      <div className="sec-head">
        <button
          type="button"
          id={headId}
          className="sec-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span className="sec-n" aria-hidden="true">
            {n}
          </span>
          <span className="sec-label">{label}</span>
          <span className="sec-rule" aria-hidden="true" />
          {readout != null && (
            <span className="sec-read" aria-hidden={open}>
              {readout}
            </span>
          )}
          <ChevronDown className="sec-chev" size={12} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {actions != null && open && <div className="sec-act">{actions}</div>}
      </div>
      <div
        className="sec-body"
        id={bodyId}
        role="region"
        aria-labelledby={headId}
        inert={!open}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') setMoving(false)
        }}
      >
        <div className="sec-clip">
          <div className="sec-pad">{children}</div>
        </div>
      </div>
    </section>
  )
}
