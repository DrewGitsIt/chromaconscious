import { describe, expect, it } from 'vitest'
import { generateTheme } from '../../engine'
import type { ThemeState } from '../../ops'
import { applyOp, emptyThemeState } from '../../ops'
import { PRESETS } from '../../presets'
import type { Env } from '../../api/handler'
import { handle } from '../../api/handler'
import { decodeState, encodeState, themeId } from '../../api/state'
import { payloadState, statePayload } from '../../api/stateLink'
import { strFromU8, unzipSync } from 'fflate'
import { parseThemeHash } from '../../visionLink'
import type { ExportContext } from './formats'
import { EXPORT_FORMATS, agentCalls, shareLink, visionParams } from './formats'
import { DEFAULT_PAGE, pageLinkParams } from '../../pageSettings'

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
  const canonical = encodeState(s)
  return { result, state: s, id: await themeId(canonical), payload: statePayload(canonical), origin: ORIGIN, linkParams: {} }
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
    it(`${name}: CSS, Tailwind and DTCG equal /export, by theme= and by state= alike`, async () => {
      const { env, m } = memoryEnv()
      const s = build()
      const ctx = await appContext(s)
      // Stored as the API stores a snapshot: the canonical state under its hash.
      m.set(ctx.id, JSON.stringify({ state: encodeState(s), parent: null }))
      for (const format of ['css', 'tailwind', 'json']) {
        const byId = await api(env, `/export?theme=${ctx.id}&format=${format}`)
        expect(copied(format, ctx), format).toBe(byId)
        expect(await api(env, `/export?state=${ctx.payload}&format=${format}`), format).toBe(byId)
      }
      // and the summary and state read the same either way
      const byId = JSON.parse(await api(env, `/theme?theme=${ctx.id}&as=json`))
      const byState = JSON.parse(await api(env, `/theme?state=${ctx.payload}&as=json`))
      expect({ ...byState, links: null }).toEqual({ ...byId, links: null })
      expect(byState.links.open).toBe(`${ORIGIN}/chromaconscious#s=${ctx.payload}`)
      expect(await api(env, `/state?state=${ctx.payload}`)).toBe(await api(env, `/state?theme=${ctx.id}`))
    })
  }

  it('every code format carries the three status marks, in both modes', async () => {
    const ctx = await appContext(presetState())
    const css = copied('css', ctx)
    const tw = copied('tailwind', ctx)
    const dtcg = JSON.parse(copied('json', ctx))
    const text = JSON.stringify(dtcg)
    for (const t of ['destructive-strong', 'success-strong', 'warning-strong']) {
      for (const mode of ['light', 'dark'] as const) {
        const hex = ctx.result[mode].tokens[t]
        expect(hex, `${t} ${mode}`).toMatch(/^#[0-9a-f]{6}$/)
        expect(css, `css ${t} ${mode}`).toContain(`--${t}: ${hex};`)
        expect(text, `dtcg ${t} ${mode}`).toContain(hex)
      }
      expect(tw, `tailwind bridge ${t}`).toContain(`--color-${t}: var(--${t});`)
      expect(text).toContain(`"${t}"`)
    }
  })

  it('the download is the copied text, under a name that carries the id', async () => {
    const ctx = await appContext(presetState())
    for (const [id, ext] of [['css', '.css'], ['tailwind', '.tailwind.css'], ['json', '.tokens.json']]) {
      const f = fmt(id)
      expect(f.download!.filename(ctx)).toBe(`chromaconscious-${ctx.id}${ext}`)
      expect(await (await f.download!.blob(ctx)).text()).toBe(copied(id, ctx))
    }
  })
})

describe('Figma variables', () => {
  it("every file in the download is the API's file for that mode, byte for byte", async () => {
    const { env, m } = memoryEnv()
    const s = tunedState()
    const ctx = await appContext(s)
    m.set(ctx.id, JSON.stringify({ state: encodeState(s), parent: null }))
    const f = fmt('figma')
    expect(f.group).toBe('design')
    expect(f.copy).toEqual([])
    const zip = unzipSync(new Uint8Array(await (await f.download!.blob(ctx)).arrayBuffer()))
    const modes = Object.keys(zip).filter((n) => n.endsWith('.json'))
    expect(modes).toHaveLength(6)
    for (const name of modes) {
      const mode = name.replace(/\.json$/, '')
      const byId = await api(env, `/export?theme=${ctx.id}&format=figma&mode=${mode}`)
      expect(strFromU8(zip[name]), name).toBe(byId)
      expect(await api(env, `/export?state=${ctx.payload}&format=figma&mode=${mode}`), name).toBe(byId)
    }
  })

  it('without mode= the API returns an index of the six files, not a zip', async () => {
    const { env } = memoryEnv()
    const ctx = await appContext(presetState())
    const index = JSON.parse(await api(env, `/export?state=${ctx.payload}&format=figma`))
    expect(index.theme).toBe(ctx.id)
    expect(index.files.map((f: { mode: string }) => f.mode)).toEqual([
      'light', 'dark', 'light-medium', 'dark-medium', 'light-high', 'dark-high',
    ])
    expect(index.files[1].url).toBe(
      `${ORIGIN}/api/chromaconscious/v1/export?state=${ctx.payload}&format=figma&mode=dark`,
    )
    expect(index.note).toContain('Export dialog')
  })

  it('the preview lists every file in the zip with its variable count', async () => {
    const ctx = await appContext(presetState())
    const p = fmt('figma').preview!
    if (p.kind !== 'files') throw new Error('expected a files preview')
    const lines = await p.load(ctx)
    expect(lines.map((l) => l.name)).toEqual([
      'light.json', 'dark.json', 'light-medium.json', 'dark-medium.json', 'light-high.json', 'dark-high.json', 'README.txt',
    ])
    expect(lines[0].detail).toMatch(/^\d+ variables · \d+\.\d KB$/)
    expect(fmt('figma').hint).toContain("On Figma's free plan, import each file as its own collection")
  })
})

describe('links', () => {
  it('the share link carries the theme whole, and opens the same id', async () => {
    const ctx = await appContext(tunedState())
    const link = shareLink(ORIGIN, ctx.payload, {})
    expect(link).toBe(`${ORIGIN}/chromaconscious#s=${ctx.payload}`)
    const parsed = parseThemeHash(new URL(link).hash)!
    expect(await themeId(encodeState(decodeState(payloadState(parsed.state!))))).toBe(ctx.id)
  })

  it('the share link carries the vision and page settings, and adds nothing at the defaults', () => {
    const p = 'AQAB'
    expect(pageLinkParams(DEFAULT_PAGE)).toEqual({})
    expect(shareLink(ORIGIN, p, { ...visionParams('typical', 1), ...pageLinkParams(DEFAULT_PAGE) })).toBe(
      `${ORIGIN}/chromaconscious#s=${p}`,
    )
    const link = shareLink(ORIGIN, p, { ...visionParams('deutan', 0.6), ...pageLinkParams({ radius: 20, font: 'tinos' }) })
    expect(link).toBe(`${ORIGIN}/chromaconscious#s=${p}&vision=deutan&strength=60&radius=20&font=tinos`)
    expect(parseThemeHash(new URL(link).hash)).toEqual({
      state: p,
      vision: { vision: 'deutan', strength: 0.6 },
      page: { radius: 20, font: 'tinos' },
    })
    expect(visionParams('protan', 1)).toEqual({ vision: 'protan' })
    expect(visionParams('typical', 0.4)).toEqual({})
  })

  it('the agent calls carry state=, and only riff asks for a key', () => {
    const calls = agentCalls(ORIGIN, 'AQAB')
    expect(calls).toContain(`${ORIGIN}/api/chromaconscious/v1/export?state=AQAB&format=css`)
    expect(calls).toContain(`${ORIGIN}/api/chromaconscious/v1/export?state=AQAB&format=figma&mode=dark`)
    expect(calls.split('\n').filter((l) => l.includes('Bearer'))).toEqual([
      expect.stringContaining('/riff?state=AQAB'),
    ])
    expect(calls).toContain(`${ORIGIN}/chromaconscious/docs.md`)
  })

  it('groups are only code, design and links, and nothing is a placeholder', () => {
    for (const f of EXPORT_FORMATS) {
      expect(['code', 'design', 'links']).toContain(f.group)
      expect(f.copy.length + (f.download ? 1 : 0)).toBeGreaterThan(0)
    }
  })
})
