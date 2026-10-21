/**
 * Browser-only: the font files behind each face in pageSettings.ts.
 *
 * Kept out of pageSettings.ts on purpose. The API worker imports that file
 * for the faces' names, stacks and packages; if the dynamic `@fontsource`
 * imports lived there too, the worker's bundler would follow them into CSS
 * and woff2 files it has no loader for, and the deploy would fail.
 */
import { FONT_DEFAULT, pageFontById } from './pageSettings'

/**
 * Fetch a face's files. One lazy chunk per font (its @fontsource CSS and the
 * woff2 files it points at), so none of this is in the main bundle; the
 * per-script files then load only for glyphs the page actually uses
 * (unicode-range). Waits for the latin file so the preview swaps once,
 * straight from the old face to the new one, with no fallback flash.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  system: async () => {},
  geist: async () => {}, // the chrome's own face, already loaded
  inter: () => import('@fontsource-variable/inter'),
  arimo: () => import('@fontsource-variable/arimo'),
  plex: () => import('@fontsource-variable/ibm-plex-sans'),
  'source-sans': () => import('@fontsource-variable/source-sans-3'),
  atkinson: () => Promise.all([import('@fontsource/atkinson-hyperlegible/400.css'), import('@fontsource/atkinson-hyperlegible/700.css')]),
  nunito: () => import('@fontsource-variable/nunito'),
  outfit: () => import('@fontsource-variable/outfit'),
  'space-grotesk': () => import('@fontsource-variable/space-grotesk'),
  barlow: () => Promise.all([import('@fontsource/barlow-condensed/500.css'), import('@fontsource/barlow-condensed/700.css')]),
  tinos: () => Promise.all([import('@fontsource/tinos/400.css'), import('@fontsource/tinos/700.css')]),
  'source-serif': () => import('@fontsource-variable/source-serif-4'),
  playfair: () => import('@fontsource-variable/playfair-display'),
  fraunces: () => import('@fontsource-variable/fraunces'),
  'roboto-slab': () => import('@fontsource-variable/roboto-slab'),
  'jetbrains-mono': () => import('@fontsource-variable/jetbrains-mono'),
}

export async function loadPageFont(id: string): Promise<void> {
  const f = pageFontById(id)
  await LOADERS[f.id]?.()
  if (f.id === FONT_DEFAULT || f.id === 'geist' || typeof document === 'undefined' || !document.fonts) return
  const family = f.stack.split(',')[0]
  try {
    await Promise.all([
      document.fonts.load(`${f.weight} 16px ${family}`),
      document.fonts.load(`${f.headingWeight} 16px ${family}`),
    ])
  } catch {
    // The fallback stack still renders; never block the pick on a font file.
  }
}
