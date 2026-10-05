import { describe, expect, it } from 'vitest'
import { candidatesFromList, clearWalkTrails, generateTheme } from '../engine'
import { PRESETS } from '../presets'
import type { Env } from './handler'
import { handle, legacyAppRedirect } from './handler'
import { decodeState, encodeState, themeId } from './state'
import { statePayload } from './stateLink'
import { contrastParam, runOps } from './query'
import { figmaExport, figmaModeFiles } from '../figmaExport'
import { unzipSync } from 'fflate'
import { applyOp, buildTheme, emptyThemeState } from '../ops'

const KEY = 'test-key-123'
const memoryEnv = (): Env & { size: () => number } => {
  const m = new Map<string, string>()
  return {
    THEMES: { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) },
    CHROMACONSCIOUS_API_KEYS: `other-key, ${KEY}`,
    size: () => m.size,
  }
}
const call = async (env: Env, path: string, json = false, key: string | null = KEY) => {
  const url = `https://drewkidwell.com/api/chromaconscious/v1${path}${json ? (path.includes('?') ? '&' : '?') + 'as=json' : ''}`
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

describe('state codec — contrast level', () => {
  // Written by the encoder as it stood before the contrast level existed; the
  // id was computed outside this codebase (sha256 → base32, 60 bits).
  const OLD = '{"v":1,"candidates":[{"color":"#e63946"},{"color":"#1d3557","pin":"primary","locked":true}],"fidelity":0.7,"seed":2,"separation":"flat","preset":"Coastal starter"}'
  const OLD_ID = 't_yofoevnthnbv'

  it('an id minted before the level existed still resolves to the same state, id and theme', async () => {
    const s = decodeState(OLD)
    expect(s.contrast).toBe(0)
    expect(encodeState(s)).toBe(OLD)
    expect(await themeId(encodeState(s))).toBe(OLD_ID)
    expect(buildTheme(s)!.css).toBe(buildTheme({ ...s, contrast: 0 })!.css)
  })

  it('a raised level travels on the wire, exactly, and changes the id', async () => {
    const s = { ...decodeState(OLD), contrast: 0.65 }
    const text = encodeState(s)
    expect(JSON.parse(text).contrast).toBe(0.65)
    expect(text.indexOf('"contrast"')).toBeLessThan(text.indexOf('"preset"'))
    expect(decodeState(text).contrast).toBe(0.65)
    expect(await themeId(text)).not.toBe(OLD_ID)
    expect(buildTheme(decodeState(text))!.css).toBe(buildTheme(s)!.css)
  })

  it('a malformed level on the wire is clamped or ignored, never trusted', () => {
    const wire = (v: unknown) => decodeState(OLD.replace('"preset"', `"contrast":${JSON.stringify(v)},"preset"`)).contrast
    expect(wire(4)).toBe(1)
    expect(wire(-2)).toBe(0)
    expect(wire('high')).toBe(0)
  })
})

describe('api — contrast parameter', () => {
  it('reads names and numbers, and refuses anything else', () => {
    expect(['standard', 'medium', 'high', 'HIGH', ' medium '].map(contrastParam)).toEqual([0, 0.5, 1, 1, 0.5])
    expect(['0', '0.25', '1'].map(contrastParam)).toEqual([0, 0.25, 1])
    for (const bad of ['max', '1.5', '-0.1', '', 'constructor', 'NaN'])
      expect(() => contrastParam(bad), bad).toThrow(/contrast is standard, medium, high, or a number from 0 to 1/)
  })

  it('generate takes it, reports it, persists it through from= and riff, and exports it', async () => {
    const env = memoryEnv()
    const base = await summary(env, '/generate?preset=coastal-starter')
    expect(base.contrastLevel).toMatchObject({ level: 0, name: 'standard', text: { lc: 62, wcag: 4.5 } })
    const high = await summary(env, '/generate?preset=coastal-starter&contrast=high')
    expect(high.contrastLevel).toMatchObject({ level: 1, name: 'high', text: { lc: 88, wcag: 10 } })
    expect(high.theme).not.toBe(base.theme)
    expect(high.contrast.light.total).toBe(30)
    const text = (await call(env, `/theme?theme=${high.theme}`)).body
    expect(text).toMatch(/^theme t_\w+ +\(riff 0 · taste 0\.50 · separation layered · contrast high\)/)
    expect(text).toMatch(/\(text ≥ Lc 88 · 10:1\)/)

    const riffed = await summary(env, `/riff?theme=${high.theme}`)
    expect(riffed.contrastLevel.level).toBe(1)
    const back = await summary(env, `/generate?from=${riffed.theme}&contrast=standard`)
    expect(back.contrastLevel.level).toBe(0)
    const json = JSON.parse((await call(env, `/export?theme=${high.theme}&format=json`)).body)
    expect(json.$meta).toEqual({ contrast: 1 })
    expect(await call(env, '/generate?preset=ink-sky&contrast=extreme')).toMatchObject({
      status: 422,
      body: expect.stringContaining('contrast is standard, medium, high'),
    })
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
    // the header names the id and links the theme carried whole, so it opens whether or not the id is stored
    const state = (await call(env, `/state?theme=${g.theme}`)).body
    const link = `https://drewkidwell.com/chromaconscious#s=${statePayload(state)}`
    expect(css.body.split('\n')[0]).toBe(`/* ChromaConscious ${g.theme} · ${link} */`)
    const tw = await call(env, `/export?theme=${g.theme}&format=tailwind`)
    expect(tw.body).toContain('@theme inline')
    const json = JSON.parse((await call(env, `/export?theme=${g.theme}&format=json&mode=dark`)).body)
    expect(json.$extensions.chromaconscious.id).toBe(g.theme)
    expect(json.$extensions.chromaconscious.url).toBe(link)
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
    const closed = { ...env, CHROMACONSCIOUS_API_KEYS: undefined }
    expect((await call(closed, '/generate?preset=ink-sky')).status).toBe(403)
  })

  it('says which of your colors moved, why, and how to keep them', async () => {
    const env = memoryEnv()
    // #6f4e37 is under primary's chroma floor; #d98e04 is over accent's lightness ceiling.
    const g = await summary(env, '/generate?colors=primary:6f4e37,accent:d98e04')
    expect(g.adjusted.map((a: { seat: string }) => a.seat)).toEqual(['primary', 'accent'])
    expect(g.adjusted[0]).toMatchObject({ from: '#6f4e37', to: seat(g, 'primary').hex, fix: 'taste=1 keeps it as typed' })
    expect(g.adjusted[0].why).toMatch(/^too muted for primary \(chroma 0\.057/)
    expect(g.adjusted[1].why).toMatch(/^too light for accent \(lightness 0\.706/)

    // taste=1 keeps them as typed, and nothing is reported.
    const exact = await summary(env, '/generate?colors=primary:6f4e37,accent:d98e04&taste=1')
    expect(exact.adjusted).toEqual([])
    expect(seat(exact, 'primary').hex).toBe('#6f4e37')
    expect((await call(env, `/theme?theme=${exact.theme}`)).body).toMatch(/^adjusted {4}—$/m)

    // Riff names itself, and points at the lock; a locked seat is not reported.
    const r = await summary(env, `/riff?theme=${exact.theme}&hops=3&lock=accent`)
    expect(r.adjusted.map((a: { seat: string }) => a.seat)).toEqual(['primary'])
    expect(r.adjusted[0]).toMatchObject({ why: 'riff 3 moved it', fix: 'lock=primary holds it through riffs' })

    // Chart lightness is clamped even at taste 1.
    const c = await summary(env, '/generate?colors=0b6e4f,f2a541,chart:111111&taste=1')
    expect(c.adjusted).toHaveLength(1)
    expect(c.adjusted[0].seat).toMatch(/^chart-/)
    expect(c.adjusted[0].fix).toMatch(/clamped at any taste/)
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

describe('the legacy name keeps working after the rename', () => {
  const OLD = 'themesmith' // legacy: the name before ChromaConscious
  const req = (path: string, key: string | null = KEY) =>
    new Request(`https://drewkidwell.com${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {}, redirect: 'manual' })

  it('the old API base is an alias: same theme, same id, same export', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=ink-sky')
    const viaOld = await handle(req(`/api/${OLD}/v1/generate?preset=ink-sky&as=json`), env)
    expect(viaOld.status).toBe(200)
    expect((await viaOld.json()).theme).toBe(g.theme)
    const oldCss = await (await handle(req(`/api/${OLD}/v1/export?theme=${g.theme}`, null), env)).text()
    expect(oldCss).toBe((await call(env, `/export?theme=${g.theme}`)).body)
    // a prefix that only looks like a base is not one
    expect((await handle(req(`/api/${OLD}/v1x/presets`, null), env)).status).toBe(404)
  })

  it('JSON exports carry the id under both $extensions keys', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=ink-sky')
    const json = JSON.parse((await call(env, `/export?theme=${g.theme}&format=json`)).body)
    expect(json.$extensions.chromaconscious.id).toBe(g.theme)
    expect(json.$extensions[OLD]).toEqual(json.$extensions.chromaconscious)
  })

  it('reads the legacy secret name when the new one is unset, and prefers the new one', async () => {
    const legacyOnly: Env = { THEMES: memoryEnv().THEMES, [`${OLD.toUpperCase()}_API_KEYS`]: KEY }
    expect((await call(legacyOnly, '/generate?preset=ink-sky')).status).toBe(200)
    const both: Env = { THEMES: memoryEnv().THEMES, CHROMACONSCIOUS_API_KEYS: 'new-key', [`${OLD.toUpperCase()}_API_KEYS`]: KEY }
    expect((await call(both, '/generate?preset=ink-sky')).status).toBe(403)
    expect((await call(both, '/generate?preset=ink-sky', false, 'new-key')).status).toBe(200)
  })

  it('old app links 301 to the new path, keeping the query; the #t_ fragment rides along in the browser', async () => {
    const env = memoryEnv()
    for (const [from, to] of [
      [`/${OLD}`, '/chromaconscious/'],
      [`/${OLD}/`, '/chromaconscious/'],
      [`/${OLD}/?embed=1`, '/chromaconscious/?embed=1'],
      [`/${OLD}/docs.md`, '/chromaconscious/docs.md'],
      [`/${OLD}/skill/SKILL.md`, '/chromaconscious/skill/SKILL.md'],
    ]) {
      const res = await handle(req(from, null), env)
      expect(res.status, from).toBe(301)
      expect(res.headers.get('location'), from).toBe(`https://drewkidwell.com${to}`)
    }
    // no fragment in Location, so the browser keeps the one it had (RFC 9110 §10.2.2)
    expect(legacyAppRedirect(new URL(`https://drewkidwell.com/${OLD}#t_levvog6reokv`))).toBe('https://drewkidwell.com/chromaconscious/')
    expect(legacyAppRedirect(new URL(`https://drewkidwell.com/${OLD}x`))).toBeNull()
    expect(legacyAppRedirect(new URL('https://drewkidwell.com/chromaconscious/'))).toBeNull()
  })
})

describe('export: figma', () => {
  const get = (env: Env, path: string) =>
    handle(new Request(`https://drewkidwell.com/api/chromaconscious/v1${path}`), env)

  // The zip is built only in the browser now (10 ms CPU per request on the
  // Workers free plan); the API's promise is per file.
  it('without mode= the API returns an index of the mode files, not a zip', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=ink-sky')
    const res = await get(env, `/export?theme=${g.theme}&format=figma`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    const index = JSON.parse(await res.text())
    expect(index.files).toHaveLength(6)
    expect(index.files[0].url).toBe(
      `https://drewkidwell.com/api/chromaconscious/v1/export?theme=${g.theme}&format=figma&mode=light`,
    )
  })

  it('each mode file is byte-for-byte that file in the zip the Export dialog builds', async () => {
    const env = memoryEnv()
    // The app's own state for the same preset, built through the ops — not read back from the API.
    const p = PRESETS.find((x) => x.name === 'Ink & sky')!
    const client = unzipSync(figmaExport(runOps(emptyThemeState(), [{ op: 'preset', name: p.name, colors: p.colors }]))!.bytes)
    const g = await summary(env, '/generate?preset=ink-sky')
    for (const name of Object.keys(client).filter((n) => n.endsWith('.json'))) {
      const res = await get(env, `/export?theme=${g.theme}&format=figma&mode=${name.slice(0, -5)}`)
      expect(new Uint8Array(await res.arrayBuffer()), name).toEqual(client[name])
    }
  })

  it('holds for a riffed, locked, high-contrast theme opened from its link', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=pastel-picnic&contrast=high')
    const r = await summary(env, `/riff?theme=${g.theme}&hops=3&lock=primary`)
    // What the app does with /chromaconscious#t_…: fetch /state, decode, export.
    const state = decodeState((await call(env, `/state?theme=${r.theme}`)).body)
    const client = unzipSync(figmaExport(state)!.bytes)
    expect(Object.keys(client)).toHaveLength(7)
    for (const name of Object.keys(client).filter((n) => n.endsWith('.json'))) {
      const res = await get(env, `/export?theme=${r.theme}&format=figma&mode=${name.slice(0, -5)}`)
      expect(new Uint8Array(await res.arrayBuffer()), name).toEqual(client[name])
    }
  })

  it('&mode= returns one file, the same text as that file in the zip', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=ink-sky')
    const res = await get(env, `/export?theme=${g.theme}&format=figma&mode=dark-high`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${g.theme}-dark-high.json"`)
    const state = decodeState((await call(env, `/state?theme=${g.theme}`)).body)
    expect(await res.text()).toBe(figmaModeFiles(state)!.find((f) => f.name === 'dark-high')!.json)
    expect(await call(env, `/export?theme=${g.theme}&format=figma&mode=dim`)).toMatchObject({
      status: 422,
      body: expect.stringContaining('light, dark, light-medium'),
    })
  })
})

describe('state= : the theme carried in the request', () => {
  const get = (env: Env, path: string) =>
    handle(new Request(`https://drewkidwell.com/api/chromaconscious/v1${path}`), env)

  it('reads with no key and no store, and has the id the stored theme has', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=coastal-starter&lock=primary&taste=0.7')
    const payload = statePayload((await call(env, `/state?theme=${g.theme}`)).body)
    const empty = memoryEnv()
    const res = await get(empty, `/theme?state=${payload}&as=json`)
    expect(res.status).toBe(200)
    const t = JSON.parse(await res.text())
    expect(t.theme).toBe(g.theme)
    expect(t.parent).toBeNull()
    expect(t.links.export).toBe(`https://drewkidwell.com/api/chromaconscious/v1/export?state=${payload}&format=css`)
    expect(empty.size()).toBe(0) // nothing was saved
  })

  it('starts generate and riff like a stored theme would', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=coastal-starter')
    const payload = statePayload((await call(env, `/state?theme=${g.theme}`)).body)
    const fromState = await summary(memoryEnv(), `/riff?state=${payload}&hops=2`)
    const fromId = await summary(env, `/riff?theme=${g.theme}&hops=2`)
    expect(fromState.theme).toBe(fromId.theme)
    expect(fromState.parent).toBeNull()
    const n = await summary(memoryEnv(), `/generate?state=${payload}&taste=0.9`)
    expect(n.taste).toBe(0.9)
  })

  it('a malformed, cut or future payload is a 422 that says so; both refs at once is a 400', async () => {
    const env = memoryEnv()
    const g = await summary(env, '/generate?preset=coastal-starter')
    const payload = statePayload((await call(env, `/state?theme=${g.theme}`)).body)
    for (const bad of ['', '!!', payload.slice(0, -4), 'Ag'])
      expect((await call(env, `/theme?state=${bad}`)).status, bad).toBe(422)
    expect((await call(env, '/theme?state=Ag')).body).toContain('newer ChromaConscious')
    expect(await call(env, `/theme?theme=${g.theme}&state=${payload}`)).toMatchObject({ status: 400 })
  })
})
