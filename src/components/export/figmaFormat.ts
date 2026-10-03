/**
 * Figma variables: download-only, a zip of one DTCG file per mode.
 *
 * The exporter (and fflate) is loaded on first use, so it costs the main
 * bundle nothing. It calls `figmaZip` from api/exportsFigma.ts, the same
 * function `/export?format=figma` calls, so the bytes match the API's.
 */
import type { ExportContext, ExportFormat, FileLine } from './formats'
import type { FigmaExport } from '../../figmaExport'

/** One build per theme: the preview and the download share it. */
const built = new WeakMap<ExportContext, Promise<FigmaExport>>()

function build(ctx: ExportContext): Promise<FigmaExport> {
  let p = built.get(ctx)
  if (!p) {
    p = import('../../api/exportsFigma').then(({ figmaZip }) => {
      const zip = figmaZip(ctx.state, ctx.id)
      if (!zip) throw new Error('no colors to export')
      return zip
    })
    built.set(ctx, p)
  }
  return p
}

/** Colour variables in a mode file: theme tokens plus ramp steps. */
function variables(json: string): number {
  const doc = JSON.parse(json) as { color?: object; ramp?: Record<string, object> }
  const ramps = Object.values(doc.ramp ?? {}).reduce<number>((n, steps) => n + Object.keys(steps).length, 0)
  return Object.keys(doc.color ?? {}).length + ramps
}

const kb = (s: string) => `${(new TextEncoder().encode(s).length / 1024).toFixed(1)} KB`

export const figmaFormat: ExportFormat = {
  id: 'figma',
  group: 'design',
  name: 'Figma variables',
  sub: '.zip · one file per mode',
  about:
    "One DTCG file per mode and contrast level, for Figma's native variable import (Local variables › Import), plus a README with the steps.",
  preview: {
    kind: 'files',
    label: 'files in the zip',
    load: async (ctx): Promise<FileLine[]> => {
      const zip = await build(ctx)
      return [
        ...zip.files.map((f) => ({ name: f.filename, detail: `${variables(f.json)} variables · ${kb(f.json)}` })),
        { name: 'README.txt', detail: 'import steps for paid and free plans' },
      ]
    },
  },
  copy: [],
  download: {
    filename: (ctx) => `chromaconscious-${ctx.id}-figma.zip`,
    blob: async (ctx) => new Blob([(await build(ctx)).bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
  },
  hint: "On Figma's free plan, import each file as its own collection. Shadows aren't Figma variables; they're kept in the file for a future plugin.",
}
