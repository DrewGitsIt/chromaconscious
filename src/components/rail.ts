/**
 * The sidebar rail's geometry, as a pure function of the scroller's metrics.
 *
 * The rail and the scroller share one positioned box (SidebarShell's
 * `.sb-mid`), so rail space IS scroll space scaled by one factor,
 * `k = railHeight / scrollHeight`. The thumb is the viewport scaled by k and
 * each tick is its section's top scaled by k. Because both go through the same
 * linear map, the invariant the rail exists to show holds by construction:
 *
 *   a tick lies inside the thumb exactly when its section's top is inside the
 *   scroll viewport.
 *
 * v1 of the mockup broke this three ways (a hard-coded coordinate frame,
 * stale positions while sections animated, and eased lag). Keeping the maths
 * here, with no DOM, is what lets a unit test pin it.
 */
export interface RailInput {
  /** The rail's own height, px. */
  railH: number
  /** The scroller's scrollHeight. */
  scrollH: number
  /** The scroller's clientHeight — the viewport. */
  clientH: number
  /** The scroller's scrollTop. */
  scrollTop: number
  /** Each section's top, in the scroller's content coordinates (offsetTop). */
  tops: number[]
}

export interface RailGeometry {
  thumbTop: number
  thumbH: number
  /** One y per section, in rail coordinates. */
  ticks: number[]
  /** Index of the section you are "in" — the last whose top has passed a third of the way down. */
  here: number
  /** False when everything fits: the thumb would span the whole rail, so it is hidden. */
  scrollable: boolean
  /** Content sits below the fold, behind the footer — the footer's lift-off shadow shows. */
  behind: boolean
}

export function railGeometry({ railH, scrollH, clientH, scrollTop, tops }: RailInput): RailGeometry {
  const k = scrollH > 0 ? railH / scrollH : 0
  const atEnd = scrollTop + clientH >= scrollH - 2
  const scrollable = scrollH > clientH + 1
  let here = 0
  tops.forEach((t, i) => {
    if (t <= scrollTop + clientH * 0.33) here = i
  })
  // At the very bottom the last section may never reach the one-third line;
  // it is still the one you are looking at. (v1 forced the last *possible*
  // stage here, even a greyed-out one; this is the last one that exists.)
  if (atEnd && scrollable && tops.length > 0) here = tops.length - 1
  return {
    thumbTop: scrollTop * k,
    thumbH: clientH * k,
    ticks: tops.map((t) => t * k),
    here,
    scrollable,
    behind: scrollTop + clientH < scrollH - 2,
  }
}

/** The invariant itself, for tests: is tick i inside the thumb iff section i is in view? */
export function railInvariantHolds(input: RailInput, g = railGeometry(input), eps = 0.5): boolean {
  return input.tops.every((top, i) => {
    const inView = top >= input.scrollTop - eps && top <= input.scrollTop + input.clientH + eps
    const y = g.ticks[i]
    const k = input.scrollH > 0 ? input.railH / input.scrollH : 0
    const e = eps * Math.max(k, 1e-9)
    const inThumb = y >= g.thumbTop - e && y <= g.thumbTop + g.thumbH + e
    return inView === inThumb
  })
}

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Scroll the pane so section `id` sits at the top. The rail's ticks call it,
 * and so do the hotkeys, which open a folded section and then bring it into
 * view.
 */
export function revealSection(id: string): void {
  const body = document.querySelector<HTMLElement>('.sidebar-shell .sb-body')
  const sec = body?.querySelector<HTMLElement>(`[data-sec="${id}"]`)
  if (!body || !sec) return
  body.scrollTo({ top: Math.max(0, sec.offsetTop - 6), behavior: reducedMotion() ? 'auto' : 'smooth' })
}
