import { describe, expect, it } from 'vitest'
import type { Vision } from './cvd'
import { simulateHex, simulateLinear } from './cvd'

// Reference output from DaltonLens-Python 0.1.5 (Viénot 1999 for protan and
// deutan, Brettel 1997 for tritan, sRGB + Smith & Pokorny LMS model), which
// derives its matrices from the models rather than from our constants. Its
// uint8 encode truncates where ours rounds, so channels may differ by 1.

const INPUTS = ['#e63946', '#1d3557', '#a8dadc', '#2a9d8f', '#f4a261', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#808080', '#bf641f', '#958000', '#6485f9', '#837df4', '#158561', '#cdac00', '#ffffff', '#000000', '#7a1fa2', '#0b6e4f']

const REFERENCE: Record<string, string[]> = {
  'protan@1': ['#626247', '#323256', '#d5d5db', '#95958e', '#adad61', '#5c5c0e', '#f2f200', '#0000fe', '#fefe00', '#f2f2fe', '#5c5cfe', '#808080', '#727221', '#828201', '#8181f8', '#7d7df4', '#7e7e60', '#afaf02', '#fefefe', '#000000', '#3333a2', '#68684e'],
  'protan@0.5': ['#b45046', '#293356', '#c0d7db', '#70998e', '#d4a761', '#c44107', '#b2f800', '#0000fe', '#fefe00', '#b2f8fe', '#c441fe', '#808080', '#9e6b20', '#8c8100', '#7483f8', '#807df4', '#5c8160', '#bfae01', '#fefefe', '#000000', '#5e2aa2', '#4b6b4e'],
  'deutan@1': ['#8b8b3b', '#2f2f57', '#cdcddc', '#878790', '#bebe5c', '#929200', '#dbdb28', '#0000fe', '#fefe00', '#dbdbfe', '#9292fc', '#808080', '#86860f', '#868600', '#7c7cf9', '#7e7ef3', '#727262', '#b6b600', '#fefefe', '#000000', '#4848a1', '#5d5d50'],
  'deutan@0.5': ['#bf6b41', '#273257', '#bbd3dc', '#66928f', '#dbb15e', '#d26a00', '#a0ed1b', '#0000fe', '#fefe00', '#a0edfe', '#d26afd', '#808080', '#a67718', '#8d8300', '#7180f9', '#807df3', '#537c61', '#c2b100', '#fefefe', '#000000', '#6538a1', '#43664f'],
  'tritan@1': ['#e63459', '#113944', '#abd7e9', '#4097b1', '#f999a5', '#fe004e', '#7beafe', '#005f86', '#feeff2', '#49f8fe', '#ee6278', '#808080', '#c25c6a', '#9c777b', '#3797b2', '#6592a2', '#367d93', '#d6a0a6', '#fefefe', '#000000', '#694448', '#2a677a'],
  'tritan@0.5': ['#e63650', '#17374e', '#a9d8e3', '#369aa1', '#f69d88', '#fe0037', '#59f4c6', '#0044ce', '#fef7b1', '#33fbfe', '#f646ca', '#808080', '#c0604f', '#987b58', '#518ed9', '#7588d0', '#29817d', '#d1a678', '#fefefe', '#000000', '#72357f', '#1e6a67'],
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

describe('colorblind simulation', () => {
  it('matches DaltonLens within one 8-bit level', () => {
    for (const [key, expected] of Object.entries(REFERENCE)) {
      const [vision, strength] = key.split('@')
      INPUTS.forEach((hex, i) => {
        const got = channels(simulateHex(hex, vision as Vision, Number(strength)))
        const want = channels(expected[i])
        got.forEach((v, c) => expect(Math.abs(v - want[c]), `${key} ${hex}`).toBeLessThanOrEqual(1))
      })
    }
  })

  it('is the identity at strength 0 and for typical vision', () => {
    for (const hex of INPUTS) {
      expect(simulateHex(hex, 'typical')).toBe(hex)
      for (const v of ['protan', 'deutan', 'tritan'] as const) expect(simulateHex(hex, v, 0)).toBe(hex)
    }
  })

  it('leaves grays gray in every vision', () => {
    for (const v of ['protan', 'deutan', 'tritan'] as const) {
      for (const g of [0, 0.05, 0.2, 0.5, 1]) {
        simulateLinear([g, g, g], v).forEach((c) => expect(c).toBeCloseTo(g, 4))
      }
    }
  })
})
