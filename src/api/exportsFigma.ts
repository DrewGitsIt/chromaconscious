/**
 * The Figma half of the shared serializer (see exports.ts). Its own module so
 * the app can import it lazily: it pulls in fflate and the per-level builds,
 * which the main bundle should not carry. The API's `/export?format=figma`
 * and the Export dialog both call `figmaZip`, so their bytes cannot differ.
 */
import { FIGMA_MODE_NAMES, figmaExport, figmaLevel, figmaModeFiles } from '../figmaExport'
import type { FigmaExport } from '../figmaExport'
import type { FigmaModeFile } from '../engine'
import type { ThemeState } from '../ops'

export { FIGMA_MODE_NAMES }

/** The zip `/export?theme=<id>&format=figma` returns. Null when there are no colours. */
export const figmaZip = (state: ThemeState, id: string): FigmaExport | null =>
  figmaExport(state, `chromaconscious-${id}`)

/** One mode file, as `&mode=<name>` returns it, named for its theme. Null when there are no colours. */
export function figmaModeFile(
  state: ThemeState,
  id: string,
  mode: string,
): (FigmaModeFile & { download: string }) | null {
  const file = figmaModeFiles(state, [figmaLevel(mode)])?.find((f) => f.name === mode)
  return file ? { ...file, download: `${id}-${file.filename}` } : null
}
