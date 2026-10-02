import { describe, expect, it } from 'vitest'
import { parseThemeHash } from './visionLink'

const ID = 't_abcdefghijkl'

describe('parseThemeHash', () => {
  it('reads a bare theme id', () => {
    expect(parseThemeHash(`#${ID}`)).toEqual({ id: ID, vision: null })
  })
  it('reads vision, defaulting to full strength', () => {
    expect(parseThemeHash(`#${ID}&vision=deutan`)).toEqual({
      id: ID,
      vision: { vision: 'deutan', strength: 1 },
    })
  })
  it('reads strength as a percent and clamps it to 10..100', () => {
    expect(parseThemeHash(`#${ID}&vision=protan&strength=60`)?.vision?.strength).toBe(0.6)
    expect(parseThemeHash(`#${ID}&vision=protan&strength=5`)?.vision?.strength).toBe(0.1)
    expect(parseThemeHash(`#${ID}&vision=protan&strength=900`)?.vision?.strength).toBe(1)
    expect(parseThemeHash(`#${ID}&vision=protan&strength=abc`)?.vision?.strength).toBe(1)
  })
  it('ignores an unknown vision and treats typical as none', () => {
    expect(parseThemeHash(`#${ID}&vision=mauve`)).toEqual({ id: ID, vision: null })
    expect(parseThemeHash(`#${ID}&vision=typical`)).toEqual({ id: ID, vision: null })
  })
  it('rejects anything that is not a theme id before the first &', () => {
    expect(parseThemeHash('#nope&vision=deutan')).toBeNull()
    expect(parseThemeHash('')).toBeNull()
  })
})
