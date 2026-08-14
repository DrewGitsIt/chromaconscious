import { describe, expect, it } from 'vitest'
import { ROLES, candidatesFromList, generateTheme } from './engine'
import { GLOSS, jobsForRole } from './roleCopy'
import type { Seat } from './roleCopy'

const SEATS: Seat[] = [...ROLES, 'chart']
const result = generateTheme({
  candidates: candidatesFromList(['#e63946', '#f1faee', '#457b9d']),
  fidelity: 0.5,
})

describe('role glosses', () => {
  it('every seat has one, and none of them names a token', () => {
    for (const seat of SEATS) {
      const g = GLOSS[seat]
      expect(g, seat).toBeTruthy()
      // a gloss that says "sets --primary" teaches nothing a beginner can use
      expect(g).not.toMatch(/--|token|css|variable/i)
      expect(g.length).toBeLessThan(140)
    }
  })
})

describe('jobsForRole', () => {
  it('gives every seat at least one real job', () => {
    for (const seat of SEATS) {
      expect(jobsForRole(result, 'light', seat).length, seat).toBeGreaterThan(0)
    }
  })

  it('names the jobs the engine actually assigns that role', () => {
    const primary = jobsForRole(result, 'light', 'primary')
    expect(primary).toContain('buttons')
    const neutral = jobsForRole(result, 'light', 'neutral')
    expect(neutral).toEqual(expect.arrayContaining(['backgrounds', 'text', 'borders']))
    const accent = jobsForRole(result, 'light', 'accent')
    expect(accent).toEqual(expect.arrayContaining(['links', 'focus ring']))
    expect(jobsForRole(result, 'light', 'danger')).toContain('danger alerts')
  })

  it('never gives two seats the same job', () => {
    const seen = new Map<string, Seat>()
    for (const seat of SEATS) {
      for (const job of jobsForRole(result, 'light', seat)) {
        expect(seen.has(job), `${job} claimed by both ${seen.get(job)} and ${seat}`).toBe(false)
        seen.set(job, seat)
      }
    }
  })

  it("accent can claim chart 1, and then chart doesn't also list it", () => {
    const accent = jobsForRole(result, 'light', 'accent')
    const chart = jobsForRole(result, 'light', 'chart')
    const overlap = accent.filter((j) => chart.includes(j))
    expect(overlap).toEqual([])
    // between them they still cover the whole series
    const all = [...accent, ...chart].filter((j) => j.startsWith('chart '))
    expect(new Set(all).size).toBe(5)
  })

  it('is derived, not canned — chart jobs track how many series exist', () => {
    const oneColor = generateTheme({ candidates: candidatesFromList(['#7832c3']), fidelity: 0.5 })
    const many = generateTheme({
      candidates: candidatesFromList(['#7832c3', '#e63946', '#457b9d', '#f4a261', '#2a9d8f']),
      fidelity: 0.5,
    })
    expect(jobsForRole(many, 'light', 'chart').length).toBeGreaterThanOrEqual(
      jobsForRole(oneColor, 'light', 'chart').length,
    )
  })
})
