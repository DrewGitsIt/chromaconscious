import { pageFontById } from './pageSettings'

/**
 * The font dropdown's specimens: each face cut down to the glyphs of its own
 * name (scripts/font-specimens.mjs), ~1–2 KB apiece, ~22 KB for all fifteen.
 *
 * Why not the real fonts, or load-on-hover? Opening the menu shows ~12 names
 * at once; fetching each face's latin file for that would be ~300 KB before a
 * pick, and hover-only loading would show most names in the fallback face,
 * which is the one thing the menu is for. Inlined as data URLs, all of them
 * arrive in this one lazy chunk (one request, the first time the trigger is
 * hovered, focused or opened), and the main bundle carries none of it.
 *
 * Registered under their own family names (`cc-specimen-<id>`), so a specimen
 * can never stand in for the full face in the preview.
 */
const FILES = import.meta.glob<string>('./assets/font-specimens/*.woff2', {
  query: '?inline',
  import: 'default',
  eager: true,
})

export function registerSpecimens(): void {
  if (typeof FontFace === 'undefined' || !document.fonts) return
  for (const [file, url] of Object.entries(FILES)) {
    const id = file.replace(/^.*\/|\.woff2$/g, '')
    const face = new FontFace(`cc-specimen-${id}`, `url(${url})`, { weight: String(pageFontById(id).weight) })
    document.fonts.add(face)
    face.load().catch(() => {})
  }
}
