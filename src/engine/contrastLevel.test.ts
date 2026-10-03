import { describe, expect, it } from 'vitest'
import type { ContrastTargets } from './contrastLevel'
import { CONTRAST_LEVELS, contrastLevelName, contrastTargets, normalizeContrast } from './contrastLevel'
import { solveLightness } from './contrast'
import { makeRamp } from './ramp'
import { buildReport, compliantSolid, fillMinimums } from './tokens'
import { SEPARATIONS, candidatesFromList, generateTheme, parseColor, wcagRatio } from './index'
import { PRESETS } from '../presets'

const MODES = ['light', 'dark'] as const

/** Every number in a target set, flattened with a stable name. */
const flat = (t: ContrastTargets): Record<string, number> => ({
  'textLow.lc': t.textLow.lc,
  'textLow.wcag': t.textLow.wcag,
  'textHigh.lc': t.textHigh.lc,
  'textHigh.wcag': t.textHigh.wcag,
  'text.lc': t.text.lc,
  'text.wcag': t.text.wcag,
  'mark.lc': t.mark.lc,
  'mark.wcag': t.mark.wcag,
  pop: t.pop,
  border: t.border,
  input: t.input,
})

describe('contrast level — the target mapping', () => {
  it('standard is exactly the literals the engine used to hardcode', () => {
    expect(contrastTargets(0)).toEqual({
      textLow: { lc: 62, wcag: 4.6 }, // ramp step 11
      textHigh: { lc: 92, wcag: 7 }, // ramp step 12
      text: { lc: 62, wcag: 4.5 }, // report gate; link solve
      mark: { lc: 45, wcag: 3 }, // accent-strong / ring
      pop: 3,
      border: 1, // no floor: separation alone decides
      input: 1,
    })
    expect(contrastTargets()).toEqual(contrastTargets(0))
  })

  it('names the three detents and maps the readout floors', () => {
    expect(CONTRAST_LEVELS).toEqual({ standard: 0, medium: 0.5, high: 1 })
    expect(contrastTargets(0.5).text).toEqual({ lc: 75, wcag: 7 })
    expect(contrastTargets(1).text).toEqual({ lc: 88, wcag: 10 })
    expect(contrastTargets(1).mark).toEqual({ lc: 65, wcag: 4.5 })
    expect([contrastTargets(0.5).border, contrastTargets(0.5).input]).toEqual([2, 3])
    expect([contrastTargets(1).border, contrastTargets(1).input]).toEqual([3, 4.5])
    expect([0, 0.5, 1, 0.25].map(contrastLevelName)).toEqual(['standard', 'medium', 'high', null])
  })

  it('interpolates linearly between detents', () => {
    expect(contrastTargets(0.25).text.wcag).toBeCloseTo(5.75, 10)
    expect(contrastTargets(0.75).text.lc).toBeCloseTo(81.5, 10)
  })

  it('every target is monotone in the level — a higher level never asks for less', () => {
    let prev = flat(contrastTargets(0))
    for (let k = 1; k <= 100; k++) {
      const cur = flat(contrastTargets(k / 100))
      for (const key of Object.keys(cur)) expect(cur[key], `${key} at ${k / 100}`).toBeGreaterThanOrEqual(prev[key])
      prev = cur
    }
  })

  it('clamps out-of-range and unreadable levels instead of extrapolating', () => {
    expect(normalizeContrast(-1)).toBe(0)
    expect(normalizeContrast(7)).toBe(1)
    expect(normalizeContrast(NaN)).toBe(0)
    expect(normalizeContrast(undefined)).toBe(0)
    expect(contrastTargets(3)).toEqual(contrastTargets(1))
  })
})

describe('contrast level — the zero point', () => {
  it('standard is byte-identical to omitting the level', () => {
    for (const p of PRESETS) {
      const candidates = candidatesFromList(p.colors)
      for (const fidelity of [0, 0.5, 1]) {
        const plain = generateTheme({ candidates, fidelity, seed: 2 })
        const zero = generateTheme({ candidates, fidelity, seed: 2, contrast: 0 })
        expect(JSON.stringify(zero)).toBe(JSON.stringify(plain))
        // …and carries no trace of the level: no key, no Lc gate, no hairline rows.
        expect('contrast' in zero).toBe(false)
        expect(zero.light.report).toHaveLength(26)
        expect(zero.light.report.some((r) => 'requiredLc' in r)).toBe(false)
      }
    }
  })
})

describe('contrast level — monotone in the theme it builds', () => {
  // EVERY checked pair — text, marks, the primary fill against the page — and
  // both hairlines (checked only above standard, so measured directly here),
  // against the level before it: presets × both modes × three tastes × every
  // separation. A user who drags the slider up must never watch a check fall.
  const checkedPairs = (r: ReturnType<typeof generateTheme>, mode: 'light' | 'dark') => {
    const out: Record<string, number> = {}
    for (const row of r[mode].report) out[`${row.token}/${row.background}`] = row.wcag
    const t = r[mode].tokens
    out['border/background'] = wcagRatio(t.border, t.background)
    out['input/background'] = wcagRatio(t.input, t.background)
    return out
  }

  it('raising the level never lowers the contrast of any checked pair or hairline', () => {
    const drops: string[] = []
    for (const p of PRESETS) {
      const candidates = candidatesFromList(p.colors)
      for (const fidelity of [0, 0.5, 1])
        for (const separation of SEPARATIONS) {
          let prev: Record<string, number> | null = null
          for (let k = 0; k <= 10; k++) {
            const r = generateTheme({ candidates, fidelity, separation, contrast: k / 10 })
            const cur = { ...prefix('light', checkedPairs(r, 'light')), ...prefix('dark', checkedPairs(r, 'dark')) }
            if (prev)
              for (const key of Object.keys(prev))
                if (cur[key] < prev[key] - 0.005)
                  drops.push(`${p.name} f${fidelity} ${separation} c${k / 10} ${key} ${prev[key].toFixed(2)}→${cur[key].toFixed(2)}`)
            prev = cur
          }
        }
    }
    expect(drops).toEqual([])
  }, 120_000)
})

const prefix = (m: string, o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [`${m} ${k}`, v]))

describe('contrast level — every preset at medium and high', () => {
  it('meets every gate at the default taste, both modes', () => {
    for (const p of PRESETS)
      for (const contrast of [0.5, 1]) {
        const r = generateTheme({ candidates: candidatesFromList(p.colors), contrast })
        for (const mode of MODES) {
          const fails = r[mode].report.filter((x) => !x.pass)
          expect(fails.map((f) => `${f.token}/${f.background}`), `${p.name} ${mode} c${contrast}`).toEqual([])
          // The hairlines and the APCA floor joined the checks.
          expect(r[mode].report).toHaveLength(30)
          const fg = r[mode].report.find((x) => x.token === 'foreground')!
          expect(fg.requiredLc).toBe(contrastTargets(contrast).text.lc)
        }
      }
  })

  it('at taste 1 the only misses are the primary fill held where you put it — taste, not a ceiling', () => {
    const misses: string[] = []
    for (const p of PRESETS)
      for (const contrast of [0.5, 1]) {
        const r = generateTheme({ candidates: candidatesFromList(p.colors), contrast, fidelity: 1 })
        for (const mode of MODES)
          for (const f of r[mode].report.filter((x) => !x.pass)) {
            expect(['primary/background', 'primary-foreground/primary']).toContain(`${f.token}/${f.background}`)
            expect(f.unreachable).toBeUndefined()
            misses.push(`${p.name} ${mode} c${contrast} ${f.token}/${f.background}`)
          }
      }
    // A pale primary that never stood off the page at standard is held, not
    // lightened into it: its page contrast is exactly what it was at standard.
    const sky = (c: number) => generateTheme({ candidates: candidatesFromList(PRESETS[1].colors), contrast: c, fidelity: 1 }).light
    expect(sky(1).tokens.primary).toBe(sky(0).tokens.primary)
    expect(misses).toMatchSnapshot()
  })

  it('a dark-mode fill crosses to the other ink rather than sinking into the page', () => {
    // Coastal's primary in dark mode sits mid-band under white text: fleeing
    // the ink would drag it toward the near-black page (pop fell to 1.86:1).
    const r = generateTheme({ candidates: candidatesFromList(PRESETS[0].colors), contrast: 1 })
    const t = r.dark.tokens
    expect(wcagRatio(t['primary-foreground'], t.primary)).toBeGreaterThanOrEqual(10)
    expect(wcagRatio(t.primary, t.background)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('contrast level — unreachable targets are reported, not hidden', () => {
  it('the solver says when a target is out of reach, and returns its extreme', () => {
    const hit = solveLightness(60, 4.5, '#ffffff', 250, () => 0.02, 'darker')
    expect(hit.reached).toBe(true)
    const miss = solveLightness(130, 30, '#ffffff', 250, () => 0.02, 'darker')
    expect(miss.reached).toBe(false)
    expect(miss.color.l).toBe(0.03) // the darkest the search goes: the most contrast there is
  })

  it('the ramp names the steps whose solve ran out of room', () => {
    // A cream neutral pulls the light page down off white; body text's high-
    // level APCA aim (Lc 95) is above what that page can give.
    const cream = parseColor('#f4e3c1')!
    const ramp = makeRamp(cream, 'light', { isNeutral: true, contrast: 1 })
    expect(ramp.unreached).toContain(11)
    expect(makeRamp(cream, 'light', { isNeutral: true }).unreached).not.toContain(10)
  })

  it('a failing row whose foreground hit the wall is marked unreachable; a choice is not', () => {
    const targets = contrastTargets(1)
    const tokens = { foreground: '#777777', background: '#ffffff', primary: '#eeeeee' }
    // Only the pairs the fixture holds are read; build a full token map around them.
    const full = new Proxy(tokens as Record<string, string>, { get: (o, k: string) => o[k] ?? '#000000' })
    const rows = buildReport(full, targets, true, new Set(['foreground']))
    const fg = rows.find((r) => r.token === 'foreground' && r.background === 'background')!
    expect(fg).toMatchObject({ pass: false, unreachable: true, requiredWcag: 10, requiredLc: 88 })
    const pop = rows.find((r) => r.token === 'primary')!
    expect(pop.pass).toBe(false)
    expect('unreachable' in pop).toBe(false)
  })

  it('a fill that cannot carry its label within the walk says so', () => {
    // No hue can put a near-white or near-black label at 30:1 on anything.
    const s = compliantSolid('#3b82f6', 260, '#ffffff', Infinity, { text: 30, pop: 3, textLc: 120 })
    expect(s.textOk).toBe(false)
    expect(compliantSolid('#3b82f6', 260, '#ffffff', Infinity, fillMinimums(contrastTargets(1), 1)).textOk).toBe(true)
  })

  it('never crashes or loops at the top of the scale, on any palette shape', () => {
    const shapes = [
      ['#000000'],
      ['#ffffff'],
      ['#fdf6e3', '#eee8d5', '#f5f0e1', '#fffaf0'],
      ['#0b0b10', '#121826', '#1a1a2e', '#16213e'],
      ['oklch(0.7 0.37 145)', 'oklch(0.55 0.35 300)', 'oklch(0.9 0.3 100)'],
      ['#ff00ff', '#00ffff', '#ffff00', '#00ff00'],
    ]
    for (const colors of shapes)
      for (const fidelity of [0, 1])
        for (const monoBase of [undefined, 0]) {
          const r = generateTheme({ candidates: candidatesFromList(colors), fidelity, monoBase, contrast: 1, seed: 3 })
          for (const mode of MODES) for (const v of Object.values(r[mode].tokens)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
        }
  })
})
