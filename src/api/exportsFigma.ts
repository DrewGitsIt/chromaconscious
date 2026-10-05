/**
 * The Figma half of the shared serializer (see exports.ts). Its own module so
 * the app can import it lazily: it pulls in fflate and the per-level builds,
 * which the main bundle should not carry.
 *
 * The zip is built only in the browser (the Export dialog): it costs more CPU
 * than a Workers free-plan request has. The API serves each mode file
 * (`figmaModeFile`), and every file in the dialog's zip is byte-for-byte the
 * API's file for that mode.
 */
import { FIGMA_MODE_NAMES, figmaExport, figmaLevel, figmaModeFiles } from '../figmaExport'
import type { FigmaExport } from '../figmaExport'
import type { FigmaModeFile } from '../engine'
import type { ThemeState } from '../ops'

export { FIGMA_MODE_NAMES }

/** The dialog's download: every mode file, zipped. Null when there are no colours. */
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

/**
 * What `/export?format=figma` without `mode=` returns: where each mode file
 * is, so a caller fetches the ones it wants, one cheap request each.
 * `ref` is the query that names the theme: `theme=t_…` or `state=…`.
 */
export function figmaIndex(apiBase: string, ref: string, id: string) {
  return {
    theme: id,
    note: "One DTCG file per mode. Import them into Figma's Local variables (Import); on the free plan, import each file as its own collection. The app's Export dialog builds all of them as one .zip, with a README, in your browser.",
    files: FIGMA_MODE_NAMES.map((mode) => ({
      mode,
      filename: `${mode}.json`,
      url: `${apiBase}/export?${ref}&format=figma&mode=${mode}`,
    })),
  }
}
