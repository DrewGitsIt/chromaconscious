import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import '../styles/motion.css'
import './SidebarShell.css'

export interface SidebarShellProps {
  /** The wordmark. Rendered inside the fixed header. */
  title: ReactNode
  /** One line under the wordmark. */
  tagline: ReactNode
  /** Pinned to the bottom, above the scrolling body's shadow. */
  footer: ReactNode
  /** The scrolling body — a stack of <Section>s. */
  children: ReactNode
}

/**
 * The sidebar's three-part frame: fixed header, scrolling body, pinned footer.
 *
 * The footer's top shadow is not decoration — it appears only once content is
 * actually behind it, so the panel never claims there is more to see than
 * there is. That is why the scroll position is tracked in JS rather than
 * painted unconditionally.
 */
export function SidebarShell({
  title,
  tagline,
  footer,
  children,
}: SidebarShellProps): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const body = bodyRef.current
    const inner = innerRef.current
    if (!body) return

    // 1px of slack: sub-pixel scroll offsets shouldn't flicker the shadow on.
    const sync = () => setScrolled(body.scrollTop > 1)
    sync()

    body.addEventListener('scroll', sync, { passive: true })
    // Content can also shrink out from under a scrolled body (a section
    // collapses, the palette empties), which lands us back at 0 without a
    // scroll event in every browser. Watch the box too.
    const ro = new ResizeObserver(sync)
    ro.observe(body)
    if (inner) ro.observe(inner)

    return () => {
      body.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [])

  return (
    <div className={scrolled ? 'sidebar-shell scrolled' : 'sidebar-shell'}>
      <header className="sb-head">
        <h1 className="sb-wordmark">{title}</h1>
        <p className="sb-tagline">{tagline}</p>
      </header>
      <div className="sb-body" ref={bodyRef}>
        <div className="sb-body-inner stagger" ref={innerRef}>
          {children}
        </div>
      </div>
      <div className="sb-foot">{footer}</div>
    </div>
  )
}

export interface SectionProps {
  /** Micro-label for the header row, e.g. "canvas", "colors", "tuning". */
  label: string
  /** Optional right-aligned controls in the header row. */
  actions?: ReactNode
  children: ReactNode
}

/**
 * One labelled band of the sidebar. Replaces the old `<hr>` dividers: the
 * label plus its fading hairline says what the band *is*, where four identical
 * rules only said "something changed here". Same uppercase micro-label voice
 * `.frame-indicator` and `.report-drawer-head` already speak.
 */
export function Section({ label, actions, children }: SectionProps): ReactElement {
  return (
    <section className="sec" aria-label={label}>
      <div className="sec-head">
        <span className="sec-label">{label}</span>
        <span className="sec-rule" aria-hidden="true" />
        {actions == null ? null : <div className="sec-act">{actions}</div>}
      </div>
      {children}
    </section>
  )
}
