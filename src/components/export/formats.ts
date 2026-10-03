/**
 * What the Export dialog offers, as data. The dialog renders whatever is in
 * `EXPORT_FORMATS`, grouped and in order; a group with no entries draws no
 * heading. Adding a format (Figma variables, from redesign/figma) is one
 * entry in that list — nothing in the dialog changes.
 *
 * The code formats call the same serializer as the API's /export
 * (api/exports.ts), so a copied file is byte-for-byte what an agent would
 * fetch for the same theme id.
 */
import type { ThemeResult } from '../../engine'
import type { ThemeState } from '../../ops'
import { API_BASE_PATH, appLink, exportText } from '../../api/exports'
import type { ExportFormatId } from '../../api/exports'
import { figmaFormat } from './figmaFormat'

/** Everything a format may read. */
export interface ExportContext {
  result: ThemeResult
  /** The frame's engine state, for formats that rebuild (e.g. a high-contrast variant). */
  state: ThemeState
  /** The theme id: `t_` + a hash of the state, exactly as the API assigns it. */
  id: string
  /** The site the theme lives on — where links point and headers name. */
  origin: string
  /**
   * View settings that ride the share link and never reach exported code:
   * `vision`/`strength` now, page settings (radius, font) when they land.
   */
  linkParams: Record<string, string>
}

export type ExportGroup = 'code' | 'design' | 'links'
export const EXPORT_GROUPS: ExportGroup[] = ['code', 'design', 'links']

/** One line of a `files` preview. */
export interface FileLine {
  name: string
  detail: string
}

export interface CopyAction {
  label: string
  /** What the live region says once it worked. */
  done: string
  text: (ctx: ExportContext) => string
}

export interface ExportFormat {
  id: string
  group: ExportGroup
  name: string
  /** One line under the name in the list. */
  sub: string
  /** What you get, one or two sentences. `backticks` render as code. */
  about: string
  /**
   * What the preview shows. `code` is the first lines with a swatch beside
   * each colour; `link` is one wrapped line. Absent: no preview.
   */
  preview?:
    | { kind: 'code' | 'link'; label: string; text: (ctx: ExportContext) => string }
    /** A list of files, built on demand (a lazy exporter). */
    | { kind: 'files'; label: string; load: (ctx: ExportContext) => Promise<FileLine[]> }
  /** Copy buttons, primary first. */
  copy: CopyAction[]
  download?: {
    filename: (ctx: ExportContext) => string
    /** May be async, for an exporter that is loaded on first use. */
    blob: (ctx: ExportContext) => Blob | Promise<Blob>
  }
  /** A quiet line under the actions. */
  hint?: string
}

/** A code format: preview, Copy, Download — all the same text. */
function codeFormat(
  format: ExportFormatId,
  meta: Pick<ExportFormat, 'id' | 'name' | 'sub' | 'about'>,
  ext: string,
  mime: string,
): ExportFormat {
  const text = (ctx: ExportContext) => exportText(ctx.result, ctx.id, ctx.origin, format)
  return {
    ...meta,
    group: 'code',
    preview: { kind: 'code', label: `preview of ${meta.name}`, text },
    copy: [{ label: 'Copy', done: 'copied', text }],
    download: {
      filename: (ctx) => `chromaconscious-${ctx.id}${ext}`,
      blob: (ctx) => new Blob([text(ctx)], { type: mime }),
    },
  }
}

/** The link that opens this theme, with any view params after the id. */
export function shareLink(origin: string, id: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString()
  return appLink(origin, id) + (q ? `&${q}` : '')
}

/** The agent's starter calls, in the shape public/docs.md teaches them. */
export function agentCalls(origin: string, id: string): string {
  const base = `${origin}${API_BASE_PATH}`
  return [
    id,
    '',
    `curl -s "${base}/theme?theme=${id}"`,
    `curl -s "${base}/export?theme=${id}&format=css"`,
    `curl -s "${base}/export?theme=${id}&format=json&mode=dark"`,
    `curl -s -H "Authorization: Bearer $KEY" "${base}/riff?theme=${id}&hops=3"`,
    '',
    `docs: ${origin}/chromaconscious/docs.md`,
  ].join('\n')
}

export const EXPORT_FORMATS: ExportFormat[] = [
  codeFormat(
    'css',
    {
      id: 'css',
      name: 'CSS variables',
      sub: ':root + .dark',
      about: 'Light in `:root`, dark in `.dark`, plus elevation and scrim. Drop it into any stylesheet.',
    },
    '.css',
    'text/css',
  ),
  codeFormat(
    'tailwind',
    {
      id: 'tailwind',
      name: 'Tailwind v4',
      sub: 'CSS + @theme inline',
      about:
        'The same variables, plus an `@theme inline` bridge, so `bg-primary` and `shadow-elevation-2` work in Tailwind v4.',
    },
    '.tailwind.css',
    'text/css',
  ),
  codeFormat(
    'json',
    {
      id: 'json',
      name: 'Design tokens',
      sub: 'DTCG JSON',
      about:
        'W3C design tokens (DTCG): every token is `{ $type, $value }`, per mode, with the theme id in `$extensions`.',
    },
    '.tokens.json',
    'application/json',
  ),
  figmaFormat,
  {
    id: 'share',
    group: 'links',
    name: 'Share link',
    sub: 'this theme, by id',
    about:
      // TODO(share-storage): the app doesn't store the theme yet, so this id
      // only opens once something has saved it (Drew to decide how). Until
      // then, don't promise that it opens.
      'A link to this theme by its id. View settings such as a colorblind simulation ride along in the link; they never reach the exported code. The id is the same one the API gives this theme.',
    preview: {
      kind: 'link',
      label: 'share link',
      text: (ctx) => shareLink(ctx.origin, ctx.id, ctx.linkParams),
    },
    copy: [
      {
        label: 'Copy link',
        done: 'link copied',
        text: (ctx) => shareLink(ctx.origin, ctx.id, ctx.linkParams),
      },
    ],
  },
  {
    id: 'api',
    group: 'links',
    name: 'API / agent link',
    sub: 'the theme id',
    about:
      'The theme id is all an agent needs: it can read, export or keep riffing this theme over the API. Reading needs no key; making new themes does.',
    preview: { kind: 'code', label: 'API calls', text: (ctx) => agentCalls(ctx.origin, ctx.id) },
    copy: [
      { label: 'Copy id', done: 'id copied', text: (ctx) => ctx.id },
      { label: 'Copy calls', done: 'calls copied', text: (ctx) => agentCalls(ctx.origin, ctx.id) },
    ],
  },
]

/** The share-link params for a frame's colorblind simulation. Typical adds none. */
export function visionParams(vision: string, strength: number): Record<string, string> {
  if (vision === 'typical') return {}
  const pct = Math.round(strength * 100)
  return pct >= 100 ? { vision } : { vision, strength: String(pct) }
}
