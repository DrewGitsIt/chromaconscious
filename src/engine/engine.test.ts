import { describe, expect, it } from 'vitest'
import type { ThemeResult } from './index'
import { candidatesFromList, generateTheme, parseColor, resolveBrand, wcagRatio } from './index'
import { deltaEok, hueDistance } from './color'
import { extractCandidates } from './extract'

const PALETTE = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557']

describe('generateTheme', () => {
  it('produces contrast-passing text tokens in both modes at fidelity 0', () => {
    const result = generateTheme({ candidates: candidatesFromList(PALETTE), fidelity: 0 })
    for (const mode of [result.light, result.dark]) {
      for (const r of mode.report.filter((r) => r.requiredWcag === 4.5)) {
        expect(r.wcag, `${r.token} on ${r.background} (${r.fg} on ${r.bg})`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('makes the first-listed vivid color primary (order = priority) and finds an accent', () => {
    const result = generateTheme({ candidates: candidatesFromList(PALETTE) })
    const byRole = Object.fromEntries(result.assignments.map((a) => [a.role, a.candidateIndex]))
    expect(byRole.primary).toBe(0) // #e63946 listed first
    expect([2, 3, 4]).toContain(byRole.accent) // hue-distant from the red
  })

  it('with a blue listed first, red goes to danger', () => {
    const reordered = ['#457b9d', '#f1faee', '#a8dadc', '#e63946', '#1d3557']
    const result = generateTheme({ candidates: candidatesFromList(reordered) })
    const byRole = Object.fromEntries(result.assignments.map((a) => [a.role, a.candidateIndex]))
    expect(byRole.primary).toBe(0) // #457b9d
    expect(byRole.danger).toBe(3) // #e63946
  })

  it('assigns a low-chroma input to neutral', () => {
    const result = generateTheme({ candidates: candidatesFromList(PALETTE) })
    const neutral = result.assignments.find((a) => a.role === 'neutral')!
    expect(neutral.candidateIndex).toBe(1) // #f1faee, near-white
  })

  it('respects pins over inference', () => {
    const candidates = candidatesFromList(PALETTE)
    candidates[2].pin = 'primary'
    const result = generateTheme({ candidates })
    const primary = result.assignments.find((a) => a.role === 'primary')!
    expect(primary.candidateIndex).toBe(2)
  })

  it('synthesizes all roles from a single color', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#7c3aed']) })
    expect(result.assignments).toHaveLength(6)
    expect(result.light.tokens['primary']).toMatch(/^#/)
    for (const r of result.light.report.filter((r) => r.requiredWcag === 4.5)) {
      expect(r.wcag, r.token).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('dark background is dark, light background is light', () => {
    const result = generateTheme({ candidates: candidatesFromList(PALETTE) })
    expect(wcagRatio(result.light.tokens.background, '#000000')).toBeGreaterThan(15)
    expect(wcagRatio(result.dark.tokens.background, '#ffffff')).toBeGreaterThan(10)
  })

  it('emits css with :root and .dark blocks', () => {
    const result = generateTheme({ candidates: candidatesFromList(PALETTE) })
    expect(result.css).toContain(':root')
    expect(result.css).toContain('.dark')
    expect(result.css).toContain('--background:')
  })

  it('at fidelity 1 a mid-tone vivid input survives verbatim as primary', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#457b9d']), fidelity: 1 })
    const primary = result.assignments.find((a) => a.role === 'primary')!
    expect(primary.deltaE).toBeLessThan(0.001)
  })

  it('a cream neutral at high fidelity yields a genuinely tinted background, still passing contrast', () => {
    // "soft yellow with browns and blues" — the background must go cream, not gray
    const cream = ['#b45309', '#fefae0', '#1d4ed8']
    const result = generateTheme({ candidates: candidatesFromList(cream), fidelity: 1 })
    const bg = parseColor(result.light.tokens.background)!
    expect(bg.c).toBeGreaterThan(0.02)
    expect(bg.l).toBeLessThan(0.985)
    const darkBg = parseColor(result.dark.tokens.background)!
    expect(darkBg.c).toBeGreaterThan(0.015)
    for (const mode of [result.light, result.dark]) {
      for (const r of mode.report.filter((r) => r.requiredWcag === 4.5)) {
        expect(r.wcag, `${r.token} on ${r.background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('a true gray neutral stays gray', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#e63946', '#808080']), fidelity: 1 })
    const bg = parseColor(result.light.tokens.background)!
    expect(bg.c).toBeLessThan(0.005)
  })
})

describe('mono lock', () => {
  it('every seed and every chart the engine invents wears the base hue', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#fa8072']), monoBase: 0 })
    const base = parseColor('#fa8072')!
    expect(result.monoBase).toBe(0)
    for (const a of result.assignments) {
      // hue is meaningless on near-achromatic seeds (the neutral)
      if (a.seed.c > 0.01) expect(hueDistance(a.seed.h, base.h), a.role).toBeLessThan(2)
    }
    for (const mode of [result.light, result.dark] as const) {
      for (let k = 1; k <= 5; k++) {
        const c = parseColor(mode.tokens[`chart-${k}`])!
        if (c.c > 0.01) expect(hueDistance(c.h, base.h), `chart-${k}`).toBeLessThan(2)
      }
    }
  })

  it('mono charts separate on lightness, not hue', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#fa8072']), monoBase: 0 })
    const ls = [1, 2, 3, 4, 5].map((k) => parseColor(result.light.tokens[`chart-${k}`])!.l)
    const sorted = [...ls].sort((a, b) => b - a)
    expect(ls).toEqual(sorted) // a descending ladder
    for (let i = 1; i < ls.length; i++) expect(ls[i - 1] - ls[i]).toBeGreaterThan(0.05)
  })

  it('an achromatic base yields a pure value scale — no token gets tinted', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#565656']), monoBase: 0 })
    for (const mode of [result.light, result.dark] as const) {
      for (const [name, hex] of Object.entries(mode.tokens)) {
        expect(parseColor(hex)!.c, name).toBeLessThan(0.01)
      }
    }
  })

  it('still passes every text-contrast check under the lock', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#fa8072']), monoBase: 0 })
    for (const mode of [result.light, result.dark]) {
      for (const r of mode.report.filter((r) => r.requiredWcag === 4.5)) {
        expect(r.wcag, `${r.token} on ${r.background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('colors the user layers on top are coerced to the base hue too', () => {
    // The lock used to exempt anything the user supplied, which meant a board
    // the user had filled came out barely monochrome at all — four of six
    // seats keeping their own hue is not a mono theme. An unlocked seat is now
    // treated as derived, whoever is holding it.
    const result = generateTheme({
      candidates: candidatesFromList(['#fa8072', '#4fc9a4']),
      monoBase: 0,
    })
    const base = parseColor('#fa8072')!
    const layered = result.assignments.find((a) => a.candidateIndex === 1)
    expect(layered, 'aquamarine should still claim a role').toBeTruthy()
    expect(hueDistance(layered!.seed.h, base.h), 'aqua must take the base hue').toBeLessThan(2)
  })

  it('a lock is the one way to keep your own hue under the mono lock', () => {
    const candidates = candidatesFromList(['#fa8072', '#4fc9a4'])
    candidates[1].locked = true
    const result = generateTheme({ candidates, monoBase: 0 })
    const aqua = parseColor('#4fc9a4')!
    const layered = result.assignments.find((a) => a.candidateIndex === 1)!
    expect(layered.seed).toEqual(aqua)
  })

  it('engaging the lock moves no colour between seats', () => {
    // Crowning the base primary reshuffled the board under the user: picking
    // the accent as your base silently made that colour the primary and
    // displaced whatever was there, so the pick read as having been ignored.
    // The lock says what the colours ARE, never where they sit.
    const candidates = candidatesFromList(['#e63946', '#3a7ca5'])
    const seatOf = (r: ThemeResult, i: number) =>
      r.assignments.find((a) => a.candidateIndex === i)?.role ?? null
    const free = generateTheme({ candidates })
    const locked = generateTheme({ candidates, monoBase: 1 })

    expect(seatOf(locked, 1), 'the base sits where scoring put it').toBe(seatOf(free, 1))
    expect(seatOf(locked, 0), 'and nobody else was displaced').toBe(seatOf(free, 0))
    // every chromatic seat now speaks in the base's hue, the base's seat too
    const base = parseColor('#3a7ca5')!
    for (const a of locked.assignments) {
      if (a.seed.c > 0.01) expect(hueDistance(a.seed.h, base.h), a.role).toBeLessThan(2)
    }
  })

  it('a primary pin outranks the lock; the base still donates its hue', () => {
    // navy buttons inside salmon-tinted chrome: pins > lock > scoring
    const candidates = candidatesFromList(['#fa8072', '#1d3557'])
    candidates[1].pin = 'primary'
    const result = generateTheme({ candidates, monoBase: 0 })
    const byRole = Object.fromEntries(result.assignments.map((a) => [a.role, a.candidateIndex]))
    expect(byRole.primary).toBe(1)
    const base = parseColor('#fa8072')!
    const navy = parseColor('#1d3557')!
    for (const a of result.assignments) {
      if (a.candidateIndex == null && a.seed.c > 0.01) {
        expect(hueDistance(a.seed.h, base.h), a.role).toBeLessThan(2)
      }
    }
    // invented charts ladder over the base hue, not the navy primary
    for (let k = 1; k <= 5; k++) {
      const c = parseColor(result.light.tokens[`chart-${k}`])!
      if (c.c > 0.01) {
        expect(hueDistance(c.h, base.h), `chart-${k}`).toBeLessThan(2)
        expect(hueDistance(c.h, navy.h), `chart-${k}`).toBeGreaterThan(90)
      }
    }
  })

  it('a locked gray gains no chroma even at mid fidelity', () => {
    const result = generateTheme({
      candidates: candidatesFromList(['#808080']),
      monoBase: 0,
      fidelity: 0.5,
    })
    const primary = result.assignments.find((a) => a.role === 'primary')!
    expect(primary.seed.c).toBeLessThan(0.001)
  })

  it('the mono ladder owns every chart slot, not just the invented ones', () => {
    // The defect this pins: the ladder used to fill only the slots no colour
    // of yours reached, so a chart colour you supplied kept its own hue and
    // sat outside the very palette the lock exists to unify — visibly the one
    // thing left off-hue on the page.
    const set = ['#436398', '#8ea3c5', '#234173', '#6681ad', '#a9c5f5', '#c9c96a', '#5ec8d0']
    const candidates = candidatesFromList(set)
    const result = generateTheme({ candidates, monoBase: 0 })
    expect(result.chartCandidateIndexes.length, 'the tray must hold colours of yours').toBeGreaterThan(0)
    const base = result.assignments.find((a) => a.candidateIndex === 0)!.seed
    for (const mode of ['light', 'dark'] as const) {
      for (let k = 1; k <= 5; k++) {
        const t = parseColor(result[mode].tokens[`chart-${k}`])!
        expect(hueDistance(t.h, base.h), `${mode} chart-${k}`).toBeLessThan(3)
      }
    }
  })

  it('a locked chart colour is the one thing the ladder steps around', () => {
    const set = ['#436398', '#8ea3c5', '#234173', '#6681ad', '#a9c5f5', '#c9c96a', '#5ec8d0']
    const candidates = candidatesFromList(set)
    const free = generateTheme({ candidates, monoBase: 0 })
    const target = free.chartCandidateIndexes[0]
    const locked = candidates.map((c, i) => (i === target ? { ...c, locked: true } : c))
    const held = generateTheme({ candidates: locked, monoBase: 0 })
    // it keeps its exact colour where the ladder would otherwise have spoken
    expect(held.light.tokens['chart-1']).toBe(set[target])
    expect(held.light.tokens['chart-1']).not.toBe(free.light.tokens['chart-1'])
  })

  it('fidelity does not exempt the base; a lock does', () => {
    // Mono and fidelity are independent axes, the same way riff and fidelity
    // are. Fidelity says how faithfully a colour the engine is FREE to move
    // gets treated; the lock says which colours it may not move at all. So at
    // verbatim fidelity the base still takes its rung on the mono ladder —
    // exempting it there would put a second, silent freeze beside the real one.
    const base = candidatesFromList(['#808080'])
    const free = generateTheme({ candidates: base, monoBase: 0, fidelity: 1 })
    expect(free.assignments.find((a) => a.role === 'primary')!.deltaE).toBeGreaterThan(0.01)

    const locked = candidatesFromList(['#808080'])
    locked[0].locked = true
    const held = generateTheme({ candidates: locked, monoBase: 0, fidelity: 1 })
    expect(held.assignments.find((a) => a.candidateIndex === 0)!.seed).toEqual(
      parseColor('#808080'),
    )
  })
})

// The muddy-photo palette: four olives 4° of hue apart plus skin tones.
const HEADSHOT = ['#60742e', '#9b6d55', '#050200', '#3d5118', '#152002', '#293b05']

describe('pairwise repair', () => {
  it('makes chart colors tellable apart and vivid, even from near-identical dark inputs', () => {
    const result = generateTheme({ candidates: candidatesFromList(HEADSHOT), fidelity: 0.5 })
    const charts = [1, 2, 3, 4, 5]
      .map((i) => parseColor(result.light.tokens[`chart-${i}`])!)
      .slice(0, Math.max(result.chartCandidateIndexes.length, 2))
    for (let i = 0; i < charts.length; i++) {
      expect(charts[i].l, `chart-${i + 1} must be a usable mid-tone, not near-black`).toBeGreaterThan(0.4)
      for (let j = i + 1; j < charts.length; j++) {
        expect(
          deltaEok(charts[i], charts[j]),
          `chart-${i + 1} vs chart-${j + 1}`,
        ).toBeGreaterThanOrEqual(0.09)
      }
    }
    expect(result.repairs).toHaveLength(0)
  })

  it('keeps status colors from impersonating primary or accent', () => {
    const result = generateTheme({ candidates: candidatesFromList(HEADSHOT), fidelity: 0.5 })
    const seed = (role: string) => result.assignments.find((a) => a.role === role)!.seed
    for (const s of ['danger', 'success', 'warning']) {
      expect(deltaEok(seed('primary'), seed(s)), `primary vs ${s}`).toBeGreaterThanOrEqual(0.09)
      expect(deltaEok(seed('accent'), seed(s)), `accent vs ${s}`).toBeGreaterThanOrEqual(0.09)
    }
  })

  it('at fidelity 1 unfixable collisions become residuals instead of moved colors', () => {
    // two near-identical blues: both user colors, zero repair budget
    const result = generateTheme({
      candidates: candidatesFromList(['#e63946', '#f1faee', '#1550a0', '#1552a2']),
      fidelity: 1,
    })
    expect(result.repairs.length).toBeGreaterThan(0)
    // and the inputs were NOT touched
    for (const a of result.assignments) {
      if (a.candidateIndex != null) expect(a.deltaE).toBeLessThan(0.001)
    }
  })

  it('primary pops against the background (non-text 3:1) at working fidelity', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#c9c2ee']), fidelity: 0.4 })
    for (const mode of [result.light, result.dark]) {
      const pop = mode.report.find((r) => r.token === 'primary' && r.background === 'background')!
      expect(pop.pass, `${pop.fg} on ${pop.bg}`).toBe(true)
    }
  })

  it('at fidelity 1 a pinned bright yellow stays yellow; the failed pop is disclosed, not forced', () => {
    const candidates = candidatesFromList(['#e4f402', '#457b9d'])
    candidates[0].pin = 'primary'
    const result = generateTheme({ candidates, fidelity: 1 })
    const primary = parseColor(result.light.tokens.primary)!
    expect(deltaEok(primary, parseColor('#e4f402')!), 'primary must stay the user yellow').toBeLessThan(
      0.01,
    )
    const pop = result.light.report.find((r) => r.token === 'primary' && r.background === 'background')!
    expect(pop.pass, 'yellow cannot pop on near-white — report it').toBe(false)
  })
})

describe('extractCandidates', () => {
  // Synthetic "photo": a shading ramp of one olive object dominating the
  // frame, plus a smaller warm subject — the headshot failure in miniature.
  const photo = () => {
    const px: number[] = []
    const put = (rgb: [number, number, number], n: number) => {
      for (let i = 0; i < n; i++) px.push(rgb[0], rgb[1], rgb[2], 255)
    }
    put([21, 32, 2], 500) // dark green shadow mass
    put([41, 59, 5], 250) // dark green midtone
    put([96, 116, 46], 150) // the actual olive
    put([155, 109, 85], 80) // skin
    put([5, 2, 0], 120) // near-black
    return new Uint8ClampedArray(px)
  }

  it('keeps one candidate per hue neighborhood', () => {
    const out = extractCandidates(photo())
    const chromatic = out.filter((c) => c.color.c >= 0.05)
    for (let i = 0; i < chromatic.length; i++) {
      for (let j = i + 1; j < chromatic.length; j++) {
        expect(
          hueDistance(chromatic[i].color.h, chromatic[j].color.h),
          `${chromatic[i].raw} vs ${chromatic[j].raw}`,
        ).toBeGreaterThanOrEqual(25)
      }
    }
  })

  it('prefers the usable mid-tone over the dominant shadow mass', () => {
    const out = extractCandidates(photo())
    const greens = out.filter((c) => c.color.c >= 0.05 && hueDistance(c.color.h, 125) < 25)
    expect(greens).toHaveLength(1)
    expect(greens[0].color.l).toBeGreaterThan(0.4)
  })
})

describe('accent jobs: link, ring, accent-strong, chart-1', () => {
  const PASTEL = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff']
  // The pairs the app mockup actually renders: links (table, banner action,
  // outlined-button text) and the accent's non-text marks (ring, tab
  // indicator, button border).
  const ACCENT_PAIRS: Array<[string, string, number]> = [
    ['link', 'background', 4.5],
    ['link', 'card', 4.5],
    ['link', 'success-subtle', 4.5],
    ['ring', 'background', 3],
    ['ring', 'card', 3],
    ['accent-strong', 'background', 3],
    ['accent-strong', 'card', 3],
  ]

  const CASES: Array<[string, Parameters<typeof generateTheme>[0]]> = [
    ['pastel picnic', { candidates: candidatesFromList(PASTEL) }],
    ['dark ink & sky', { candidates: candidatesFromList(['#0f172a', '#38bdf8']) }],
    [
      'mono-ish ember',
      { candidates: candidatesFromList(['#1a1a1a', '#4d4d4d', '#9a9a9a', '#e8e8e8', '#ff5c1f']) },
    ],
    ['mono lock salmon', { candidates: candidatesFromList(['#fa8072']), monoBase: 0 }],
  ]

  for (const [name, opts] of CASES) {
    it(`report includes and passes the accent pairs — ${name}`, () => {
      const result = generateTheme(opts)
      for (const modeName of ['light', 'dark'] as const) {
        const mode = result[modeName]
        for (const [token, background, required] of ACCENT_PAIRS) {
          const row = mode.report.find((r) => r.token === token && r.background === background)
          expect(row, `${modeName}: ${token} on ${background} must be audited`).toBeTruthy()
          expect(row!.requiredWcag).toBe(required)
          expect(row!.pass, `${modeName}: ${token} on ${background} (${row!.fg} on ${row!.bg})`).toBe(
            true,
          )
        }
      }
    })
  }

  it('the accent ramp claims chart-1 when no leftover covers its hue', () => {
    const result = generateTheme({ candidates: candidatesFromList(PASTEL) })
    const accent = result.assignments.find((a) => a.role === 'accent')!
    for (const mode of [result.light, result.dark]) {
      const c1 = parseColor(mode.tokens['chart-1'])!
      expect(hueDistance(c1.h, accent.seed.h), 'chart-1 wears the accent hue').toBeLessThan(25)
    }
    // the actual chart candidates follow, shifted one slot down
    expect(result.chartCandidateIndexes.length).toBeGreaterThan(0)
  })

  it('dedupe: an accent-hued leftover keeps chart-1, the accent is not doubled', () => {
    // #5c88ad sits a few degrees from the accent #457b9d; fidelity 1 keeps
    // both verbatim so the proximity survives to the chart pass.
    const result = generateTheme({
      candidates: candidatesFromList(['#e63946', '#f1faee', '#457b9d', '#5c88ad']),
      fidelity: 1,
    })
    const accent = result.assignments.find((a) => a.role === 'accent')!
    const c1 = parseColor(result.light.tokens['chart-1'])!
    const c2 = parseColor(result.light.tokens['chart-2'])!
    expect(hueDistance(c1.h, accent.seed.h), 'the near-accent candidate leads').toBeLessThan(20)
    expect(hueDistance(c2.h, accent.seed.h), 'no second accent-hued series').toBeGreaterThan(20)
  })

  it('ring and the tab/button mark share the solved accent solid', () => {
    const result = generateTheme({ candidates: candidatesFromList(PASTEL) })
    for (const mode of [result.light, result.dark]) {
      expect(mode.tokens.ring).toBe(mode.tokens['accent-strong'])
      expect(mode.tokens['sidebar-ring']).toBe(mode.tokens.ring)
    }
  })

  it('under the achromatic mono lock the accent jobs stay gray but still pass', () => {
    const result = generateTheme({ candidates: candidatesFromList(['#565656']), monoBase: 0 })
    for (const mode of [result.light, result.dark]) {
      for (const token of ['link', 'accent-strong', 'ring']) {
        expect(parseColor(mode.tokens[token])!.c, token).toBeLessThan(0.01)
      }
      for (const [token, background] of ACCENT_PAIRS) {
        const row = mode.report.find((r) => r.token === token && r.background === background)!
        expect(row.pass, `${token} on ${background}`).toBe(true)
      }
    }
  })
})

describe('brand adapter', () => {
  it('resolves a paper/ink vocabulary with solved contrast', () => {
    const result = generateTheme({ candidates: candidatesFromList(PALETTE) })
    for (const mode of ['light', 'dark'] as const) {
      const b = resolveBrand(result, mode)
      expect(b.paper).toMatch(/^#/)
      expect(wcagRatio(b.ink, b.paper), 'ink on paper').toBeGreaterThanOrEqual(4.5)
      expect(wcagRatio(b.brandInk, b.brand), 'brandInk on brand').toBeGreaterThanOrEqual(4.5)
      expect(wcagRatio(b.brand, b.paper), 'brand pops off paper').toBeGreaterThanOrEqual(3)
      expect(wcagRatio(b.accentInk, b.accent), 'accentInk on accent').toBeGreaterThanOrEqual(4.5)
    }
  })
})
