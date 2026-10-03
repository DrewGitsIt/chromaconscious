import { describe, expect, it } from 'vitest'
import { generateTheme } from '../../engine'
import type { ThemeState } from '../../ops'
import { applyOp, emptyThemeState } from '../../ops'
import { PRESETS } from '../../presets'
import type { Env } from '../../api/handler'
import { handle } from '../../api/handler'
import { encodeState, themeId } from '../../api/state'
import { parseThemeHash } from '../../visionLink'
import type { ExportContext } from './formats'
import { EXPORT_FORMATS, agentCalls, shareLink, visionParams } from './formats'

const ORIGIN = 'https://drewkidwell.com'
const KEY = 'k'
const memoryEnv = () => {
  const m = new Map<string, string>()
  const env: Env = {
    THEMES: { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) },
    CHROMACONSCIOUS_API_KEYS: KEY,
  }
  return { env, m }
}
const api = async (env: Env, path: string) => {
  const res = await handle(
    new Request(`${ORIGIN}/api/chromaconscious/v1${path}`, { headers: { authorization: `Bearer ${KEY}` } }),
    env,
  )
  expect(res.status).toBe(200)
  return res.text()
}

/** What the app's dialog is handed for a frame: built the way useThemeResult builds it. */
async function appContext(s: ThemeState): Promise<ExportContext> {
  const result = generateTheme({
    candidates: s.candidates,
    fidelity: s.fidelity,
    monoBase: s.monoBase ?? undefined,
    seed: s.seed,
    separation: s.separation,
    contrast: s.contrast,
  })
  return { result, state: s, id: await themeId(encodeState(s)), origin: ORIGIN, linkParams: {} }
}
const fmt = (id: string) => EXPORT_FORMATS.find((f) => f.id === id)!
const copied = (id: string, ctx: ExportContext) => fmt(id).copy[0].text(ctx)

const coastal = PRESETS[0]
const presetState = () =>
  applyOp(emptyThemeState(), { op: 'preset', name: coastal.name, colors: coastal.colors }, { mode: 'dark' })

/** A frame with every kind of state the id hashes: locks, a riff, taste, separation, contrast. */
function tunedState(): ThemeState {
  let s = presetState()
  s = { ...s, fidelity: 0.7, separation: 'lifted', contrast: 0.5 }
  s = applyOp(s, { op: 'lock', role: 'primary' }, { mode: 'dark' })
  s = applyOp(s, { op: 'riff', hops: 3 }, { mode: 'dark' })
  return s
}

describe('the Export dialog matches the API byte for byte', () => {
  it('a preset frame gets the id the API gives the same preset', async () => {
    const { env } = memoryEnv()
    const summary = JSON.parse(await api(env, `/generate?preset=${encodeURIComponent(coastal.name)}&as=json`))
    const ctx = await appContext(presetState())
    expect(ctx.id).toBe(summary.theme)
  })

  for (const [name, build] of [
    ['preset', presetState],
    ['tuned (lock, riff, taste, separation, contrast)', tunedState],
  ] as const) {
    it(`${name}: CSS, Tailwind and DTCG equal /export for the same id`, async () => {
      const { env, m } = memoryEnv()
      const s = build()
      const ctx = await appContext(s)
      // Stored as the API stores a snapshot: the canonical state under its hash.
      m.set(ctx.id, JSON.stringify({ state: encodeState(s), parent: null }))
      expect(copied('css', ctx)).toBe(await api(env, `/export?theme=${ctx.id}&format=css`))
      expect(copied('tailwind', ctx)).toBe(await api(env, `/export?theme=${ctx.id}&format=tailwind`))
      expect(copied('json', ctx)).toBe(await api(env, `/export?theme=${ctx.id}&format=json`))
    })
  }

  it('the download is the copied text, under a name that carries the id', async () => {
    const ctx = await appContext(presetState())
    for (const [id, ext] of [['css', '.css'], ['tailwind', '.tailwind.css'], ['json', '.tokens.json']]) {
      const f = fmt(id)
      expect(f.download!.filename(ctx)).toBe(`chromaconscious-${ctx.id}${ext}`)
      expect(await f.download!.blob(ctx).text()).toBe(copied(id, ctx))
    }
  })
})

describe('links', () => {
  it('the share link opens the same id, and carries the vision it was made under', () => {
    const id = 't_abcdefghijkl'
    expect(shareLink(ORIGIN, id, {})).toBe(`${ORIGIN}/chromaconscious#${id}`)
    const link = shareLink(ORIGIN, id, visionParams('deutan', 0.6))
    expect(parseThemeHash(new URL(link).hash)).toEqual({ id, vision: { vision: 'deutan', strength: 0.6 } })
    expect(visionParams('protan', 1)).toEqual({ vision: 'protan' })
    expect(visionParams('typical', 0.4)).toEqual({})
  })

  it('the agent calls are the documented endpoints for this id', () => {
    const calls = agentCalls(ORIGIN, 't_abcdefghijkl')
    expect(calls.split('\n')[0]).toBe('t_abcdefghijkl')
    expect(calls).toContain(`${ORIGIN}/api/chromaconscious/v1/export?theme=t_abcdefghijkl&format=css`)
    expect(calls).toContain('Authorization: Bearer $KEY')
    expect(calls).toContain(`${ORIGIN}/chromaconscious/docs.md`)
  })

  it('groups are only code, design and links, and nothing is a placeholder', () => {
    for (const f of EXPORT_FORMATS) {
      expect(['code', 'design', 'links']).toContain(f.group)
      expect(f.copy.length + (f.download ? 1 : 0)).toBeGreaterThan(0)
    }
  })
})
