/**
 * A theme as a file: the one serializer behind both the API's `/export` and
 * the app's Export dialog, so the dialog can never hand out bytes the API
 * would not. Every export names its theme, so a file in a repo points back to
 * the theme that made it.
 */
import type { ThemeResult } from '../engine'
import { themeTailwind, themeTokensJson } from '../engine'

export type ExportFormatId = 'css' | 'tailwind' | 'json'
export type ExportMode = 'both' | 'light' | 'dark'

/** The API's base path, as the docs and every summary print it. */
export const API_BASE_PATH = '/api/chromaconscious/v1'

/** The app link that opens a stored theme by id. Parameters (vision=…) follow with `&`. */
export const appLink = (origin: string, id: string): string => `${origin}/chromaconscious#${id}`

/**
 * The app link that carries the whole theme (api/stateLink.ts): it opens with
 * no server and no saved id. Parameters (vision=…) follow with `&`.
 */
export const stateAppLink = (origin: string, payload: string): string => `${origin}/chromaconscious#s=${payload}`

/** Which theme an export names: its id, and the link that opens it anywhere. */
export interface ExportRef {
  id: string
  /** The `s=` payload of the theme's state. */
  payload: string
}

/**
 * The exact text `/export?theme=<id>&format=<format>` (or `?state=…`) returns.
 * `origin` is the site the theme lives on: the API passes the request's, the
 * app its own. The header names the id and links the state, so a file in a
 * repo opens its theme whether or not that id was ever stored.
 */
export function exportText(
  result: ThemeResult,
  { id, payload }: ExportRef,
  origin: string,
  format: ExportFormatId,
  mode: ExportMode = 'both',
): string {
  if (format === 'css' || format === 'tailwind') {
    const body = format === 'css' ? result.css : themeTailwind(result)
    return `/* ChromaConscious ${id} · ${stateAppLink(origin, payload)} */\n${body}`
  }
  const doc = JSON.parse(themeTokensJson(result)) as Record<string, unknown>
  const ext = { id, url: stateAppLink(origin, payload) }
  const body = {
    // Both keys, so readers written against the legacy name still find the id.
    $extensions: { chromaconscious: ext, themesmith: ext /* legacy */ },
    ...(mode === 'both' ? doc : { ...(doc.$meta ? { $meta: doc.$meta } : {}), [mode]: doc[mode] }),
  }
  return JSON.stringify(body, null, 2)
}
