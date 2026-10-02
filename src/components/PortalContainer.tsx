import { createContext, useContext, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Where the ui wrappers' Portals mount. `undefined` is Base UI's own default,
 * `<body>`. A frame with a colorblind filter on it supplies its own layer
 * instead: a menu portaled to the body would open in true color next to a
 * simulated page.
 */
const PortalContainerContext = createContext<HTMLElement | undefined>(undefined)

export const usePortalContainer = (): HTMLElement | undefined => useContext(PortalContainerContext)

/**
 * Wraps one frame and, while `filter` is set, gives its portals a layer that
 * carries the same filter.
 *
 * The layer is a click-through, full-viewport `position: fixed` element on
 * `<body>`, where Base UI's portals go anyway, not an element inside the
 * frame. A `filter` makes its element the containing block for fixed and
 * absolute descendants, and Base UI positions some popups
 * (a Select aligned to its trigger) with `position: fixed` in viewport
 * coordinates. Inside the filtered `.frame` those landed offset by the frame's
 * own position on screen. A layer whose box IS the viewport is a containing
 * block that changes nothing, so every popup lands exactly where it does with
 * no filter, and is still simulated. It has to be on the body: the artboard's
 * entrance animation fills a `transform`, and Chrome treats that as a
 * containing block too, long after the animation ends.
 */
export function PortalScope({
  filter,
  children,
}: {
  /** A CSS filter value, or null for no simulation (portals go to body). */
  filter: string | null
  children: ReactNode
}): ReactElement {
  const [el, setEl] = useState<HTMLElement | null>(null)
  return (
    <PortalContainerContext value={filter ? (el ?? undefined) : undefined}>
      {children}
      {filter && createPortal(<div className="portal-layer" style={{ filter }} ref={setEl} />, document.body)}
    </PortalContainerContext>
  )
}
