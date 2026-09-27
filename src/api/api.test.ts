import { describe, expect, it } from 'vitest'
import { candidatesFromList, clearWalkTrails, generateTheme } from '../engine'
import { PRESETS } from '../presets'
import type { Env } from './handler'
import { handle } from './handler'
import { decodeState, encodeState } from './state'
import { applyOp, buildTheme, emptyThemeState } from '../ops'

const KEY = 'test-key-123'
const memoryEnv = (): Env & { size: () => number } => {
  const m = new Map<string, string>()
  return {
    THEMES: { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) },
    THEMESMITH_API_KEYS: `other-key, ${KEY}`,
    size: () => m.size,
  }
}
const call = async (env: Env, path: string, json = false, key: string | null = KEY) => {
  const url = `https://drewkidwell.com/api/themesmith/v1${path}${json ? (path.includes('?') ? '&' : '?') + 'as=json' : ''}`
  const res = await handle(new Request(url, { headers: key ? { authorization: `Bearer ${key}` } : {} }), env)
  return { status: res.status, body: await res.text() }
}
const summary = async (env: Env, path: string) => {
  const r = await call(env, path, true)
  expect(r.status, r.body).toBe(200)
  return JSON.parse(r.body)
}
const seat = (s: { seats: Array<{ role: string }> }, role: string) => s.seats.find((x) => x.role === role) as never as {
  hex: string
  provenance: string
  locked: boolean
}

describe('state codec', () => {
  it('round-trips exactly — the theme rebuilt from the wire is byte-identical', () => {
    for (const p of PRESETS) {
      let s = { ...emptyThemeState(), candidates: candidatesFromList(p.colors), fidelity: 0.73, seed: 4 }
      s = applyOp(s, { op: 'lock', role: 'primary' }, { mode: 'light' }) // a walked lockedColor
      s = applyOp(s, { op: 'lock', role: 'accent' }, { mode: 'light' })
      const back = decodeState(encodeState(s))
      expect(encodeState(back)).toBe(encodeState(s))
      expect(buildTheme(back)!.css).toBe(buildTheme(s)!.css)
    }
  })
})

describe('api', () => {
  it('generate answers with a summary and a stable id; the same input stores once', async () => {
    const env = memoryEnv()
    const a = await call(env, '/generate?colors=primary:1d3557,e63946,a8dadc')
    expect(a.status).toBe(200)
    expect(a.body).toMatch(/^theme t_[a-z2-7]{12} /)
    expect(a.body).toMatch(/primary\s+#\w{6}\s+yours/)
    const b = await call(env, '/generate?colors=primary:1d3557,e63946,a8dadc')
    expect(b.body).toBe(a.body)
    expect(env.size()).toBe(1)
  })

  it('pins seat a colour where it was asked to go', async () => {
    const s = await summary(memoryEnv(), '/generate?colors=e63946,primary:1d3557&taste=1')
    expect(seat(s, 'primary')).toMatchObject({ hex: '#1d3557', provenance: 'yours' })
  })

  it('a lock persists through later riffs without being repeated', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=coastal-starter')
    const r1 = await summary(env, `/riff?theme=${g.theme}&lock=primary`)
    const held = seat(r1, 'primary').hex
    let t = r1
    for (let i = 0; i < 4; i++) t = await summary(env, `/riff?theme=${t.theme}`)
    expect(seat(t, 'primary')).toMatchObject({ hex: held, locked: true })
    expect(t.riff).toBe(5)
    // …and the rest of the palette did move
    expect(seat(t, 'accent').hex).not.toBe(seat(g, 'accent').hex)
  })

  it('riff then back returns to the same snapshot id', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=neon-arcade')
    const r = await summary(env, `/riff?theme=${g.theme}&hops=3`)
    const b = await summary(env, `/back?theme=${r.theme}&hops=3`)
    expect(b.theme).toBe(g.theme)
  })

  it('the API reaches exactly the theme the UI verbs reach', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=terracotta')
    const r = await summary(env, `/riff?theme=${g.theme}&lock=accent&hops=2`)
    let s = { ...emptyThemeState(), candidates: candidatesFromList(PRESETS[5].colors), preset: PRESETS[5].name }
    s = applyOp(s, { op: 'lock', role: 'accent' }, { mode: 'light' })
    s = applyOp(s, { op: 'riff', hops: 2 }, { mode: 'light' })
    const css = (await call(env, `/export?theme=${r.theme}&format=css`)).body
    expect(css.split('\n').slice(1).join('\n')).toBe(buildTheme(s)!.css)
  })

  it('from= with colors replaces unlocked colours and keeps locked ones', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?colors=primary:1d3557,e63946&lock=primary')
    const n = await summary(env, `/generate?from=${g.theme}&colors=2a9d8f,e9c46a`)
    expect(seat(n, 'primary')).toMatchObject({ hex: seat(g, 'primary').hex, locked: true })
    expect(n.parent).toBe(g.theme)
  })

  it('export carries the theme id in every format', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=ink-sky')
    const css = await call(env, `/export?theme=${g.theme}`)
    expect(css.body.split('\n')[0]).toBe(`/* themesmith ${g.theme} · https://drewkidwell.com/themesmith#${g.theme} */`)
    const tw = await call(env, `/export?theme=${g.theme}&format=tailwind`)
    expect(tw.body).toContain('@theme inline')
    const json = JSON.parse((await call(env, `/export?theme=${g.theme}&format=json&mode=dark`)).body)
    expect(json.$extensions.themesmith.id).toBe(g.theme)
    expect(Object.keys(json)).toEqual(['$extensions', 'dark'])
  })

  it('errors say what was wrong and how to fix it', async () => {
    const env = memoryEnv()
    expect(await call(env, '/generate?colors=primry:1d3557')).toMatchObject({
      status: 422,
      body: expect.stringContaining('unknown role "primry"'),
    })
    expect((await call(env, '/generate')).status).toBe(422)
    expect((await call(env, '/riff?theme=t_aaaaaaaaaaaa')).status).toBe(404)
    expect((await call(env, '/riff?theme=nope')).status).toBe(400)
    const g = await summary(env, '/generate?preset=ink-sky')
    expect(await call(env, `/riff?theme=${g.theme}&hops=500`)).toMatchObject({ status: 422, body: expect.stringContaining('1 to 50') })
    expect(await call(env, `/generate?from=${g.theme}&mono=ffffff`)).toMatchObject({ status: 422, body: expect.stringContaining('not one of') })
  })

  it('an engine-derived seat can be locked by role (it is kept first)', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?colors=3b82f6')
    const derived = g.seats.find((x: { provenance: string }) => x.provenance === 'derived')
    const l = await summary(env, `/riff?theme=${g.theme}&lock=${derived.role}`)
    expect(seat(l, derived.role)).toMatchObject({ provenance: 'kept', locked: true, hex: derived.hex })
  })

  it('matches generateTheme for a plain preset (no drift through the layers)', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=corporate-blue')
    const css = (await call(env, `/export?theme=${g.theme}`)).body.split('\n').slice(1).join('\n')
    expect(css).toBe(generateTheme({ candidates: candidatesFromList(PRESETS[6].colors) }).css)
  })

  it('a fresh isolate riffs a stored deep theme to the same place a warm one does', async () => {
    const env = memoryEnv()
    let t = await summary(env, '/generate?preset=pastel-picnic')
    t = await summary(env, `/riff?theme=${t.theme}&hops=50`)
    t = await summary(env, `/riff?theme=${t.theme}&hops=50&lock=accent`)
    const warm = await summary(env, `/riff?theme=${t.theme}&hops=2`)
    clearWalkTrails() // a new isolate: only KV survives
    const cold = await summary(env, `/riff?theme=${t.theme}&hops=2`)
    expect(cold.theme).toBe(warm.theme)
    expect(cold.seats).toEqual(warm.seats)
  })

  it('creating needs a valid key; reading an existing theme does not', async () => {
    const env = memoryEnv()
    expect((await call(env, '/generate?preset=ink-sky', false, null)).status).toBe(401)
    expect((await call(env, '/generate?preset=ink-sky', false, 'wrong')).status).toBe(403)
    const g = await summary(env, '/generate?preset=ink-sky')
    expect((await call(env, `/riff?theme=${g.theme}`, false, null)).status).toBe(401)
    for (const path of [`/theme?theme=${g.theme}`, `/export?theme=${g.theme}`, `/state?theme=${g.theme}`, '/presets'])
      expect((await call(env, path, false, null)).status, path).toBe(200)
    // unset secret: nobody may create
    const closed = { ...env, THEMESMITH_API_KEYS: undefined }
    expect((await call(closed, '/generate?preset=ink-sky')).status).toBe(403)
  })

  it('/state returns the exact state the theme was built from', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=terracotta&lock=primary&taste=0.7')
    const r = await summary(env, `/riff?theme=${g.theme}&hops=2`)
    const state = decodeState((await call(env, `/state?theme=${r.theme}`, false, null)).body)
    const css = (await call(env, `/export?theme=${r.theme}`)).body.split('\n').slice(1).join('\n')
    expect(buildTheme(state)!.css).toBe(css)
  })
})
