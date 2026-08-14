import { describe, expect, it } from 'vitest'
import type { Separation } from './types'
import { candidatesFromList, generateTheme, parseColor } from './index'

/**
 * Separation moves the neutral ladder and the shadow scale together. The
 * guarantee that matters most is the zero point: `layered` must reproduce what
 * the engine emitted before this control existed, or every theme anyone has
 * already exported silently changes underneath them.
 */

const COASTAL = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557']
const build = (separation?: Separation) =>
  generateTheme({ candidates: candidatesFromList(COASTAL), fidelity: 0.5, separation })

const L = (hex: string) => parseColor(hex)!.l

describe('separation — the zero point', () => {
  it('layered is the default, and is byte-identical to passing nothing', () => {
    const implicit = build()
    const explicit = build('layered')
    for (const mode of ['light', 'dark'] as const) {
      expect(explicit[mode].tokens, mode).toEqual(implicit[mode].tokens)
    }
    expect(explicit.separation).toBe('layered')
  })

  it('leaves every non-neutral ramp alone — there are no surfaces to separate', () => {
    const flat = build('flat')
    const lifted = build('lifted')
    const layered = build('layered')
    for (const mode of ['light', 'dark'] as const) {
      for (const role of ['primary', 'accent', 'danger', 'success', 'warning'] as const) {
        expect(flat[mode].ramps[role], `${mode}:${role}`).toEqual(layered[mode].ramps[role])
        expect(lifted[mode].ramps[role], `${mode}:${role}`).toEqual(layered[mode].ramps[role])
      }
    }
  })
})

describe('separation — what each setting actually does', () => {
  it('flat converges the card onto the page; lifted floats it above', () => {
    const flat = build('flat').light.tokens
    const layered = build('layered').light.tokens
    const lifted = build('lifted').light.tokens

    // flat: the two surfaces meet, so lightness carries no separation at all
    expect(Math.abs(L(flat.card) - L(flat.background))).toBeLessThan(0.005)
    // layered: the engine's historical order — the card sits slightly under
    expect(L(layered.card)).toBeLessThan(L(layered.background))
    // lifted: inverted, the card is now LIGHTER than the page it rests on
    expect(L(lifted.card)).toBeGreaterThan(L(lifted.background))
  })

  it('trades hairline strength against shadow, in both directions', () => {
    const flat = build('flat')
    const lifted = build('lifted')
    // Light mode: a stronger hairline is a DARKER one...
    expect(L(flat.light.tokens.border)).toBeLessThan(L(lifted.light.tokens.border))
    // ...and in dark mode the sign flips, because contrast runs the other way.
    expect(L(flat.dark.tokens.border)).toBeGreaterThan(L(lifted.dark.tokens.border))
  })

  it('keeps light mode near-white rather than drifting to grey', () => {
    // The failure this pins: an early absolute-plan design produced a visibly
    // grey light mode. Every plan must stay in the near-white band.
    for (const s of ['flat', 'layered', 'lifted'] as const) {
      expect(L(build(s).light.tokens.background), s).toBeGreaterThan(0.93)
    }
  })
})

describe('elevation', () => {
  it('flat has no level-1 shadow — its separation is paid for in borders', () => {
    expect(build('flat').light.effects.elevation[1]).toEqual([])
    // but the higher levels still exist: a modal floats in every setting
    expect(build('flat').light.effects.elevation[3].length).toBeGreaterThan(0)
  })

  it('gets heavier from flat to layered to lifted', () => {
    const key = (s: Separation) => {
      const layers = build(s).light.effects.elevation[2]
      return Math.max(...layers.map((l) => l.alpha))
    }
    expect(key('flat')).toBeLessThan(key('layered'))
    expect(key('layered')).toBeLessThan(key('lifted'))
  })

  it('tints the shadow with the neutral hue instead of using black', () => {
    const layers = build('layered').light.effects.elevation[2]
    const shadow = parseColor(layers[0].color)!
    expect(shadow.c).toBeGreaterThan(0)
    const neutralSeed = build('layered').assignments.find((a) => a.role === 'neutral')!.seed
    expect(Math.abs(shadow.h - neutralSeed.h)).toBeLessThan(1)
  })

  it('dark mode elevates with a lit top edge, which light mode has no use for', () => {
    const dark = build('layered').dark.effects.elevation[2]
    const light = build('layered').light.effects.elevation[2]
    expect(dark.some((l) => l.inset)).toBe(true)
    expect(light.some((l) => l.inset)).toBe(false)
    // flat forgoes the highlight along with the shadow
    expect(build('flat').dark.effects.elevation[1]).toEqual([])
  })

  it('gives dark mode a heavier scrim — a light wash over near-black is invisible', () => {
    const t = build('layered')
    expect(t.dark.effects.scrim.alpha).toBeGreaterThan(t.light.effects.scrim.alpha)
    expect(parseColor(t.light.effects.scrim.color)).not.toBeNull()
  })
})
