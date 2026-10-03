import { describe, expect, it } from 'vitest'
import { railGeometry, railInvariantHolds } from './rail'

/** A small deterministic PRNG, so a failure names a reproducible case. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('rail geometry', () => {
  it('a tick lies inside the thumb exactly when its section top is in the viewport', () => {
    const rnd = lcg(7)
    for (let n = 0; n < 2000; n++) {
      const clientH = 200 + rnd() * 600
      const scrollH = clientH + rnd() * 1800
      const scrollTop = rnd() * (scrollH - clientH)
      const railH = 100 + rnd() * 700
      const count = 1 + Math.floor(rnd() * 4)
      const tops = Array.from({ length: count }, () => rnd() * scrollH).sort((a, b) => a - b)
      const input = { railH, scrollH, clientH, scrollTop, tops }
      expect(railInvariantHolds(input), JSON.stringify(input)).toBe(true)
    }
  })

  it('holds at the edges: a section top exactly on the fold, and at the very top', () => {
    const base = { railH: 400, scrollH: 1200, clientH: 500, scrollTop: 300 }
    for (const top of [0, 299.4, 300, 800, 800.4, 801, 1199]) {
      expect(railInvariantHolds({ ...base, tops: [top] }), `top ${top}`).toBe(true)
    }
  })

  it('tracks the scroll 1:1 — the thumb moves by scrollTop times the rail scale', () => {
    const g0 = railGeometry({ railH: 300, scrollH: 900, clientH: 300, scrollTop: 0, tops: [0] })
    const g1 = railGeometry({ railH: 300, scrollH: 900, clientH: 300, scrollTop: 90, tops: [0] })
    expect(g1.thumbTop - g0.thumbTop).toBeCloseTo(30)
    expect(g0.thumbH).toBeCloseTo(100)
  })

  it('"here" is the last section past the one-third line, and the last one at the bottom', () => {
    const tops = [0, 400, 900, 1300]
    const at = (scrollTop: number) =>
      railGeometry({ railH: 400, scrollH: 1500, clientH: 600, scrollTop, tops }).here
    expect(at(0)).toBe(0)
    expect(at(300)).toBe(1) // 400 <= 300 + 198
    expect(at(800)).toBe(2)
    expect(at(900)).toBe(3) // scrolled to the end
  })

  it('reports nothing to scroll, and nothing behind the footer, when it all fits', () => {
    const g = railGeometry({ railH: 400, scrollH: 500, clientH: 500, scrollTop: 0, tops: [0, 200] })
    expect(g.scrollable).toBe(false)
    expect(g.behind).toBe(false)
    expect(g.here).toBe(0)
  })
})
