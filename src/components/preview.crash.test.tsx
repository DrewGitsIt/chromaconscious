// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

afterEach(cleanup)
import { Preview } from './Preview'
import { candidatesFromList, effectVars, generateTheme } from '../engine'

// Base UI needs a few APIs jsdom lacks.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)
if (!window.matchMedia) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }))
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})

const light = generateTheme({
  candidates: candidatesFromList(['#e63946', '#f1faee', '#457b9d']),
}).light
const tokens = light.tokens
/** Serialized the same way `mockups.tsx` does — Preview requires them. */
const effects = effectVars(light.effects)

describe('Preview interactions', () => {
  it('renders and opens the Export dropdown without crashing', () => {
    render(<Preview tokens={tokens} uid="test" mode="light" effects={effects} />)
    const trigger = screen.getByText('Export')
    fireEvent.pointerDown(trigger)
    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)
    expect(document.body.textContent).toContain('Dashboard')
    expect(screen.getByText('PDF report')).toBeTruthy()
  })

  it('opens the New project dialog without crashing', () => {
    render(<Preview tokens={tokens} uid="test" mode="light" effects={effects} />)
    const trigger = screen.getByText('New project')
    fireEvent.pointerDown(trigger)
    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)
    expect(document.body.textContent).toContain('Dashboard')
  })
})
