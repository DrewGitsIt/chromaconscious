import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import {
  DEFAULT_PAGE,
  PAGE_FONTS,
  RADIUS_DEFAULT,
  pageFontById,
  pageVars,
  parsePageParams,
  themePage,
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
  it('export nothing at the defaults, and each part only once it moves', () => {
    expect(themePage(DEFAULT_PAGE)).toEqual({})
    expect(themePage({ ...DEFAULT_PAGE, radius: 0 })).toEqual({ radius: 0 })
    expect(themePage({ ...DEFAULT_PAGE, font: 'tinos' }).font).toEqual({
      name: 'Tinos',
      stack: pageFontById('tinos').stack,
      headingWeight: 700,
      pkg: '@fontsource/tinos',
    })
  })
  it('still read the parameters links carried before the state did', () => {
    expect(parsePageParams(new URLSearchParams('radius=3&font=fraunces'))).toEqual({ radius: 3, font: 'fraunces' })
  })
  it('list the approved seventeen, each with a licence or nothing to download', () => {
    expect(PAGE_FONTS.map((f) => f.name)).toEqual([
      'System UI', 'Geist', 'Inter', 'Arimo', 'IBM Plex Sans', 'Source Sans 3', 'Atkinson Hyperlegible',
      'Nunito', 'Outfit', 'Space Grotesk', 'Barlow Condensed', 'Tinos', 'Source Serif 4',
      'Playfair Display', 'Fraunces', 'Roboto Slab', 'JetBrains Mono',
    ])
    expect(new Set(PAGE_FONTS.map((f) => f.id)).size).toBe(PAGE_FONTS.length)
    for (const f of PAGE_FONTS) expect(f.licence !== null || f.id === 'system').toBe(true)
    // every face but the system stack names the package the export tells you to install
    for (const f of PAGE_FONTS) expect(f.pkg === null).toBe(f.id === 'system')
    // ...and it is the package the app itself loads the face from
    for (const f of PAGE_FONTS) if (f.pkg) expect(pkg.dependencies, f.id).toHaveProperty([f.pkg])
    expect(pageFontById('nope').id).toBe('system')
  })
})
