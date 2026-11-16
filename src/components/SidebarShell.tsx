import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  PUSH_IDLE_MS,
  PUSH_PX,
  PUSH_TOUCH_PX,
  atEnd,
  scrolls,
  trace,
  wheelPixels,
  type Anchor,
  type ScrollMetrics,
} from './tracer'
import '../styles/motion.css'
import './SidebarShell.css'

/**
 * One numbered section of the pane, as data. The shell renders the header,
 * the fold and the number from this; `body` is whatever the section's own
 * component renders. Pieces that rebuild a section swap `body` (and
 * `readout`) and never touch the shell.
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
  /** The pane's own verbs, beside the wordmark: start over, the keyboard map. */
  headActions?: ReactNode
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
  /** Off the edge: before a theme exists the stage is the way in, and the pane slides away. */
  away?: boolean
}

/** A section's number sits centred on its 24px header row. */
const NODE_Y = 12
/** How long an open or close eases the tracer, and how long a pin holds. */
const EASE_MS = 340
const PIN_MS = 380

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const metricsOf = (b: HTMLElement): ScrollMetrics => ({
  scrollTop: b.scrollTop,
  clientHeight: b.clientHeight,
  scrollHeight: b.scrollHeight,
})

/** What the rail remembers between frames. Mutated in place; never rendered from. */
interface RailMemory {
  /** The first section's id: when it changes, a new flow has begun. */
  flow: string
  visited: Set<string>
  /** The section last opened. The tip sits on it when the pane does not scroll. */
  focus: string
  anchor: Anchor | null
  lastMax: number | null
  lastTip: number | null
  /** The section the tip is held on while it unfolds. */
  pin: string | null
  easeUntil: number
  frontier: number
  push: number
  lastPushInput: number
  drain: number
  touchY: number | null
  /** A section opened by the push: the user is scrolling, so no reveal scroll. */
  pushed: string | null
}

/**
 * The sidebar's frame: fixed header, a scrolling body of numbered sections,
 * and a pinned footer.
 *
 * The numbers are the rail. One line threads them, and a white tracer runs
 * down it as you read: its tip maps scroll like a scrollbar does (tracer.ts),
 * so it climbs back when you scroll up, and a number lights when the tip
 * reaches it. Below the last open section a folded one waits; scrolling past
 * the end pushes the tip across the last gap, and touching the number
 * unfolds it. Opening a section any other way (its header, a hotkey) is the
 * same as pushing to it: it unfolds, the tip goes to its number, and the
 * number lights.
 *
 * Everything the rail draws is written straight to the DOM on every scroll,
 * resize and frame of a fold: no React render, and no easing while scroll
 * drives it, so it tracks 1:1.
 */
export function SidebarShell({
  title,
  tagline,
  headActions,
  footer,
  sections,
  folded,
  onToggle,
  away = false,
}: SidebarShellProps): ReactElement {
  const shellRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const tracerRef = useRef<HTMLElement>(null)
  const ids = sections.map((s) => s.id)
  const idsRef = useRef(ids)
  idsRef.current = ids
  const foldedRef = useRef(folded)
  foldedRef.current = folded
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle
  const mem = useRef<RailMemory>({
    flow: '',
    visited: new Set(),
    focus: '',
    anchor: null,
    lastMax: null,
    lastTip: null,
    pin: null,
    easeUntil: 0,
    frontier: -1,
    push: 0,
    lastPushInput: 0,
    drain: 0,
    touchY: null,
    pushed: null,
  })

  const sync = useCallback(() => {
    const body = bodyRef.current
    const tracer = tracerRef.current
    if (!body || !tracer) return
    const s = mem.current
    const keys = idsRef.current
    // A new flow (the first section changed: a theme arrived, or left)
    // starts the rail over, from its first number.
    if ((keys[0] ?? '') !== s.flow) {
      s.flow = keys[0] ?? ''
      s.visited = new Set(keys.length ? [keys[0]] : [])
      s.focus = keys[0] ?? ''
      s.anchor = null
      s.lastMax = null
      s.lastTip = null
      s.pin = null
      s.push = 0
    }
    const els = keys.map((k) => body.querySelector<HTMLElement>(`:scope > .sb-body-inner > [data-sec="${k}"]`))
    if (els.length === 0 || els.some((e) => !e)) {
      tracer.style.height = '0px'
      return
    }
    const secs = els as HTMLElement[]
    const nodes = secs.map((e) => e.offsetTop + NODE_Y)
    const ends = secs.map((e) => e.offsetTop + e.offsetHeight)
    const m = metricsOf(body)
    const max = m.scrollHeight - m.clientHeight
    if (scrolls(m)) {
      const pinned = s.pin ? keys.indexOf(s.pin) : -1
      if (pinned >= 0) {
        // unfolding: hold the tip on its number, wherever scroll is
        s.anchor = { scrollTop: m.scrollTop, tip: nodes[pinned] }
      } else if (s.lastMax !== null && Math.abs(max - s.lastMax) > 0.5 && s.lastTip !== null) {
        // the pane changed height: re-anchor where the tip IS, so it can't jump
        s.anchor = { scrollTop: m.scrollTop, tip: Math.min(s.lastTip, m.scrollHeight) }
      }
    } else s.anchor = null
    s.lastMax = scrolls(m) ? max : 0

    const r = trace({
      metrics: m,
      nodes,
      ends,
      sections: keys.map((k) => ({ open: !foldedRef.current.has(k), visited: s.visited.has(k) })),
      focus: Math.max(0, keys.indexOf(s.focus)),
      anchor: s.anchor,
      push: s.push,
    })
    s.lastTip = r.base
    s.frontier = r.frontier
    for (const i of r.reached) s.visited.add(keys[i])

    tracer.style.top = `${nodes[0]}px`
    tracer.style.height = `${Math.max(0, r.tip - nodes[0])}px`
    // Scroll drives it 1:1 with no easing (60ms of lag reads as a bug); it
    // glides only when an open or close moves it, or nothing scrolls.
    tracer.classList.toggle('glide', (!scrolls(m) && s.push === 0) || performance.now() < s.easeUntil)
    secs.forEach((el, i) => {
      const k = keys[i]
      const flag = (name: string, on: boolean) => (on ? el.setAttribute(name, '') : el.removeAttribute(name))
      flag('data-visited', s.visited.has(k))
      flag('data-here', i === r.here)
      flag('data-lit', s.visited.has(k) && i + 1 < keys.length && s.visited.has(keys[i + 1]))
      flag('data-armed', i === r.frontier && s.push > 0)
      if (i === r.frontier) el.style.setProperty('--push', s.push.toFixed(3))
    })
    shellRef.current?.classList.toggle('behind', m.scrollTop + m.clientHeight < m.scrollHeight - 2)
  }, [])

  /** Keep the rail glued to sections while they fold or unfold. */
  const follow = useCallback(
    (ms: number) => {
      const end = performance.now() + ms
      const step = () => {
        sync()
        if (performance.now() < end) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    [sync],
  )

  const release = useCallback(() => {
    mem.current.pin = null
  }, [])

  /**
   * Opening a section is reaching it: the tip goes to its number and is held
   * there while it unfolds. A header low in the pane also scrolls up to a
   * comfortable spot; a push never scrolls for you (you are scrolling).
   * Letting go of the hold is harmless: the anchor keeps the tip continuous.
   */
  const reach = useCallback(
    (id: string, reveal: boolean) => {
      const s = mem.current
      const body = bodyRef.current
      const sec = body?.querySelector<HTMLElement>(`:scope > .sb-body-inner > [data-sec="${id}"]`)
      s.focus = id
      s.pin = id
      s.visited.add(id)
      s.easeUntil = performance.now() + (reducedMotion() ? 0 : EASE_MS)
      follow(PIN_MS + 300)
      if (!body || !sec) return
      const low = sec.offsetTop - body.scrollTop > body.clientHeight * 0.62
      if (reveal && low) {
        const top = Math.max(0, sec.offsetTop - body.clientHeight * 0.3)
        if (reducedMotion()) {
          // jump, but anchor on the number at the new scroll before letting
          // go, or the tip re-anchors where it was and never gets there
          body.scrollTop = top
          sync()
          release()
          return
        }
        window.setTimeout(() => {
          if (s.pin !== id) return
          body.addEventListener('scrollend', release, { once: true })
          window.setTimeout(release, 1100)
          body.scrollTo({ top, behavior: 'smooth' })
        }, 60)
      } else window.setTimeout(() => s.pin === id && release(), PIN_MS)
    },
    [follow, release, sync],
  )

  // Sections opened or folded by anything (a header, the push, a hotkey):
  // an open is a reach; a fold moves the tip back to the last open section.
  const prevFolded = useRef(folded)
  useLayoutEffect(() => {
    const prev = prevFolded.current
    prevFolded.current = folded
    if (prev === folded) return
    const s = mem.current
    const keys = idsRef.current
    for (const k of keys) {
      if (prev.has(k) && !folded.has(k)) {
        reach(k, s.pushed !== k)
        s.pushed = null
      }
    }
    if (keys.some((k) => !prev.has(k) && folded.has(k))) {
      if (folded.has(s.focus)) s.focus = [...keys].reverse().find((k) => !folded.has(k)) ?? keys[0] ?? ''
      s.easeUntil = performance.now() + (reducedMotion() ? 0 : EASE_MS)
      follow(PIN_MS + 300)
    }
  }, [folded, reach, follow])

  // ---- the push -------------------------------------------------------------
  // At the end of scroll, scrolling on fills the last gap; PUSH_PX of it
  // unfolds the section below. A flick that reaches the end keeps pushing.
  // Scrolling back up cancels; stopping lets it drain away.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const s = mem.current
    const drain = () => {
      cancelAnimationFrame(s.drain)
      const step = () => {
        if (performance.now() - s.lastPushInput < PUSH_IDLE_MS) {
          s.drain = requestAnimationFrame(step)
          return
        }
        s.push = Math.max(0, s.push - 0.06)
        sync()
        if (s.push > 0) s.drain = requestAnimationFrame(step)
      }
      s.drain = requestAnimationFrame(step)
    }
    const add = (px: number) => {
      s.lastPushInput = performance.now()
      if (px <= 0) {
        if (s.push > 0) {
          s.push = 0
          sync()
        }
        return
      }
      if (s.frontier < 0 || !atEnd(metricsOf(body))) return
      s.push = Math.min(1, s.push + px)
      sync()
      drain()
      if (s.push < 1) return
      const id = idsRef.current[s.frontier]
      s.push = 0
      s.pushed = id
      const sec = body.querySelector<HTMLElement>(`:scope > .sb-body-inner > [data-sec="${id}"]`)
      if (sec) {
        sec.setAttribute('data-popped', '')
        window.setTimeout(() => sec.removeAttribute('data-popped'), 500)
      }
      onToggleRef.current(id)
    }
    const onWheel = (e: WheelEvent) => {
      release() // your scroll always wins
      add(wheelPixels(e, body.clientHeight) / PUSH_PX)
    }
    const onTouchStart = (e: TouchEvent) => {
      release()
      s.touchY = e.touches[0]?.clientY ?? null
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (y == null || s.touchY == null) return
      const dy = s.touchY - y
      s.touchY = y
      add(dy / PUSH_TOUCH_PX)
    }
    const onTouchEnd = () => {
      s.touchY = null
    }
    body.addEventListener('wheel', onWheel, { passive: true })
    body.addEventListener('touchstart', onTouchStart, { passive: true })
    body.addEventListener('touchmove', onTouchMove, { passive: true })
    body.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      body.removeEventListener('wheel', onWheel)
      body.removeEventListener('touchstart', onTouchStart)
      body.removeEventListener('touchmove', onTouchMove)
      body.removeEventListener('touchend', onTouchEnd)
      cancelAnimationFrame(s.drain)
    }
  }, [sync, release])

  useEffect(() => {
    const body = bodyRef.current
    const inner = innerRef.current
    if (!body) return
    body.addEventListener('scroll', sync, { passive: true })
    // The scroller's box (window resize) and the ONE wrapper around every
    // section (every frame of a fold, a section arriving or leaving).
    const ro = new ResizeObserver(sync)
    ro.observe(body)
    if (inner) ro.observe(inner)
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
    <div className={`sidebar-shell${away ? ' away' : ''}`} ref={shellRef} inert={away}>
      <header className="sb-head">
        <h1 className="sb-wordmark">{title}</h1>
        {headActions != null && <div className="sb-head-act">{headActions}</div>}
        <p className="sb-tagline">{tagline}</p>
      </header>
      <div className="sb-mid">
        <div className="sb-body" ref={bodyRef}>
          <i className="tracer" ref={tracerRef} aria-hidden="true" />
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
 * so an absolutely positioned popover inside is never cut off at the
 * section's edge. A folded body is `inert`: nothing in it can take focus or
 * a click. The fold can come from outside (the push, a hotkey), so the clip
 * follows the `open` prop, not just the header's own click.
 */
function Section({ n, id, label, readout, actions, open, onToggle, children }: SectionProps): ReactElement {
  const uid = useId()
  const headId = `${uid}-head`
  const bodyId = `${uid}-body`
  const [moving, setMoving] = useState(false)
  const fallback = useRef<number | null>(null)
  const wasOpen = useRef(open)

  useEffect(() => () => {
    if (fallback.current != null) window.clearTimeout(fallback.current)
  }, [])

  useLayoutEffect(() => {
    if (wasOpen.current === open) return
    wasOpen.current = open
    setMoving(true)
    // transitionend is the normal end; this covers a transition that never
    // starts (display changes, a tab in the background).
    if (fallback.current != null) window.clearTimeout(fallback.current)
    fallback.current = window.setTimeout(() => setMoving(false), 700)
  }, [open])

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
          onClick={() => onToggle(id)}
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
