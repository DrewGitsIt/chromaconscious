import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE,
  PAGE_FONTS,
  RADIUS_DEFAULT,
  pageFontById,
  pageParams,
  pageVars,
  parsePageParams,
} from './pageSettings'

describe('page settings', () => {
  it('inject nothing at the defaults, so today\'s look holds to the pixel', () => {
    expect(pageVars(DEFAULT_PAGE)).toEqual({})
    expect(pageVars({ radius: RADIUS_DEFAULT, font: 'system' })).toEqual({})
  })
  it('set --radius in px once the slider moves', () => {
    expect(pageVars({ ...DEFAULT_PAGE, radius: 0 })).toEqual({ '--radius': '0px' })
    expect(pageVars({ ...DEFAULT_PAGE, radius: 20 })).toEqual({ '--radius': '20px' })
  })
  it('give body and headings one face, the heading a baked-in weight', () => {
    const v = pageVars({ ...DEFAULT_PAGE, font: 'tinos' })
    expect(v.fontFamily).toMatch(/^'Tinos'/)
    expect(v['--font-sans']).toBe(v.fontFamily)
    expect(v['--font-heading']).toBe(v.fontFamily)
    expect(v['--font-heading-weight']).toBe('700')
    expect(v.fontWeight).toBeUndefined()
    expect(pageVars({ ...DEFAULT_PAGE, font: 'arimo' }).fontWeight).toBe('500')
  })
  it('round-trip through the share-link suffix, which is empty at the defaults', () => {
    expect(pageParams(DEFAULT_PAGE)).toBe('')
    const page = { radius: 3, font: 'fraunces' }
    expect(pageParams(page)).toBe('&radius=3&font=fraunces')
    expect(parsePageParams(new URLSearchParams(pageParams(page).slice(1)))).toEqual(page)
  })
  it('list the approved seventeen, each with a licence or nothing to download', () => {
    expect(PAGE_FONTS.map((f) => f.name)).toEqual([
      'System UI', 'Geist', 'Inter', 'Arimo', 'IBM Plex Sans', 'Source Sans 3', 'Atkinson Hyperlegible',
      'Nunito', 'Outfit', 'Space Grotesk', 'Barlow Condensed', 'Tinos', 'Source Serif 4',
      'Playfair Display', 'Fraunces', 'Roboto Slab', 'JetBrains Mono',
    ])
    expect(new Set(PAGE_FONTS.map((f) => f.id)).size).toBe(PAGE_FONTS.length)
    for (const f of PAGE_FONTS) expect(f.licence !== null || f.id === 'system').toBe(true)
    expect(pageFontById('nope').id).toBe('system')
  })
})
