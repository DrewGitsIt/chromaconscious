#!/usr/bin/env node
/**
 * Cut the font dropdown's specimens: one tiny woff2 per face holding ONLY the
 * glyphs of that face's own name, so the menu can show every option in its
 * face for ~1–2 KB each instead of fetching fifteen whole fonts on open.
 *
 *   node scripts/font-specimens.mjs
 *
 * Reads the font table from src/pageSettings.ts (Node strips the types) and
 * the source files from node_modules/@fontsource*, writes
 * src/assets/font-specimens/<id>.woff2. Re-run it after changing a name or
 * adding a font; the output is committed, so the build never runs it.
 * Variable faces are pinned at their body weight, which also drops the axis.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import subsetFont from 'subset-font'
import { PAGE_FONTS } from '../src/pageSettings.ts'

/**
 * Each face's latin woff2 in node_modules, and the wght to pin a variable
 * face at (its body weight). The system stack and Geist (the chrome's own
 * face, already loaded) need no specimen.
 */
const SOURCES = {
  'inter': { file: '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', wght: 400 },
  'arimo': { file: '@fontsource-variable/arimo/files/arimo-latin-wght-normal.woff2', wght: 500 },
  'plex': { file: '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2', wght: 400 },
  'source-sans': { file: '@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2', wght: 400 },
  'atkinson': { file: '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2' },
  'nunito': { file: '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2', wght: 400 },
  'outfit': { file: '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2', wght: 400 },
  'space-grotesk': { file: '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2', wght: 400 },
  'barlow': { file: '@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2' },
  'tinos': { file: '@fontsource/tinos/files/tinos-latin-400-normal.woff2' },
  'source-serif': { file: '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2', wght: 400 },
  'playfair': { file: '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2', wght: 400 },
  'fraunces': { file: '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2', wght: 400 },
  'roboto-slab': { file: '@fontsource-variable/roboto-slab/files/roboto-slab-latin-wght-normal.woff2', wght: 400 },
  'jetbrains-mono': { file: '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', wght: 400 },
}

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'src/assets/font-specimens')
await mkdir(out, { recursive: true })

let total = 0
for (const f of PAGE_FONTS) {
  const spec = SOURCES[f.id]
  if (!spec) continue
  const src = await readFile(path.join(root, 'node_modules', spec.file))
  const buf = await subsetFont(src, f.name, {
    targetFormat: 'woff2',
    noHinting: true, // 16px names on screen; hinting was most of the bytes
    ...(spec.wght ? { variationAxes: { wght: spec.wght } } : {}),
  })
  await writeFile(path.join(out, `${f.id}.woff2`), buf)
  total += buf.length
  console.log(`${f.id.padEnd(16)} ${String(buf.length).padStart(6)} B  "${f.name}"`)
}
console.log(`total ${total} B`)
