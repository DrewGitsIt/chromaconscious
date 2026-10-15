// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { candidatesFromList, effectVars, generateTheme } from '../engine'
import { Magazine } from './Magazine'
import { gradientMap } from './gradientMap'

afterEach(cleanup)

const theme = generateTheme({ candidates: candidatesFromList(['#606c38', '#fefae0', '#bc6c25']) })
const channel = (hex: string, i: number) => Number((parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255).toFixed(4))

describe('magazine photographs', () => {
  it('map the grey ramp through the tokens themselves, stop for stop', () => {
    const t = theme.light.tokens
    const [r, g, b] = gradientMap(t, ['foreground', 'primary', 'background'])
    for (const [n, table] of [r, g, b].entries())
      expect(table).toBe(['foreground', 'primary', 'background'].map((k) => channel(t[k], n)).join(' '))
  })

  it('give the shadows the darker end in either mode, so dark never prints a negative', () => {
    for (const mode of ['light', 'dark'] as const) {
      const [r] = gradientMap(theme[mode].tokens, ['foreground', 'background'])
      const [lo, hi] = r.split(' ').map(Number)
      expect(lo, mode).toBeLessThan(hi)
    }
  })

  it('render every photograph through its own filter, ids carrying the frame', () => {
    const { container } = render(
      <Magazine tokens={theme.light.tokens} mode="light" uid="b" effects={effectVars(theme.light.effects)} />,
    )
    // jsdom drops `filter` from styles, so the image→filter wiring is the
    // e2e spec's to prove; here, the structure: one filter beside each image.
    const photos = Array.from(container.querySelectorAll('.mag-photo'))
    expect(photos).toHaveLength(6)
    const ids = photos.map((p) => {
      expect(p.querySelectorAll('img')).toHaveLength(1)
      const filters = p.querySelectorAll('filter')
      expect(filters).toHaveLength(1)
      return filters[0].id
    })
    for (const id of ids) expect(id.endsWith('-b')).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(container.querySelectorAll('.mag-spread')).toHaveLength(5)
  })
})
