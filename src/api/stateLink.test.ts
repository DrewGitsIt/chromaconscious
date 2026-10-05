import { describe, expect, it } from 'vitest'
import { deflateSync } from 'fflate'
import { candidatesFromList, generateTheme, toHex } from '../engine'
import { configs } from '../engine/goldenConfigs'
import type { ThemeState } from '../ops'
import { applyOp, emptyThemeState } from '../ops'
import { PRESETS } from '../presets'
import { StateError, decodeState, encodeState, themeId } from './state'
import { LINK_VERSION, fromBase64url, packState, payloadState, statePayload, toBase64url } from './stateLink'

const ORIGIN = 'https://drewkidwell.com'

const preset = (name: string) => {
  const p = PRESETS.find((x) => x.name === name)!
  return applyOp(emptyThemeState(), { op: 'preset', name: p.name, colors: p.colors }, { mode: 'dark' })
}
/** Hexes as an image extraction gives them: lowercase #rrggbb, marked as from an image. */
const extraction = (n: number): ThemeState => {
  const hexes = Array.from({ length: n }, (_, i) =>
    toHex({ l: 0.3 + 0.6 * ((i * 0.618) % 1), c: 0.05 + 0.15 * ((i * 0.414) % 1), h: (i * 137.5) % 360 }),
  )
  return { ...emptyThemeState(), candidates: candidatesFromList(hexes).map((c) => ({ ...c, source: 'image' as const })) }
}
const riffedLocked = (): ThemeState => {
  let s = preset('Coastal starter')
  s = applyOp(s, { op: 'riff', hops: 10 }, { mode: 'dark' })
  s = applyOp(s, { op: 'lock', role: 'primary' }, { mode: 'dark' })
  s = applyOp(s, { op: 'lock', role: 'accent' }, { mode: 'dark' })
  return s
}

/** "Derive safely" at taste 1: one or two colours with their own taste. */
const overridden = (tastes: number[]): ThemeState => {
  const s = { ...preset('Coastal starter'), fidelity: 1 }
  return { ...s, candidates: s.candidates.map((c, i) => (i < tastes.length ? { ...c, fidelity: tastes[i] } : c)) }
}

const roundTrips = async (s: ThemeState) => {
  const canonical = encodeState(s)
  const back = payloadState(statePayload(canonical))
  expect(back).toBe(canonical)
  expect(await themeId(encodeState(decodeState(back)))).toBe(await themeId(canonical))
}

describe('state links: lossless', () => {
  it('every golden fixture round-trips to the same canonical text and id', async () => {
    const all = configs()
    expect(all.length).toBeGreaterThan(4000)
    for (const { opts } of all) {
      const s: ThemeState = {
        candidates: opts.candidates!,
        fidelity: opts.fidelity ?? 0.5,
        seed: opts.seed ?? 0,
        monoBase: opts.monoBase ?? null,
        separation: opts.separation ?? 'layered',
        contrast: 0,
        preset: null,
      }
      const canonical = encodeState(s)
      expect(payloadState(statePayload(canonical))).toBe(canonical)
      // and again with a derive-safely override on the first colour
      const o = encodeState({ ...s, candidates: s.candidates.map((c, i) => (i ? c : { ...c, fidelity: 0.25 })) })
      expect(payloadState(statePayload(o))).toBe(o)
    }
    // ids for a slice (hashing all 4k is slow and proves nothing more)
    for (const { opts } of all.filter((_, i) => i % 97 === 0)) {
      await roundTrips({ ...emptyThemeState(), candidates: opts.candidates!, seed: opts.seed ?? 0 })
    }
  })

  it('every setting, at defaults and off them, survives', async () => {
    await roundTrips(riffedLocked())
    await roundTrips({ ...preset('Ink & sky'), contrast: 0.5, fidelity: 0.73, separation: 'lifted', monoBase: 1 })
    await roundTrips({ ...preset('Neon arcade'), contrast: 1 / 3, fidelity: 1 / 7 })
    await roundTrips({ ...preset('Terracotta'), preset: 'a name no preset has ✓' })
    // a colour's own taste: every derive-safely step, 1, and an off-grid value
    for (const t of [0, 0.25, 0.5, 0.75, 1, 0.33, 1 / 3]) await roundTrips(overridden([t]))
    await roundTrips(overridden([0.25, 0.5]))
    await roundTrips({ ...riffedLocked(), candidates: riffedLocked().candidates.map((c) => ({ ...c, fidelity: 0 })) })
    await roundTrips({
      ...emptyThemeState(),
      candidates: candidatesFromList(['#ABCDEF', 'rebeccapurple', '#abc', 'oklch(0.7 0.1 200)']).map((c, i) =>
        i === 1 ? { ...c, pin: 'chart' as const, benched: true, origin: 'invented' as const } : c,
      ),
    })
  })

  it("a colour's own taste costs one byte, and survives into the theme", () => {
    const plain = packState(encodeState(overridden([])))
    const one = packState(encodeState(overridden([0.25])))
    expect(one.length - plain.length).toBe(1)
    const back = decodeState(payloadState(statePayload(encodeState(overridden([0.25, 0.5])))))
    expect(back.candidates.slice(0, 3).map((c) => c.fidelity)).toEqual([0.25, 0.5, undefined])
  })

  it('a version-1 link (before per-colour taste) still opens, to the same text', () => {
    const canonical = encodeState(riffedLocked())
    const v1 = packState(canonical)
    v1[0] = 1
    expect(payloadState(toBase64url(v1))).toBe(canonical)
    // v1 never carried a colour's taste, so a v1 link claiming one is malformed
    const bad = packState(encodeState(overridden([0.25])))
    bad[0] = 1
    expect(() => payloadState(toBase64url(bad))).toThrow(StateError)
  })

  it('the theme opened from a link is the theme that made it', () => {
    const s = riffedLocked()
    const back = decodeState(payloadState(statePayload(encodeState(s))))
    const build = (x: ThemeState) =>
      generateTheme({ ...x, monoBase: x.monoBase ?? undefined }).css
    expect(build(back)).toBe(build(s))
  })
})

describe('state links: refuse quietly, never crash', () => {
  const good = statePayload(encodeState(preset('Coastal starter')))

  it('a truncated payload is a StateError', () => {
    for (let n = 0; n < good.length; n++) {
      const cut = good.slice(0, n)
      let threw: unknown = null
      try {
        payloadState(cut)
      } catch (e) {
        threw = e
      }
      // a cut can land on a byte boundary that still reads; it must never be anything but a StateError
      if (threw) expect(threw).toBeInstanceOf(StateError)
    }
    expect(() => payloadState(good.slice(0, -3))).toThrow(StateError)
  })

  it('garbage, empty and non-base64 payloads are StateErrors', () => {
    for (const bad of ['', '!!!', 'AAAA', 'AQ', '____', `${good}AAAA`, 'AQAB_w'])
      expect(() => decodeState(payloadState(bad)), bad).toThrow(StateError)
  })

  it('an unknown version says so', () => {
    const bytes = packState(encodeState(preset('Coastal starter')))
    bytes[0] = LINK_VERSION + 1
    expect(LINK_VERSION).toBe(2)
    expect(() => payloadState(toBase64url(bytes))).toThrow(/newer ChromaConscious/)
  })

  it('base64url round-trips every byte', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(fromBase64url(toBase64url(all))).toEqual(all)
  })
})

/**
 * The measurements behind the codec choice. Run with MEASURE=1 to print the
 * table; it always checks that binary wins on every case.
 */
describe('state links: size', () => {
  const b64 = (s: string) => toBase64url(new TextEncoder().encode(s))
  const deflated = (bytes: Uint8Array) => toBase64url(deflateSync(bytes, { level: 9 }))
  const url = (payload: string, extra = '') => `${ORIGIN}/chromaconscious#s=${payload}${extra}`
  const cases: [string, ThemeState, string][] = [
    ...PRESETS.map((p) => [`preset: ${p.name}`, preset(p.name), ''] as [string, ThemeState, string]),
    ['single colour', { ...emptyThemeState(), candidates: candidatesFromList(['#3b82f6']) }, ''],
    ['image, 5 colours', extraction(5), ''],
    ['image, 12 colours', extraction(12), ''],
    ['riff hop 10, 2 locks', riffedLocked(), ''],
    ['taste 1, 1 colour derived safely', overridden([0.25]), ''],
    ['taste 1, 2 colours derived safely', overridden([0.25, 0.5]), ''],
    ['riff 10 + locks + page + vision', riffedLocked(), '&radius=4&font=tinos&vision=deutan&strength=60'],
  ]

  it('binary is the shortest on every case', () => {
    const rows = cases.map(([name, s, extra]) => {
      const canonical = encodeState(s)
      const text = new TextEncoder().encode(canonical)
      const bin = packState(canonical)
      return {
        name,
        a: url(b64(canonical), extra).length,
        b: url(deflated(text), extra).length,
        c: url(toBase64url(bin), extra).length,
        d: url(deflated(bin), extra).length,
      }
    })
    if (process.env.MEASURE) {
      console.log(
        ['case | a b64 JSON | b deflate JSON | c binary | c+deflate', ...rows.map((r) => `${r.name} | ${r.a} | ${r.b} | ${r.c} | ${r.d}`)].join('\n'),
      )
    }
    for (const r of rows) expect(r.c, r.name).toBeLessThanOrEqual(Math.min(r.a, r.b, r.d))
  })
})
