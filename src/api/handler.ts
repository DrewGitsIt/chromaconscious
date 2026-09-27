/**
 * The themesmith HTTP API — a plain `fetch` handler, so the same code runs in
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
import { summarize, summaryText } from './summary'

/** The slice of Workers KV this needs; tests pass a Map-backed stand-in. */
export interface ThemeStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export interface Env {
  THEMES: ThemeStore
}

const BASE = '/api/themesmith/v1'

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

async function load(env: Env, id: string | null): Promise<Stored & { id: string }> {
  if (!id) throw new HttpError(400, 'missing theme= — pass the id a previous call returned')
  if (!isThemeId(id)) throw new HttpError(400, `"${id}" is not a theme id (they look like t_k3v9x2abcdef)`)
  const raw = await env.THEMES.get(id)
  if (raw == null) throw new HttpError(404, `no theme ${id} — it may have expired; regenerate it`)
  const { state, parent, walk } = JSON.parse(raw) as { state: string; parent: string | null; walk?: WalkCheckpoint }
  // Resume the riff walk where this theme stands, whichever isolate we are.
  if (walk) restoreWalkStop(walk)
  return { id, state: decodeState(state), parent }
}

const forge = (state: ThemeState): ThemeResult => {
  const result = buildTheme(state)
  if (!result) throw new HttpError(422, 'a theme needs at least one color — pass colors= or preset=')
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

function respondTheme(req: Request, id: string, parent: string | null, state: ThemeState, result: ThemeResult): Response {
  const summary = summarize(id, parent, state, result, new URL(req.url).origin)
  const q = new URL(req.url).searchParams
  if (q.get('as') === 'json' || req.headers.get('accept')?.includes('application/json')) {
    return text(JSON.stringify(summary, null, 2), 200, 'application/json')
  }
  return text(summaryText(summary))
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  if (!url.pathname.startsWith(BASE)) throw new HttpError(404, 'not found')
  const path = url.pathname.slice(BASE.length) || '/'
  const q = url.searchParams

  switch (path) {
    case '/generate': {
      const from = q.get('from')
      const prior = from ? await load(env, from) : null
      let state = prior?.state ?? emptyThemeState()
      const preset = q.get('preset')
      if (preset) {
        const p = presetByName(preset)
        state = runOps(state, [{ op: 'preset', name: p.name, colors: p.colors }])
      }
      state = applyEdits(state, q, prior != null)
      const result = forge(state)
      const id = await save(env, state, prior?.id ?? null, result)
      return respondTheme(req, id, prior?.id ?? null, state, result)
    }
    case '/riff':
    case '/back': {
      const prior = await load(env, q.get('theme'))
      const hops = hopsParam(q)
      // Locks first, so a riff never moves what this same call just locked.
      let state = applyEdits(prior.state, q, true)
      state = runOps(state, [path === '/riff' ? riffOp(hops) : backOp(hops)])
      const result = forge(state)
      const id = await save(env, state, prior.id, result)
      return respondTheme(req, id, prior.id, state, result)
    }
    case '/theme': {
      const t = await load(env, q.get('theme'))
      return respondTheme(req, t.id, t.parent, t.state, forge(t.state))
    }
    case '/export': {
      const t = await load(env, q.get('theme'))
      const result = forge(t.state)
      const format = q.get('format') ?? 'css'
      const header = `themesmith ${t.id} · ${url.origin}/themesmith#${t.id}`
      if (format === 'css' || format === 'tailwind') {
        const body = format === 'css' ? result.css : themeTailwind(result)
        return text(`/* ${header} */\n${body}`, 200, 'text/css; charset=utf-8')
      }
      if (format === 'json') {
        const doc = JSON.parse(themeTokensJson(result)) as Record<string, unknown>
        const mode = q.get('mode') ?? 'both'
        if (mode !== 'both' && mode !== 'light' && mode !== 'dark') throw new QueryError('mode is light, dark or both')
        const body = {
          $extensions: { themesmith: { id: t.id, url: `${url.origin}/themesmith#${t.id}` } },
          ...(mode === 'both' ? doc : { ...(doc.$meta ? { $meta: doc.$meta } : {}), [mode]: doc[mode] }),
        }
        return text(JSON.stringify(body, null, 2), 200, 'application/json')
      }
      throw new QueryError('format is css, tailwind or json')
    }
    case '/presets':
      return text(PRESETS.map((p) => `${p.name.padEnd(18)} ${p.colors.map((c) => c.slice(1)).join(',')}`).join('\n') + '\n')
    default:
      throw new HttpError(404, `no endpoint ${path} — see ${url.origin}/themesmith/docs.md`)
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
  }
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return text('', 204)
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
