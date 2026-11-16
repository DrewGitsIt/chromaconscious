/**
 * The pane's tracer, as pure functions of the scroller's metrics.
 *
 * The section numbers are the rail. A white tracer runs down it from the
 * first number, and its tip is a reading line: at the content's top when
 * the pane is scrolled to the top, at the content's bottom when it is
 * scrolled to the end, linear in between, so every pixel of scroll moves it
 * (it behaves like a scrollbar, mapped back onto the content).
 *
 * The plain scrollbar mapping jumps whenever the pane changes height: open a
 * section at the bottom and maxScroll triples, so the same scrollTop maps
 * ~200px higher, and the tip recoils up the rail. That is why an `Anchor`
 * exists: whenever the height changes, the shell re-anchors at
 * (current scrollTop, current tip), and the mapping runs as two straight
 * lines from there, down to the top at scrollTop 0 and on to the bottom at
 * the end of scroll. Still exact at both ends, still monotonic, and a height
 * change can never move the tip.
 *
 * Below the last open section, a folded section waits; scrolling alone takes
 * the tip only to the end of the open content. The last gap is the push: a
 * scroll past the end fills it, and touching the folded number unfolds it.
 *
 * Keeping the maths free of the DOM is what lets a unit test pin it
 * (tracer.test.ts); SidebarShell does the measuring and the writing.
 */
export interface ScrollMetrics {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

/** Where the mapping was pinned the last time the pane changed height. */
export interface Anchor {
  scrollTop: number
  tip: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Whether the pane scrolls at all. Below a pixel it does not, as far as anyone can tell. */
export const scrolls = (m: ScrollMetrics): boolean => m.scrollHeight - m.clientHeight > 1

/** At the end of scroll (or nowhere to scroll): where a push can happen. */
export const atEnd = (m: ScrollMetrics): boolean => m.scrollTop + m.clientHeight >= m.scrollHeight - 1

/** The reading line, in content coordinates. 0 when the pane does not scroll. */
export function readingLine(m: ScrollMetrics, anchor: Anchor | null): number {
  const max = m.scrollHeight - m.clientHeight
  if (max <= 1) return 0
  const st = clamp(m.scrollTop, 0, max)
  // the plain scrollbar mapping, until the pane has changed height once
  if (!anchor || anchor.scrollTop > max + 0.5) return (st * m.scrollHeight) / max
  if (st <= anchor.scrollTop) return anchor.scrollTop > 0 ? (anchor.tip * st) / anchor.scrollTop : anchor.tip
  return anchor.tip + ((m.scrollHeight - anchor.tip) * (st - anchor.scrollTop)) / Math.max(1, max - anchor.scrollTop)
}

export interface SectionState {
  open: boolean
  /** Opened, or reached by the tracer, at least once in this flow. */
  visited: boolean
}

/**
 * The push target: the section right after the LAST open one, if it is
 * folded and has never been reached. A folded section above an open one is
 * not a target; the tracer passes straight through it (open riff directly
 * and the line runs through tuning's number to get there). -1 when none.
 */
export function frontierIndex(secs: SectionState[]): number {
  let last = -1
  secs.forEach((s, i) => {
    if (s.open) last = i
  })
  const next = last + 1
  if (last < 0 || next >= secs.length || secs[next].open || secs[next].visited) return -1
  return next
}

export interface TraceInput {
  metrics: ScrollMetrics
  /** Each section's number, centre y, in content coordinates. */
  nodes: number[]
  /** Each section's bottom edge, in content coordinates. */
  ends: number[]
  sections: SectionState[]
  /** The section last opened: where the tip sits when the pane does not scroll. */
  focus: number
  anchor: Anchor | null
  /** How far the push has filled the last gap, 0..1. */
  push: number
}

export interface TraceResult {
  /** Where scrolling alone puts the tip (no push). The shell re-anchors from this. */
  base: number
  tip: number
  /** The number the tip has reached last: the section you are in. */
  here: number
  /** Every section whose number the tip has reached, except the push target. */
  reached: number[]
  frontier: number
}

export function trace({ metrics, nodes, ends, sections, focus, anchor, push }: TraceInput): TraceResult {
  const n = nodes.length
  const frontier = frontierIndex(sections)
  const first = nodes[0] ?? 0
  // how far scrolling alone may carry the tip: to the end of the last open
  // section before the push target, or to the last number
  const cap = frontier > 0 ? ends[frontier - 1] : (nodes[n - 1] ?? first)
  const reading = scrolls(metrics) ? readingLine(metrics, anchor) : (nodes[clamp(focus, 0, n - 1)] ?? first)
  const base = clamp(reading, first, Math.max(first, cap))
  const tip = frontier > 0 ? base + clamp(push, 0, 1) * (nodes[frontier] - base) : base
  let here = 0
  const reached: number[] = []
  nodes.forEach((y, i) => {
    if (y > tip + 0.5) return
    here = i
    // touching the push target is what the push is FOR; it unfolds instead
    if (i !== frontier) reached.push(i)
  })
  return { base, tip, here, reached, frontier }
}

/** A wheel delta in pixels, whatever unit the device reported it in. */
export function wheelPixels(e: { deltaY: number; deltaMode: number }, pageHeight: number): number {
  if (e.deltaMode === 1) return e.deltaY * 16
  if (e.deltaMode === 2) return e.deltaY * pageHeight
  return e.deltaY
}

/**
 * The push, decided 2026-11-16 by hand on a trackpad: 40px of scroll past the
 * end unfolds the next section, and a flick that reaches the end keeps
 * pushing (no "arrive, then push" pause). A finger travels a bit less.
 */
export const PUSH_PX = 40
export const PUSH_TOUCH_PX = 26
/** ms of wheel silence after which an unfinished push drains away. */
export const PUSH_IDLE_MS = 140
