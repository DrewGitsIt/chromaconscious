import { describe, expect, it } from 'vitest'
import { candidatesFromList, generateTheme, jobsSummary, parseColor, tokenAncestry } from './index'
import { brandAncestry, resolveBrand } from './adapters'
import { locateTokens } from './locate'

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
  it('keeps descendants verbatim and mutes everything else to near-gray', () => {
    const result = picnic()
    const ancestry = tokenAncestry(result, 'light')
    const accentIndex = result.assignments.find((a) => a.role === 'accent')!.candidateIndex!
    const base = result.light.tokens
    const located = locateTokens(base, ancestry, accentIndex, base['background'])
    for (const [name, hex] of Object.entries(base)) {
      if (ancestry[name] === accentIndex) {
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
    const located = locateTokens(
      base,
      tokenAncestry(result, 'light'),
      result.assignments.find((a) => a.role === 'accent')!.candidateIndex!,
      base['background'],
    )
    // a dark text token stays dark, a light background stays light
    expect(parseColor(located['foreground'])!.l).toBeLessThan(0.45)
    expect(parseColor(located['card'])!.l).toBeGreaterThan(0.8)
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
