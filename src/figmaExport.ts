/**
 * The Figma variables download: one DTCG file per mode × contrast level, in a
 * zip, plus a README. A pure function of the theme's state, so the Export
 * dialog (client-side) and `/export?format=figma` (the API) emit the same
 * bytes — the API test holds them to it.
 *
 * The contrast levels are the slider's three detents, whatever the slider is
 * set to: a designer who picks `high` later should find it already imported,
 * and Figma switches modes for free. Medium is included because it is a detent
 * the app offers; leaving it out would make one of the app's own settings
 * unexportable, for the price of two small files.
 */
import { strToU8, zipSync } from 'fflate'
import type { ContrastLevelName, FigmaModeFile } from './engine'
import { CONTRAST_LEVELS, FIGMA_LEVELS, figmaModeName, themeFigmaModes } from './engine'
import type { ThemeState } from './ops'
import { buildTheme } from './ops'

export interface FigmaExport {
  filename: string
  /** The zip. */
  bytes: Uint8Array
  /** What is in it, for a UI that wants to list or preview the files. */
  files: FigmaModeFile[]
}

/**
 * Every mode file, standard first, or only those of `levels` (one theme build
 * per level, so a single-file request pays for one). Null when the state has
 * no colours yet.
 */
export function figmaModeFiles(
  state: ThemeState,
  levels: readonly ContrastLevelName[] = FIGMA_LEVELS,
): FigmaModeFile[] | null {
  const byLevel = Object.fromEntries(
    levels.map((level) => [level, buildTheme({ ...state, contrast: CONTRAST_LEVELS[level] })]),
  )
  if (Object.values(byLevel).some((r) => !r)) return null
  return themeFigmaModes(byLevel as Parameters<typeof themeFigmaModes>[0])
}

/** The mode names a single-file request may ask for: light, dark, light-medium, … */
export const FIGMA_MODE_NAMES = FIGMA_LEVELS.flatMap((level) =>
  (['light', 'dark'] as const).map((mode) => figmaModeName(mode, level)),
)

/** The contrast level a mode name was built at: `dark-high` → high. */
export function figmaLevel(name: string): ContrastLevelName {
  return FIGMA_LEVELS.find((level) => name.endsWith(`-${level}`)) ?? 'standard'
}

/**
 * Zip entries carry a DOS timestamp in LOCAL time (fflate reads it with
 * getFullYear/getHours). A fixed instant would encode differently in the
 * browser's timezone and the Worker's UTC, so build the date from local fields:
 * every timezone then writes the same bytes. Noon, so no DST gap can eat it.
 */
const FIXED_MTIME = () => new Date(1980, 0, 1, 12, 0, 0)

function readme(files: FigmaModeFile[]): string {
  const doc = JSON.parse(files[0].json) as { color: object; ramp: Record<string, object> }
  const colors = Object.keys(doc.color).length
  const ramps = Object.values(doc.ramp).reduce<number>((n, steps) => n + Object.keys(steps).length, 0)
  const names = files.map((f) => f.filename)
  return `ChromaConscious: Figma variables
================================

Each .json file is one mode, in Figma's DTCG variable format:

  ${names.join('\n  ')}

light / dark are the theme at standard contrast; -medium and -high are the
same theme at the contrast slider's other two settings.

Every file defines the same ${colors + ramps} colour variables:
  color/...   ${colors} theme tokens (background, primary, ...; color/scrim has alpha)
  ramp/...    ${ramps} ramp steps (ramp/primary/1 ... ramp/primary/12, per ramp)


IMPORT ON A PAID PLAN (Professional, Organization, Enterprise)
--------------------------------------------------------------
1. Open the Local variables panel and create a new collection.
2. Drag all ${files.length} files in at once (or just light.json and dark.json).
   Figma makes one mode per file, named after the file.
3. Switch a frame between modes to swap light, dark and contrast levels.


IMPORT ON THE FREE STARTER PLAN (one mode per collection)
---------------------------------------------------------
Import each file as its own collection:
1. Create a collection named, say, "ChromaConscious light". Drag in light.json.
2. Create another, "ChromaConscious dark". Drag in dark.json.
3. Repeat for any contrast variants you want.
A free collection cannot switch modes, so to move a design from light to dark,
rebind its fills to the same-named variable in the other collection.


NOTES
-----
- Colours are sRGB. Each value carries its hex too, so you can spot-check:
  a variable's hex in Figma should match the hex in the file and in the app.
- Shadows have no Figma variable type. The elevation shadows are in each
  file under $extensions.chromaconscious.shadows; Figma skips them on import.
- Values are plain colours, not aliases between variables.
`
}

/** The whole download. Null when the state has no colours yet. */
export function figmaExport(state: ThemeState, basename = 'chromaconscious'): FigmaExport | null {
  const files = figmaModeFiles(state)
  if (!files) return null
  const mtime = FIXED_MTIME()
  const entries = Object.fromEntries([
    ['README.txt', [strToU8(readme(files)), { mtime }]],
    ...files.map((f) => [f.filename, [strToU8(f.json), { mtime }]]),
  ]) as Parameters<typeof zipSync>[0]
  return { filename: `${basename}-figma.zip`, bytes: zipSync(entries, { level: 6 }), files }
}
