/**
 * The ChromaConscious HTTP API — a plain `fetch` handler, so the same code runs in
 * a Cloudflare Worker, in Node, and in tests.
 *
 * Every call that makes a theme stores an immutable snapshot and answers with
 * its id; nothing is ever changed in place. See docs/remote-api-spec.md.
 */
import type { ThemeResult, WalkCheckpoint } from '../engine'
import { restoreWalkStop, themeTailwind, themeTokensJson, walkCheckpoint } from '../engine'
import type { ThemeState } from '../ops'
import { buildTheme, emptyThemeState } from '../ops'
import { PRESETS } from '../presets'
import { QueryError, applyEdits, backOp, hopsParam, presetByName, riffOp, runOps } from './query'
import { StateError, decodeState, encodeState, isThemeId, themeId } from './state'
import { exportText } from './exports'
import { FIGMA_MODE_NAMES, figmaIndex, figmaModeFile } from './exportsFigma'
import { payloadState, statePayload } from './stateLink'
import { summarize, summaryText } from './summary'

/** The slice of Workers KV this needs; tests pass a Map-backed stand-in. */
export interface ThemeStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export interface Env {
  THEMES: ThemeStore
  /**
   * Comma-separated keys allowed to create themes (a Worker secret:
   * `wrangler secret put CHROMACONSCIOUS_API_KEYS`). Reading an existing theme
   * needs none. Unset means nobody may create — the API fails closed.
   */
  CHROMACONSCIOUS_API_KEYS?: string
  /** The legacy secret name from before the rename, read only when the new one is unset. */
  THEMESMITH_API_KEYS?: string // legacy
}

/** The API's base path. The legacy themesmith path stays an alias, so existing clients keep working. */
const BASES = ['/api/chromaconscious/v1', '/api/themesmith/v1' /* legacy */]

/**
 * The app moved to /chromaconscious. Old share links under the legacy /themesmith path
 * (legacy form: /themesmith#t_…) get a 301. The browser never sends the
 * #fragment, and it carries it over to a Location that has none, so the theme
 * id survives the hop. Other paths that merely start with the old name are not ours.
 */
export function legacyAppRedirect(url: URL): string | null {
  const m = /^\/themesmith(\/.*)?$/.exec(url.pathname) // legacy
  if (!m) return null
  return `${url.origin}/chromaconscious${m[1] ?? '/'}${url.search}`
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const text = (body: string, status = 200, type = 'text/plain; charset=utf-8') =>
  new Response(body, { status, headers: { 'content-type': type, 'access-control-allow-origin': '*' } })

interface Stored {
  state: ThemeState
  parent: string | null
}

/** A theme as a request names it: stored (`theme=`) or carried whole (`state=`). */
interface Loaded extends Stored {
  id: string
  /** The `s=` payload, always: export headers link it. */
  payload: string
  /** Set when the theme came in as `state=` and is not stored. */
  carried?: string
}

/**
 * `theme=<id>` reads the store; `state=<payload>` (stateLink.ts) carries the
 * theme in the request, needs no store and no key, and has the same id the
 * theme would have if stored. Exactly one of the two.
 */
async function loadRef(env: Env, q: URLSearchParams, idParam = 'theme'): Promise<Loaded> {
  const id = q.get(idParam)
  const carried = q.get('state')
  if (id && carried != null) throw new HttpError(400, `pass ${idParam}= or state=, not both`)
  if (carried != null) {
    const canonical = payloadState(carried)
    const state = decodeState(canonical)
    return { id: await themeId(encodeState(state)), state, parent: null, payload: carried, carried }
  }
  const t = await load(env, id, idParam)
  return { ...t, payload: statePayload(encodeState(t.state)) }
}

async function load(env: Env, id: string | null, idParam = 'theme'): Promise<Stored & { id: string }> {
  if (!id) throw new HttpError(400, `missing ${idParam}= — pass the id a previous call returned, or state= from a link`)
  if (!isThemeId(id)) throw new HttpError(400, `"${id}" is not a theme id (they look like t_k3v9x2abcdef)`)
  const raw = await env.THEMES.get(id)
  if (raw == null) throw new HttpError(404, `no theme ${id} — it may have expired; regenerate it`)
  const { state, parent, walk } = JSON.parse(raw) as { state: string; parent: string | null; walk?: WalkCheckpoint }
  // Resume the riff walk where this theme stands, whichever isolate we are.
  if (walk) restoreWalkStop(walk)
  return { id, state: decodeState(state), parent }
}

const noColors = () => new HttpError(422, 'a theme needs at least one color — pass colors= or preset=')

const forge = (state: ThemeState): ThemeResult => {
  const result = buildTheme(state)
  if (!result) throw noColors()
  return result
}

/**
 * Store a snapshot, with the walk checkpoint it was built at. Its id is its
 * content hash, so an existing id is already right and is not rewritten.
 */
async function save(env: Env, state: ThemeState, parent: string | null, result: ThemeResult): Promise<string> {
  const canonical = encodeState(state)
  const id = await themeId(canonical)
  if ((await env.THEMES.get(id)) == null) {
    const walk = walkCheckpoint(result)
    await env.THEMES.put(id, JSON.stringify({ state: canonical, parent, ...(walk ? { walk } : {}) }))
  }
  return id
}

function respondTheme(
  req: Request,
  id: string,
  parent: string | null,
  state: ThemeState,
  result: ThemeResult,
  carried?: string,
): Response {
  const summary = summarize(id, parent, state, result, new URL(req.url).origin, carried)
  const q = new URL(req.url).searchParams
  if (q.get('as') === 'json' || req.headers.get('accept')?.includes('application/json')) {
    return text(JSON.stringify(summary, null, 2), 200, 'application/json')
  }
  return text(summaryText(summary))
}

/** Byte-wise compare that takes the same time wherever the first difference is. */
function sameKey(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** Creating a theme writes to KV, so it needs a key; reading one does not. */
function requireKey(req: Request, env: Env) {
  const keys = (env.CHROMACONSCIOUS_API_KEYS ?? env.THEMESMITH_API_KEYS ?? '') // legacy secret name as fallback
    .split(',').map((k) => k.trim()).filter(Boolean)
  const given = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim()
  if (!given) throw new HttpError(401, 'creating themes needs a key — send the header "Authorization: Bearer <key>"')
  if (!keys.some((k) => sameKey(k, given))) throw new HttpError(403, 'that key is not valid for this API')
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const base = BASES.find((b) => url.pathname === b || url.pathname.startsWith(b + '/'))
  if (!base) throw new HttpError(404, 'not found')
  const path = url.pathname.slice(base.length) || '/'
  const q = url.searchParams

  switch (path) {
    case '/generate': {
      requireKey(req, env)
      // A start: a stored theme (from=), a carried one (state=), or nothing.
      const prior = q.get('from') || q.get('state') != null ? await loadRef(env, q, 'from') : null
      let state = prior?.state ?? emptyThemeState()
      const preset = q.get('preset')
      if (preset) {
        const p = presetByName(preset)
        state = runOps(state, [{ op: 'preset', name: p.name, colors: p.colors }])
      }
      state = applyEdits(state, q, prior != null)
      const result = forge(state)
      // a carried start was never stored, so it is nobody's parent
      const parent = prior && !prior.carried ? prior.id : null
      const id = await save(env, state, parent, result)
      return respondTheme(req, id, parent, state, result)
    }
    case '/riff':
    case '/back': {
      requireKey(req, env)
      const prior = await loadRef(env, q)
      const hops = hopsParam(q)
      // Locks first, so a riff never moves what this same call just locked.
      let state = applyEdits(prior.state, q, true)
      state = runOps(state, [path === '/riff' ? riffOp(hops) : backOp(hops)])
      const result = forge(state)
      const parent = prior.carried ? null : prior.id
      const id = await save(env, state, parent, result)
      return respondTheme(req, id, parent, state, result)
    }
    case '/state': {
      // The theme's own state, so the app can open it: /chromaconscious#t_… .
      const t = await loadRef(env, q)
      return text(encodeState(t.state), 200, 'application/json')
    }
    case '/theme': {
      const t = await loadRef(env, q)
      return respondTheme(req, t.id, t.parent, t.state, forge(t.state), t.carried)
    }
    case '/export': {
      const t = await loadRef(env, q)
      const format = q.get('format') ?? 'css'
      // Every format's bytes come from the serializer shared with the app's
      // Export dialog (exports.ts, exportsFigma.ts): what you copy or download
      // there is byte-for-byte what this returns, for theme= and state= alike.
      if (format === 'figma') {
        const mode = q.get('mode')
        // No zip here: it builds the theme at three contrast levels and
        // compresses six files, which does not fit a Workers free-plan request
        // (10 ms CPU). The index points at the per-mode files, each one build;
        // the app's Export dialog makes the zip in the browser.
        if (mode == null) {
          const ref = t.carried ? `state=${t.carried}` : `theme=${t.id}`
          return text(JSON.stringify(figmaIndex(url.origin + base, ref, t.id), null, 2), 200, 'application/json')
        }
        if (!FIGMA_MODE_NAMES.includes(mode)) throw new QueryError(`mode is one of ${FIGMA_MODE_NAMES.join(', ')}`)
        // Before forge: the mode file builds its own contrast level.
        const file = figmaModeFile(t.state, t.id, mode)
        if (!file) throw noColors()
        return new Response(file.json, {
          headers: {
            'content-type': 'application/json',
            'content-disposition': `attachment; filename="${file.download}"`,
            'access-control-allow-origin': '*',
          },
        })
      }
      const result = forge(t.state)
      if (format === 'css' || format === 'tailwind') {
        return text(exportText(result, t, url.origin, format), 200, 'text/css; charset=utf-8')
      }
      if (format === 'json') {
        const mode = q.get('mode') ?? 'both'
        if (mode !== 'both' && mode !== 'light' && mode !== 'dark') throw new QueryError('mode is light, dark or both')
        return text(exportText(result, t, url.origin, 'json', mode), 200, 'application/json')
      }
      throw new QueryError('format is css, tailwind, json or figma')
    }
    case '/presets':
      return text(PRESETS.map((p) => `${p.name.padEnd(18)} ${p.colors.map((c) => c.slice(1)).join(',')}`).join('\n') + '\n')
    default:
      throw new HttpError(404, `no endpoint ${path} — see ${url.origin}/chromaconscious/docs.md`)
  }
}

/**
 * Run the request path end to end, minus I/O, so a fresh isolate's first real
 * request isn't the one that pays to compile it. Synchronous on purpose: it
 * runs at module load, where nothing may be awaited.
 */
export function warmUp(rounds = 6) {
  const locks = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning']
  for (let i = 0; i < rounds; i++) {
    const p = PRESETS[i % PRESETS.length]
    let state = runOps(emptyThemeState(), [{ op: 'preset', name: p.name, colors: p.colors }])
    // Every lock path: seats of yours (lockRole) and derived seats (keepRole).
    state = applyEdits(state, new URLSearchParams(`lock=${locks[i % locks.length]},chart-1&taste=0.6`), true)
    state = runOps(state, [riffOp(2)])
    const round = decodeState(encodeState(state))
    const result = buildTheme(round)!
    summaryText(summarize('t_warmwarmwarm', null, round, result, 'https://warm.up'))
    themeTailwind(result)
    themeTokensJson(result)
    // Once: a Figma mode file's serializer, and the state-link codec.
    if (i === 0) figmaModeFile(round, 't_warmwarmwarm', 'dark-high')
    payloadState(statePayload(encodeState(round)))
  }
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return text('', 204)
  const moved = legacyAppRedirect(new URL(req.url))
  if (moved) return Response.redirect(moved, 301)
  if (req.method !== 'GET') return text('GET only for now\n', 405)
  try {
    return await route(req, env)
  } catch (err) {
    if (err instanceof HttpError) return text(err.message + '\n', err.status)
    if (err instanceof QueryError || err instanceof StateError) return text(err.message + '\n', 422)
    console.error(err)
    return text('internal error\n', 500)
  }
}
