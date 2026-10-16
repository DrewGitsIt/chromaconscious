import { describe, expect, it } from 'vitest'
import { apcaLc, candidatesFromList, generateTheme, wcagRatio } from './engine'
import { ART_INKS, BAND_INKS, BUDGET_MAP, photoStops, spendBudget } from './budget'

const theme = generateTheme({ candidates: candidatesFromList(['#606c38', '#fefae0', '#bc6c25']) })

describe('colour budget', () => {
  it('full spends the theme as it is', () => {
    expect(spendBudget(theme.light.tokens, 'full')).toBe(theme.light.tokens)
  })

  it('moves text pairs as pairs: every checked text pair lands on a checked pair, or clears that row floor', () => {
    for (const mode of ['light', 'dark'] as const) {
      const report = theme[mode].report
      // The report's text rows (its marks ask 3:1, its text 4.5:1 at standard).
      const t = theme[mode].tokens
      // The report's text rows (its marks ask 3:1, its text 4.5:1 at standard),
      // as colour values: a pair is checked if the report checks those colours.
      const rows = report.filter((p) => p.requiredWcag >= 4.5)
      const checked = new Set(rows.map((p) => `${t[p.token]}/${t[p.background]}`))
      for (const budget of ['brand', 'ink'] as const) {
        const map = BUDGET_MAP[budget]
        for (const { token: fg, background: bg, requiredWcag, requiredLc } of rows) {
          const [f, b] = [t[map[fg] ?? fg], t[map[bg] ?? bg]]
          const lands = `${f}/${b}`
          // Off the report's list (link on a status tint reads the ink), it
          // must still clear that row's own floor.
          const clears = wcagRatio(f, b) >= requiredWcag && (requiredLc == null || Math.abs(apcaLc(f, b)) >= requiredLc)
          const ok = checked.has(lands) || clears
          expect(ok, `${budget} ${mode}: ${fg}/${bg} → ${map[fg] ?? fg}/${map[bg] ?? bg}`).toBe(true)
        }
      }
    }
  })

  it('spends no colour the budget leaves out', () => {
    const { tokens, ancestry } = theme.light
    const roleOf = (t: string) => {
      const a = ancestry[t]
      return a == null ? null : a.kind === 'chart' ? 'chart' : a.role
    }
    for (const [budget, allowed] of [
      ['brand', ['neutral', 'primary']],
      ['ink', ['neutral']],
    ] as const) {
      const spent = spendBudget(tokens, budget)
      const map = BUDGET_MAP[budget]
      for (const t of Object.keys(tokens)) {
        const role = roleOf(t)
        if (role === 'primary' || role === 'accent' || role === 'chart') {
          const source = map[t] ?? t
          expect(allowed as readonly string[], `${budget}: ${t} reads ${source}`).toContain(roleOf(source))
          expect(spent[t]).toBe(tokens[source])
        }
      }
    }
  })
})

describe('photograph stops under a budget', () => {
  it('keep the stops full asks for', () => {
    expect(photoStops(['foreground', 'link', 'background'], 'full')).toEqual(['foreground', 'link', 'background'])
  })

  it('trade an accent tone for the primary under brand, and drop a stop that lands on its neighbour under ink', () => {
    expect(photoStops(['foreground', 'link', 'background'], 'brand')).toEqual(['foreground', 'primary', 'background'])
    expect(photoStops(['foreground', 'accent-strong', 'background'], 'brand')).toEqual([
      'foreground',
      'primary',
      'background',
    ])
    expect(photoStops(['foreground', 'primary', 'background'], 'ink')).toEqual(['foreground', 'background'])
    expect(photoStops(['foreground', 'link', 'secondary'], 'ink')).toEqual(['foreground', 'secondary'])
  })

  it('only ever name tokens the budget spends as they are', () => {
    const asked = [
      ['foreground', 'primary', 'background'],
      ['foreground', 'link', 'secondary'],
      ['primary', 'background'],
    ]
    for (const budget of ['full', 'brand', 'ink'] as const)
      for (const stops of asked)
        for (const s of photoStops(stops, budget)) expect(BUDGET_MAP[budget][s], `${budget}: ${s}`).toBeUndefined()
  })
})

describe('art inks', () => {
  it('are tokens the budget leaves alone, so distinct names stay distinct colours', () => {
    for (const budget of ['full', 'brand', 'ink'] as const) {
      for (const t of ART_INKS[budget]) expect(BUDGET_MAP[budget][t], `${budget}: ${t}`).toBeUndefined()
      const { ground, sun, bands } = BAND_INKS[budget]
      for (const t of [ground, sun, ...bands]) expect(BUDGET_MAP[budget][t], `${budget}: ${t}`).toBeUndefined()
      // neighbouring bands never share an ink, nor the sun with the top band
      for (const [a, b] of [[sun, bands[0]], ...bands.slice(1).map((b, i) => [bands[i], b])]) expect(a).not.toBe(b)
    }
  })
})
