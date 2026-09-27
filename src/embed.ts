/**
 * `?embed=1`: the compact layout drewkidwell.com frames on its Projects page,
 * roughly 700×440. There is no room for the sidebar beside a mockup at that
 * size, so the sidebar becomes a drawer, the frame's label row carries the
 * verbs a visitor reaches for first (riff, back), and the app opens on a
 * preset so the frame never starts blank.
 *
 * Read once at load: an embed is a page, not a mode you switch into.
 */
import { PRESETS } from './presets'

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)

export const EMBED = params.has('embed')

/** The preset an embed opens on — `?preset=neon-arcade`, else the first one. */
export function embedPreset() {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const want = params.get('preset')
  return PRESETS.find((p) => want != null && slug(p.name) === slug(want)) ?? PRESETS[0]
}

/** The full app, for the embed's "open" link: this page without its query. */
export const fullAppHref = () => (typeof location === 'undefined' ? '/' : location.pathname)
