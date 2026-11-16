import { describe, expect, it } from 'vitest'
import { frontierIndex, readingLine, trace, type ScrollMetrics, type SectionState } from './tracer'

const m = (scrollTop: number, clientHeight = 400, scrollHeight = 1000): ScrollMetrics => ({
  scrollTop,
  clientHeight,
  scrollHeight,
})

describe('readingLine', () => {
  it('is a scrollbar: the content top at scrollTop 0, the bottom at the end, linear between', () => {
    expect(readingLine(m(0), null)).toBe(0)
    expect(readingLine(m(600), null)).toBe(1000)
    expect(readingLine(m(300), null)).toBe(500)
    expect(readingLine(m(150), null)).toBe(250)
  })

  it('is 0 when the pane does not scroll', () => {
    expect(readingLine(m(0, 400, 400), null)).toBe(0)
  })

  it('through an anchor: continuous at it, still exact at both ends, monotonic', () => {
    const anchor = { scrollTop: 200, tip: 700 }
    expect(readingLine(m(200), anchor)).toBe(700)
    expect(readingLine(m(0), anchor)).toBe(0)
    expect(readingLine(m(600), anchor)).toBe(1000)
    let prev = -1
    for (let st = 0; st <= 600; st += 10) {
      const y = readingLine(m(st), anchor)
      expect(y).toBeGreaterThanOrEqual(prev)
      prev = y
    }
  })

  /**
   * The recoil the mockup's v5 had on a real trackpad: at the end of a 252px
   * scroll the tip sat at the content's bottom; a section opened and
   * maxScroll grew to 790. The plain mapping put the same scrollTop ~320px
   * higher. Re-anchored, it stays put.
   */
  it('a height change does not move the tip once re-anchored', () => {
    const before = m(252, 470, 722)
    const tip = readingLine(before, null)
    const after = m(252, 470, 1260)
    expect(readingLine(after, null)).toBeLessThan(tip - 200) // the jump the anchor exists for
    expect(readingLine(after, { scrollTop: 252, tip })).toBeCloseTo(tip)
  })

  it('an anchor at scrollTop 0 holds the tip there until you scroll', () => {
    expect(readingLine(m(0), { scrollTop: 0, tip: 300 })).toBe(300)
    expect(readingLine(m(600), { scrollTop: 0, tip: 300 })).toBe(1000)
  })
})

describe('frontierIndex', () => {
  const s = (open: boolean, visited = open): SectionState => ({ open, visited })

  it('is the folded section after the last open one', () => {
    expect(frontierIndex([s(true), s(false), s(false)])).toBe(1)
    expect(frontierIndex([s(true), s(true), s(false)])).toBe(2)
  })

  it('a folded section above an open one is passed through, not targeted', () => {
    expect(frontierIndex([s(true), s(false, true), s(true)])).toBe(-1)
  })

  it('none once the next one has been reached, or nothing is open, or all are', () => {
    expect(frontierIndex([s(true), s(false, true), s(false)])).toBe(-1)
    expect(frontierIndex([s(false), s(false)])).toBe(-1)
    expect(frontierIndex([s(true), s(true)])).toBe(-1)
  })
})

describe('trace', () => {
  const base = {
    nodes: [12, 600, 640],
    ends: [570, 610, 650],
    focus: 0,
    anchor: null,
    push: 0,
  }

  it('scrolling alone stops at the end of the last open section; the push fills the gap', () => {
    const sections = [
      { open: true, visited: true },
      { open: false, visited: false },
      { open: false, visited: false },
    ]
    const end = trace({ ...base, sections, metrics: m(300, 400, 700) })
    expect(end.frontier).toBe(1)
    expect(end.tip).toBe(570)
    const half = trace({ ...base, sections, metrics: m(300, 400, 700), push: 0.5 })
    expect(half.tip).toBe(585)
    const full = trace({ ...base, sections, metrics: m(300, 400, 700), push: 1 })
    expect(full.tip).toBe(600)
    // touching the target is not "reaching" it: that is the unfold's job
    expect(full.reached).toEqual([0])
  })

  it('when nothing scrolls, the tip sits on the section last opened', () => {
    const sections = [
      { open: true, visited: true },
      { open: true, visited: true },
      { open: false, visited: false },
    ]
    const r = trace({ ...base, sections, metrics: m(0, 900, 700), focus: 1 })
    expect(r.tip).toBe(600)
    expect(r.here).toBe(1)
  })

  it('opening the last section runs the tip through a folded one above it', () => {
    const sections = [
      { open: true, visited: true },
      { open: false, visited: false },
      { open: true, visited: true },
    ]
    const r = trace({ ...base, sections, metrics: m(0, 900, 700), focus: 2 })
    expect(r.tip).toBe(640)
    expect(r.reached).toEqual([0, 1, 2])
    expect(r.here).toBe(2)
  })
})
