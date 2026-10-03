import { useCallback, useRef, useState } from 'react'
import type { PageSettings } from './pageSettings'
import { DEFAULT_PAGE, clampRadius, isPageFontId, loadPageFont } from './pageSettings'

/**
 * The app's one copy of the page settings. A font pick fetches the face
 * first and applies it once it's there, so the preview swaps once, straight
 * from the old face to the new one. Picks race: only the latest lands.
 */
export function usePageSettings(): {
  page: PageSettings
  setRadius: (px: number) => void
  setFont: (id: string) => void
} {
  const [page, setPage] = useState<PageSettings>(DEFAULT_PAGE)
  const latest = useRef(0)
  const setRadius = useCallback((px: number) => setPage((p) => ({ ...p, radius: clampRadius(px) })), [])
  const setFont = useCallback((id: string) => {
    if (!isPageFontId(id)) return
    const ticket = ++latest.current
    void loadPageFont(id)
      .catch(() => {})
      .then(() => {
        if (ticket === latest.current) setPage((p) => ({ ...p, font: id }))
      })
  }, [])
  return { page, setRadius, setFont }
}
