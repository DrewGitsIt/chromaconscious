// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ColorAddField } from './ColorAddField'

afterEach(cleanup)

const PLACEHOLDER = 'add a color — #e63946, oklch(…)'

/** Render the sidebar arrangement and open its popover, the way a click does. */
function openInline(overrides: Partial<Parameters<typeof ColorAddField>[0]> = {}) {
  const onAdd = vi.fn()
  render(<ColorAddField placeholder={PLACEHOLDER} has={() => false} onAdd={onAdd} {...overrides} />)
  const trigger = screen.getByRole('button', { name: 'add a color' })
  if (!overrides.open) fireEvent.click(trigger)
  return {
    onAdd,
    trigger,
    field: () => screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement,
    message: () => document.querySelector('.pk-msg')!.textContent,
    add: () => document.querySelector('.pk-add') as HTMLButtonElement,
  }
}

describe('ColorAddField, inline', () => {
  it('is a + swatch until it is asked for, then a labelled dialog', () => {
    render(<ColorAddField placeholder={PLACEHOLDER} has={() => false} onAdd={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'add a color' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    // nothing else of the control is on screen while it is closed
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'add a color' })).toBeTruthy()
  })

  it('keeps the field multi-syntax: functional colours survive being typed together', () => {
    const { onAdd, field, add } = openInline()
    fireEvent.change(field(), { target: { value: 'oklch(0.7 0.12 250) rgb(91, 124, 250)' } })
    expect(add().textContent).toBe('add 2 colors')
    fireEvent.click(add())
    // handed on unparsed, so the seat keeps the syntax the user actually typed
    expect(onAdd).toHaveBeenCalledWith(['oklch(0.7 0.12 250)', 'rgb(91, 124, 250)'])
  })

  it('names what it could not read, and does not add on it', () => {
    const { onAdd, field, message, add } = openInline()
    fireEvent.change(field(), { target: { value: '#gg12' } })
    expect(message()).toContain('can’t read')
    expect(message()).toContain('#gg12')
    expect(add().disabled).toBe(true)
    fireEvent.click(add())
    expect(onAdd).not.toHaveBeenCalled()
    // and the typo is still there to be fixed — clearing it was the old bug
    expect(field().value).toBe('#gg12')
  })

  it('lets the readable half through and leaves the rest in the field', () => {
    const { onAdd, field, message, add } = openInline()
    fireEvent.change(field(), { target: { value: '#101010 wrong #ababab' } })
    expect(message()).toContain('wrong')
    fireEvent.click(add())
    expect(onAdd).toHaveBeenCalledWith(['#101010', '#ababab'])
    expect(field().value).toBe('wrong')
    // still open: there is a message worth reading
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('closes itself once the field comes out clean', () => {
    const { field, add } = openInline()
    fireEvent.change(field(), { target: { value: '#101010' } })
    fireEvent.click(add())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('refuses a colour that is already on the board rather than twinning it', () => {
    const { onAdd, field, message, add } = openInline({ has: (hex) => hex === '#18aa66' })
    fireEvent.change(field(), { target: { value: '#18aa66' } })
    expect(message()).toContain('already on the board')
    expect(add().disabled).toBe(true)
    expect(add().textContent).toBe('already added')
    fireEvent.click(add())
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('adds the picked colour when the field is empty', () => {
    const { onAdd, add } = openInline()
    expect(add().textContent).toBe('add #7aa2f7')
    fireEvent.click(add())
    expect(onAdd).toHaveBeenCalledWith(['#7aa2f7'])
  })

  it('closes on Escape and hands focus back to the swatch', () => {
    const { trigger, field } = openInline()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('opens from the outside when driven, and reports every close', () => {
    const onOpenChange = vi.fn()
    const { trigger } = openInline({ open: true, onOpenChange })
    // no click needed — a keyboard shortcut can put it up
    expect(screen.getByRole('dialog', { name: 'add a color' })).toBeTruthy()
    fireEvent.click(trigger)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // controlled: it stays up until the owner says otherwise
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })
})

describe('ColorAddField, hero', () => {
  it('stays the full first-run control — no + swatch to find', () => {
    const onAdd = vi.fn()
    render(
      <ColorAddField
        placeholder="or type — #e63946, oklch(…)"
        has={() => false}
        onAdd={onAdd}
        layout="hero"
      />,
    )
    expect(screen.queryByRole('button', { name: 'add a color' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pick a color' })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/or type/), { target: { value: '#101010' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith(['#101010'])
  })
})
