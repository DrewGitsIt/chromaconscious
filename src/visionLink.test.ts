import { describe, expect, it } from 'vitest'
import { parseThemeHash } from './visionLink'

const ID = 't_abcdefghijkl'

describe('parseThemeHash', () => {
  it('reads a bare theme id', () => {
    expect(parseThemeHash(`#${ID}`)).toEqual({ id: ID, vision: null, page: {} })
  })
  it('reads vision, defaulting to full strength', () => {
    expect(parseThemeHash(`#${ID}&vision=deutan`)).toEqual({
      id: ID,
      vision: { vision: 'deutan', strength: 1 },
      page: {},
    })
  })
  it('reads strength as a percent and clamps it to 10..100', () => {
    expect(parseThemeHash(`#${ID}&vision=protan&strength=60`)?.vision?.strength).toBe(0.6)
    expect(parseThemeHash(`#${ID}&vision=protan&strength=5`)?.vision?.strength).toBe(0.1)
    expect(parseThemeHash(`#${ID}&vision=protan&strength=900`)?.vision?.strength).toBe(1)
    expect(parseThemeHash(`#${ID}&vision=protan&strength=abc`)?.vision?.strength).toBe(1)
  })
  it('ignores an unknown vision and treats typical as none', () => {
    expect(parseThemeHash(`#${ID}&vision=mauve`)).toEqual({ id: ID, vision: null, page: {} })
    expect(parseThemeHash(`#${ID}&vision=typical`)).toEqual({ id: ID, vision: null, page: {} })
  })
  it('rejects anything that is not a theme id before the first &', () => {
    expect(parseThemeHash('#nope&vision=deutan')).toBeNull()
    expect(parseThemeHash('')).toBeNull()
  })

  it('reads the page settings beside the vision, or without one', () => {
    expect(parseThemeHash(`#${ID}&radius=4&font=tinos`)).toEqual({ id: ID, vision: null, page: { radius: 4, font: 'tinos' } })
    expect(parseThemeHash(`#${ID}&vision=deutan&strength=60&radius=0&font=jetbrains-mono`)).toEqual({
      id: ID,
      vision: { vision: 'deutan', strength: 0.6 },
      page: { radius: 0, font: 'jetbrains-mono' },
    })
  })
  it('drops an unknown font or an unreadable radius, and the theme still opens', () => {
    expect(parseThemeHash(`#${ID}&font=comic-sans`)).toEqual({ id: ID, vision: null, page: {} })
    expect(parseThemeHash(`#${ID}&radius=round`)).toEqual({ id: ID, vision: null, page: {} })
    expect(parseThemeHash(`#${ID}&radius=`)).toEqual({ id: ID, vision: null, page: {} })
    expect(parseThemeHash(`#${ID}&radius=6&font=nope`)?.page).toEqual({ radius: 6 })
    // a bad page value never costs the vision
    expect(parseThemeHash(`#${ID}&vision=tritan&font=nope`)?.vision?.vision).toBe('tritan')
  })
  it('clamps the radius onto the slider and rounds it to a whole px', () => {
    expect(parseThemeHash(`#${ID}&radius=-3`)?.page.radius).toBe(0)
    expect(parseThemeHash(`#${ID}&radius=99`)?.page.radius).toBe(20)
    expect(parseThemeHash(`#${ID}&radius=7.6`)?.page.radius).toBe(8)
  })

  it('reads a theme carried whole in the link, with the same params after it', () => {
    expect(parseThemeHash('#s=AQAB&vision=deutan&radius=4')).toEqual({
      state: 'AQAB',
      vision: { vision: 'deutan', strength: 1 },
      page: { radius: 4 },
    })
    expect(parseThemeHash('#s=')).toEqual({ state: '', vision: null, page: {} })
    expect(parseThemeHash('#x=AQAB')).toBeNull()
  })
})
