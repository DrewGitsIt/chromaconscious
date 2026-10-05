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
import { API_BASE_PATH, exportText, stateAppLink } from '../../api/exports'
import type { ExportFormatId } from '../../api/exports'
import { figmaFormat } from './figmaFormat'

/** Everything a format may read. */
export interface ExportContext {
  result: ThemeResult
  /** The frame's engine state, for formats that rebuild (e.g. a high-contrast variant). */
  state: ThemeState
  /** The theme id: `t_` + a hash of the state, exactly as the API assigns it. */
  id: string
  /** The whole state, packed for a link (api/stateLink.ts): what `#s=` and `state=` carry. */
  payload: string
  /** The site the theme lives on — where links point and headers name. */
  origin: string
  /**
   * View settings that ride the share link and never reach exported code:
   * `vision`/`strength`, then the page settings (`radius`, `font`).
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
  const text = (ctx: ExportContext) => exportText(ctx.result, ctx, ctx.origin, format)
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

/** The link that opens this theme, carried whole, with any view params after it. */
export function shareLink(origin: string, payload: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString()
  return stateAppLink(origin, payload) + (q ? `&${q}` : '')
}

/**
 * The agent's starter calls, in the shape public/docs.md teaches them. Each
 * carries the theme as `state=`, so none needs a key or a stored theme;
 * only riff, which makes a new theme, needs a key.
 */
export function agentCalls(origin: string, payload: string): string {
  const base = `${origin}${API_BASE_PATH}`
  const ref = `state=${payload}`
  return [
    `curl -s "${base}/theme?${ref}"`,
    `curl -s "${base}/export?${ref}&format=css"`,
    `curl -s "${base}/export?${ref}&format=json&mode=dark"`,
    `curl -s "${base}/export?${ref}&format=figma&mode=dark"`,
    `curl -s -H "Authorization: Bearer $KEY" "${base}/riff?${ref}&hops=3"`,
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
    sub: 'opens this exact theme',
    about:
      'Opens this exact theme in ChromaConscious for anyone. The whole theme travels in the link, so nothing is saved and it never expires. View settings, such as a colorblind simulation or the page settings, ride along; they never reach the exported code.',
    preview: {
      kind: 'link',
      label: 'share link',
      text: (ctx) => shareLink(ctx.origin, ctx.payload, ctx.linkParams),
    },
    copy: [
      {
        label: 'Copy link',
        done: 'link copied',
        text: (ctx) => shareLink(ctx.origin, ctx.payload, ctx.linkParams),
      },
    ],
  },
  {
    id: 'api',
    group: 'links',
    name: 'API / agent link',
    sub: 'no key needed to read',
    about:
      'An agent can read or export this exact theme over the API by passing `state=`, which is the same payload as the share link. Reading needs no key and nothing is saved. Riffing makes a new theme, so that call needs a key.',
    preview: { kind: 'code', label: 'API calls', text: (ctx) => agentCalls(ctx.origin, ctx.payload) },
    copy: [
      {
        label: 'Copy link',
        done: 'link copied',
        text: (ctx) => `${ctx.origin}${API_BASE_PATH}/theme?state=${ctx.payload}`,
      },
      { label: 'Copy calls', done: 'calls copied', text: (ctx) => agentCalls(ctx.origin, ctx.payload) },
    ],
  },
]

/** The share-link params for a frame's colorblind simulation. Typical adds none. */
export function visionParams(vision: string, strength: number): Record<string, string> {
  if (vision === 'typical') return {}
  const pct = Math.round(strength * 100)
  return pct >= 100 ? { vision } : { vision, strength: String(pct) }
}
