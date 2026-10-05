import { isVision } from './engine/cvd'
import type { Vision } from './engine/cvd'
import { isThemeId } from './api/state'
import type { PageSettings } from './pageSettings'
import { parsePageParams } from './pageSettings'

interface LinkView {
  /** Only ever a simulation: `typical`, or no `vision=` at all, comes back null. */
  vision: { vision: Vision; strength: number } | null
  /** Page settings the link carries (`radius=`, `font=`); `{}` when none. */
  page: Partial<PageSettings>
}

/**
 * What a link opens: a stored theme by id (`#t_…`, fetched from the API), or
 * a theme carried whole in the link (`#s=<payload>`, api/stateLink.ts, opened
 * with no network). `state` is the raw payload; decoding it is the caller's,
 * so a malformed one can be reported rather than silently ignored.
 */
export type ThemeLink = LinkView & ({ id: string; state?: undefined } | { state: string; id?: undefined })

/**
 * Read `#t_xxx` or `#t_xxx&vision=deutan&strength=60&radius=4&font=tinos`, or the
 * same with `s=<payload>` in place of the id. The theme is whatever
 * precedes the first `&`, so the parameters can never change which theme opens
 * and an agent can append them to an `open` link by hand. A vision we don't
 * know is dropped rather than failing the link — the theme still opens. The
 * strength is a percent, defaulting to full, clamped to the slider's range.
 * The page settings (pageSettings.ts) follow the same rule: an unknown font or
 * an unreadable radius is dropped, independently of the vision.
 */
export function parseThemeHash(hash: string): ThemeLink | null {
  const [head, ...rest] = hash.replace(/^#/, '').split('&')
  const ref = isThemeId(head) ? { id: head } : head.startsWith('s=') ? { state: head.slice(2) } : null
  if (!ref) return null
  const params = new URLSearchParams(rest.join('&'))
  const page = parsePageParams(params)
  const v = params.get('vision')
  if (v === null || !isVision(v) || v === 'typical') return { ...ref, vision: null, page }
  const pct = parseInt(params.get('strength') ?? '', 10)
  const strength = Number.isNaN(pct) ? 1 : Math.min(100, Math.max(10, pct)) / 100
  return { ...ref, vision: { vision: v, strength }, page }
}
