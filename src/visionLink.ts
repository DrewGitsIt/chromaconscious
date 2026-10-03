import { isVision } from './engine/cvd'
import type { Vision } from './engine/cvd'
import { isThemeId } from './api/state'
import type { PageSettings } from './pageSettings'
import { parsePageParams } from './pageSettings'

export interface ThemeLink {
  id: string
  /** Only ever a simulation: `typical`, or no `vision=` at all, comes back null. */
  vision: { vision: Vision; strength: number } | null
  /** Page settings the link carries (`radius=`, `font=`); `{}` when none. */
  page: Partial<PageSettings>
}

/**
 * Read `#t_xxx` or `#t_xxx&vision=deutan&strength=60&radius=4&font=tinos`. The id is whatever
 * precedes the first `&`, so the parameters can never change which theme opens
 * and an agent can append them to an `open` link by hand. A vision we don't
 * know is dropped rather than failing the link — the theme still opens. The
 * strength is a percent, defaulting to full, clamped to the slider's range.
 * The page settings (pageSettings.ts) follow the same rule: an unknown font or
 * an unreadable radius is dropped, independently of the vision.
 */
export function parseThemeHash(hash: string): ThemeLink | null {
  const [id, ...rest] = hash.replace(/^#/, '').split('&')
  if (!isThemeId(id)) return null
  const params = new URLSearchParams(rest.join('&'))
  const page = parsePageParams(params)
  const v = params.get('vision')
  if (v === null || !isVision(v) || v === 'typical') return { id, vision: null, page }
  const pct = parseInt(params.get('strength') ?? '', 10)
  const strength = Number.isNaN(pct) ? 1 : Math.min(100, Math.max(10, pct)) / 100
  return { id, vision: { vision: v, strength }, page }
}
