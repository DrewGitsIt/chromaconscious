import { describe, expect, it } from 'vitest'
import type { TokenAncestor } from './types'
import { candidatesFromList, generateTheme, jobsSummary, parseColor, tokenAncestry } from './index'
import { brandAncestry, resolveBrand } from './adapters'
import { locateTokens, sameAncestor } from './locate'

// Locate mode's contract: every token classifies to an ancestor candidate (or
// null = synthesized), descendants render verbatim, everything else goes to a
// visual gray that keeps its lightness role.

const PICNIC = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff']

const picnic = () => generateTheme({ candidates: candidatesFromList(PICNIC) })

describe('token ancestry', () => {
  it('classifies every app token, both modes', () => {
    const result = picnic()
    for (const mode of ['light', 'dark'] as const) {
      const ancestry = tokenAncestry(result, mode)
      for (const token of Object.keys(result[mode].tokens)) {
        expect(ancestry, `${mode}:${token} missing from ancestry`).toHaveProperty(token)
      }
    }
  })

  it('maps the accent-claimed chart-1 to the accent candidate', () => {
    const result = picnic()
    const ancestry = tokenAncestry(result, 'light')
    const accentIndex = result.assignments.find((a) => a.role === 'accent')!.candidateIndex
    expect(ancestry['chart-1']).toBe(accentIndex)
    expect(ancestry['link']).toBe(accentIndex)
    expect(ancestry['ring']).toBe(accentIndex)
  })

  it('classifies every brand-board name', () => {
    const result = picnic()
    const ancestry = brandAncestry(result)
    for (const name of Object.keys(resolveBrand(result, 'light'))) {
      expect(ancestry, `brand:${name} missing from ancestry`).toHaveProperty(name)
    }
  })
})

describe('locateTokens', () => {
  const ACCENT: TokenAncestor = { kind: 'role', role: 'accent' }

  it('keeps descendants verbatim and mutes everything else to near-gray', () => {
    const result = picnic()
    const ancestry = result.light.ancestry
    const base = result.light.tokens
    const located = locateTokens(base, ancestry, ACCENT, base['background'])
    for (const [name, hex] of Object.entries(base)) {
      if (sameAncestor(ancestry[name], ACCENT)) {
        expect(located[name], `${name} should stay verbatim`).toBe(hex)
      } else {
        // hex round-trip adds ~0.001 chroma error over the 0.005 mute cap
        expect(parseColor(located[name])!.c, `${name} should be near-gray`).toBeLessThanOrEqual(0.01)
      }
    }
  })

  it('muting preserves the lightness role so layout stays readable', () => {
    const result = picnic()
    const base = result.light.tokens
    const located = locateTokens(base, result.light.ancestry, ACCENT, base['background'])
    // a dark text token stays dark, a light background stays light
    expect(parseColor(located['foreground'])!.l).toBeLessThan(0.45)
    expect(parseColor(located['card'])!.l).toBeGreaterThan(0.8)
  })

  /**
   * The reason locate is keyed on the ancestor rather than on a candidate.
   * One color in means every role but primary is synthesized — and a derived
   * neutral still owns the backgrounds, the text and the borders. Keying on
   * candidates made all of that unreachable, because there was no candidate
   * to key on.
   */
  it('locates a DERIVED seat — no candidate behind it, but plenty of tokens', () => {
    const solo = generateTheme({ candidates: candidatesFromList(['#7c3aed']) })
    const neutral = solo.assignments.find((a) => a.role === 'neutral')!
    expect(neutral.candidateIndex, 'neutral should be synthesized here').toBeNull()

    const base = solo.light.tokens
    const target: TokenAncestor = { kind: 'role', role: 'neutral' }
    const located = locateTokens(base, solo.light.ancestry, target, base['background'])

    const lit = Object.keys(base).filter((n) => located[n] === base[n])
    expect(lit).toEqual(expect.arrayContaining(['background', 'foreground', 'card', 'border']))
    expect(lit.length).toBeGreaterThan(10)
    // and the primary, which is NOT the neutral's, is muted
    expect(parseColor(located['primary'])!.c).toBeLessThanOrEqual(0.01)
  })

  it('locates one chart slot without lighting its neighbours', () => {
    const result = picnic()
    const base = result.light.tokens
    const slot: TokenAncestor = { kind: 'chart', slot: 0 }
    const located = locateTokens(base, result.light.ancestry, slot, base['background'])
    const litCharts = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'].filter(
      (n) => located[n] === base[n],
    )
    expect(litCharts.length).toBe(1)
  })
})

describe('jobsSummary', () => {
  it('names the accent jobs for the picnic accent', () => {
    const result = picnic()
    const ancestry = tokenAncestry(result, 'light')
    const accentIndex = result.assignments.find((a) => a.role === 'accent')!.candidateIndex!
    const line = jobsSummary(ancestry, accentIndex)
    expect(line).toContain('links')
    expect(line).toContain('focus ring')
    expect(line).toContain('chart 1')
  })

  it('is empty for a candidate with no descendants in the app tokens', () => {
    // murk's #030508 goes unused under current casting — no jobs to name
    const result = generateTheme({
      candidates: candidatesFromList(['#837c6f', '#030508', '#4e5c73', '#a2975c', '#a1e501']),
    })
    const unused = result.unusedCandidateIndexes[0]
    if (unused != null) {
      expect(jobsSummary(tokenAncestry(result, 'light'), unused)).toBe('')
    }
  })
})
