// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

afterEach(cleanup)
import App from './App'

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

const stripColors = () =>
  [...document.querySelectorAll('.candidate-strip code')].map((el) => el.textContent)

/** Boot past the first-run hero by clicking a preset card. */
const bootCoastal = () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Coastal starter' }))
}

const openStartOver = () => fireEvent.click(screen.getByRole('button', { name: 'start over' }))

const presetLabel = () => document.querySelector('.startover-preset')?.textContent ?? null

const stubClipboard = () => {
  const write = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: write },
    configurable: true,
  })
  return write
}

describe('first run', () => {
  it('boots empty into the hero — three doors, no sidebar controls', () => {
    render(<App />)
    expect(document.querySelector('.start-hero')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pick a color' })).toBeTruthy()
    expect(screen.getByText(/drop an image here/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Neon arcade' })).toBeTruthy()
    expect(screen.getByText(/controls appear once you have colors/)).toBeTruthy()
    expect(document.querySelector('.candidate-strip')).toBeNull()
    expect(document.querySelector('.fid-slider')).toBeNull()
  })

  it('the hero yields to the working layout after the first colors', () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText(/or type/), {
      target: { value: '#101010 #ababab' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(stripColors()).toEqual(['#101010', '#ababab'])
    expect(document.querySelector('.start-hero')).toBeNull()
    expect(screen.getByPlaceholderText(/add a color/)).toBeTruthy()
    expect(document.querySelector('.preview-root')).toBeTruthy()
  })

  it('a hero preset card applies its palette and keeps its name by start over', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Neon arcade' }))
    expect(stripColors()).toContain('#f72585')
    expect(presetLabel()).toBe('Neon arcade')
    // editing the set clears the preset name
    fireEvent.click(screen.getAllByTitle('Remove')[0])
    expect(presetLabel()).toBeNull()
  })
})

describe('frames', () => {
  it('defaults to a single full-bleed frame with its own mockup select', () => {
    bootCoastal()
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(document.querySelector('.frame-indicator')).toBeNull()
    expect(screen.getByRole('button', { name: 'select A' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'duplicate' })).toBeTruthy()
    expect(document.querySelectorAll('.mockup-select')).toHaveLength(1)
  })

  it('the toolbar sun/moon toggle flips a frame between light and dark', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'switch A to dark' }))
    expect(screen.getByRole('button', { name: 'switch A to light' })).toBeTruthy()
  })

  it('duplicate creates frame B as an exact copy and selects it', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'duplicate' }))
    expect(document.querySelectorAll('.preview-root')).toHaveLength(2)
    expect(screen.getByText('B · light · editing')).toBeTruthy()
    expect(screen.getByText('A · light')).toBeTruthy()
    // duplicate actions become explicit copies
    expect(screen.getByRole('button', { name: 'copy → B' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'copy → A' })).toBeTruthy()
  })

  it('toolbar edits only touch the selected frame', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'duplicate' }))
    // B is selected; starting it over empty must not affect A
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: 'start empty' }))
    expect(document.querySelector('.start-hero')).toBeTruthy()
    expect(screen.getByText('A · light')).toBeTruthy()
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
  })

  it('copy → A overwrites frame A with frame B', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'duplicate' }))
    // diverge B, then copy it over A
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: 'from a preset ›' }))
    fireEvent.click(screen.getByRole('button', { name: 'Neon arcade' }))
    fireEvent.click(screen.getByRole('button', { name: 'copy → A' }))
    expect(screen.getByText('A · light · editing')).toBeTruthy()
    expect(presetLabel()).toBe('Neon arcade')
  })

  it('closing frame B returns to a single full-width frame', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'duplicate' }))
    fireEvent.click(screen.getByRole('button', { name: 'close B' }))
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(document.querySelector('.frame-indicator')).toBeNull()
    expect(screen.getByRole('button', { name: 'duplicate' })).toBeTruthy()
  })
})

describe('color input', () => {
  it('the hero picker commits a first color and the hero yields', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    const hexInput = document.querySelector('.picker-pop input') as HTMLInputElement
    fireEvent.change(hexInput, { target: { value: '405480' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    expect(stripColors()).toContain('#405480')
    expect(document.querySelector('.start-hero')).toBeNull()
  })

  it('a color picked in the add-row popover is added by the main Add button', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    const hexInput = document.querySelector('.picker-pop input') as HTMLInputElement
    fireEvent.change(hexInput, { target: { value: '405480' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(stripColors()).toContain('#405480')
  })

  it('a removed picker color can be re-added with the main Add button', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    fireEvent.change(document.querySelector('.picker-pop input')!, { target: { value: '405480' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(stripColors()).toContain('#405480')
    const idx = stripColors().indexOf('#405480')
    fireEvent.click(screen.getAllByTitle('Remove')[idx])
    expect(stripColors()).not.toContain('#405480')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(stripColors()).toContain('#405480')
  })

  it('the popover Add color button commits the picked color directly', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    const hexInput = document.querySelector('.picker-pop input') as HTMLInputElement
    fireEvent.change(hexInput, { target: { value: '18aa66' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    expect(stripColors()).toContain('#18aa66')
    // the color is in the list — a later Add must not re-add it
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(stripColors().filter((c) => c === '#18aa66')).toHaveLength(1)
  })

  it('the embedded swatch previews the color being typed', () => {
    bootCoastal()
    fireEvent.change(screen.getByPlaceholderText(/add a color/), {
      target: { value: '#22aa88' },
    })
    const swatch = document.querySelector('.add-row .swatch-btn') as HTMLElement
    expect(swatch.style.background).toBe('rgb(34, 170, 136)')
  })
})

describe('start over', () => {
  it('one menu holds the destructive verbs; start empty returns to the hero', () => {
    bootCoastal()
    openStartOver()
    expect(screen.getByRole('button', { name: 'from an image…' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'from a preset ›' })).toBeTruthy()
    expect(document.querySelector('.menu-cap')?.textContent).toContain(
      'replaces your current 5 colors',
    )
    fireEvent.click(screen.getByRole('button', { name: 'start empty' }))
    expect(document.querySelector('.start-hero')).toBeTruthy()
    expect(document.querySelector('.toast')?.textContent).toContain('cleared 5 colors')
  })

  it('undo restores the replaced set', () => {
    bootCoastal()
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: 'start empty' }))
    expect(stripColors()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'undo' }))
    expect(stripColors()).toContain('#e63946')
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('the preset page applies a palette and reports it in the toast', () => {
    bootCoastal()
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: 'from a preset ›' }))
    fireEvent.click(screen.getByRole('button', { name: 'Neon arcade' }))
    expect(stripColors()).toContain('#f72585')
    expect(presetLabel()).toBe('Neon arcade')
    expect(document.querySelector('.toast')?.textContent).toContain('started over with Neon arcade')
  })

  it('starting over releases the mono lock', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'lock the theme to one color' }))
    fireEvent.click(document.querySelectorAll('.candidate-strip li')[0])
    expect(document.querySelector('.badge-base')).toBeTruthy()
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: 'from a preset ›' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terracotta' }))
    expect(document.querySelector('.badge-base')).toBeNull()
  })
})

describe('window drop', () => {
  it('dragging files over a working session warns that it starts over', () => {
    bootCoastal()
    fireEvent.dragEnter(document.querySelector('.app')!, {
      dataTransfer: { types: ['Files'], files: [] },
    })
    const overlay = document.querySelector('.drop-overlay')!
    expect(overlay.textContent).toContain('drop to start over from this image')
    expect(overlay.textContent).toContain('replaces your current 5 colors')
    fireEvent.dragLeave(overlay)
    expect(document.querySelector('.drop-overlay')).toBeNull()
  })

  it('over an empty session the drop is a plain extract', () => {
    render(<App />)
    fireEvent.dragEnter(document.querySelector('.app')!, {
      dataTransfer: { types: ['Files'], files: [] },
    })
    expect(document.querySelector('.drop-overlay')?.textContent).toContain(
      'drop to extract colors',
    )
  })
})

describe('candidates', () => {
  it('drag-reordering moves the row — position is the only prominence', () => {
    bootCoastal()
    const before = stripColors()
    const items = document.querySelectorAll('.candidate-strip li')
    fireEvent.dragStart(items[1].querySelector('.drag-handle')!)
    fireEvent.dragOver(items[0])
    fireEvent.drop(items[0])
    const after = stripColors()
    expect(after[0]).toBe(before[1])
    expect(after[1]).toBe(before[0])
  })

  it('a drop target is highlighted while dragging over it', () => {
    bootCoastal()
    const items = document.querySelectorAll('.candidate-strip li')
    fireEvent.dragStart(items[1].querySelector('.drag-handle')!)
    fireEvent.dragOver(items[0])
    expect(items[0].className).toContain('drop-target')
    expect(items[1].className).toContain('dragging')
  })

  it('the role badge pins via its menu; auto-assign clears every pin', () => {
    bootCoastal()
    fireEvent.click(document.querySelectorAll('.badge-ctl')[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'pin to → accent' }))
    expect(document.querySelectorAll('.badge-pinned')).toHaveLength(1)
    expect(document.querySelectorAll('.badge-ctl')[0].textContent).toBe('accent')
    fireEvent.click(screen.getByRole('button', { name: '↺ auto-assign colors' }))
    expect(document.querySelectorAll('.badge-pinned')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '↺ auto-assign colors' })).toBeNull()
  })
})

describe('mono lock', () => {
  const padlock = () => screen.getByRole('button', { name: 'lock the theme to one color' })

  it('the padlock prompts a pick; picking a row locks its hue', () => {
    bootCoastal()
    fireEvent.click(padlock())
    expect(document.querySelector('.lock-cap.hint')?.textContent).toContain('click a color')
    const rows = document.querySelectorAll('.candidate-strip li')
    expect(rows[0].className).toContain('pickable')
    fireEvent.click(rows[1])
    expect(document.querySelectorAll('.candidate-strip li')[1].className).toContain('is-base')
    expect(document.querySelector('.badge-base')?.textContent).toContain('base')
    expect(screen.getByRole('button', { name: 'unlock mono' })).toBeTruthy()
    expect(document.querySelector('.lock-cap')?.textContent).toContain('invents no new hues')
    expect(document.querySelector('.fid-caption')?.textContent).toContain('mono')
  })

  it('esc cancels pick mode without locking', () => {
    bootCoastal()
    fireEvent.click(padlock())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.lock-cap.hint')).toBeNull()
    expect(document.querySelector('.badge-base')).toBeNull()
  })

  it('unlock parks the base; one click re-locks it', () => {
    bootCoastal()
    fireEvent.click(padlock())
    fireEvent.click(document.querySelectorAll('.candidate-strip li')[0])
    fireEvent.click(screen.getByRole('button', { name: 'unlock mono' }))
    expect(document.querySelector('.badge-base')).toBeNull()
    expect(document.querySelector('.lock-sw.parked')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /re-lock/ }))
    expect(document.querySelector('.badge-base')).toBeTruthy()
  })

  it('with a single candidate the padlock locks immediately', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    fireEvent.change(document.querySelector('.picker-pop input')!, { target: { value: 'fa8072' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    fireEvent.click(padlock())
    expect(document.querySelector('.badge-base')).toBeTruthy()
    expect(document.querySelector('.lock-cap.hint')).toBeNull()
  })

  it('removing the base clears the lock', () => {
    bootCoastal()
    fireEvent.click(padlock())
    fireEvent.click(document.querySelectorAll('.candidate-strip li')[0])
    expect(document.querySelector('.badge-base')).toBeTruthy()
    fireEvent.click(screen.getAllByTitle('Remove')[0])
    expect(document.querySelector('.badge-base')).toBeNull()
    expect(screen.getByRole('button', { name: 'lock the theme to one color' })).toBeTruthy()
  })

  it('the report marks synthesized roles as mono while locked', () => {
    bootCoastal()
    fireEvent.click(padlock())
    fireEvent.click(document.querySelectorAll('.candidate-strip li')[0])
    fireEvent.click(document.querySelector('.status-chip') as HTMLElement)
    expect(document.querySelector('.report')?.textContent).toContain('synthesized · mono')
  })
})

describe('mockups', () => {
  it('switching the mockup renders the brand board instead of the app preview', () => {
    bootCoastal()
    fireEvent.change(document.querySelector('.mockup-select')!, { target: { value: 'brand' } })
    expect(document.querySelector('.brand-board')).toBeTruthy()
    expect(document.querySelector('.preview-root')).toBeNull()
    expect(document.querySelector('.brand-board')?.textContent).toContain('Acme')
  })

  it('each frame keeps its own mockup, editable from its own row', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'duplicate' }))
    // two frame rows, two mockup selects; only B switches to the brand board
    const selects = document.querySelectorAll('.mockup-select')
    expect(selects).toHaveLength(2)
    fireEvent.change(selects[1], { target: { value: 'brand' } })
    expect(document.querySelectorAll('.brand-board')).toHaveLength(1)
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
  })
})

describe('fidelity', () => {
  it('shows a live caption explaining what the slider is doing', () => {
    bootCoastal()
    expect(document.querySelector('.fid-caption')?.textContent).toBeTruthy()
    fireEvent.change(document.querySelector('.fid-slider')!, { target: { value: '1' } })
    expect(document.querySelector('.fid-caption')?.textContent).toContain('colors kept exactly')
  })
})

describe('report', () => {
  it('the status chip opens the report drawer over the canvas', () => {
    bootCoastal()
    const chip = document.querySelector('.status-chip') as HTMLElement
    expect(chip.textContent).toMatch(/checks pass|issue/)
    fireEvent.click(chip)
    expect(document.querySelector('.report-drawer')).toBeTruthy()
    expect(screen.getByText('role assignments')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'close report' }))
    expect(document.querySelector('.report-drawer')).toBeNull()
  })
})

describe('export', () => {
  it('the split button copies the current format to the clipboard', async () => {
    const write = stubClipboard()
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: /Copy CSS variables/ }))
    await screen.findByText(/CSS variables copied ✓/)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toContain(':root')
    expect(write.mock.calls[0][0]).toContain('.dark')
  })

  it('the format menu copies immediately and is remembered by the button', async () => {
    const write = stubClipboard()
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'choose export format' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tailwind v4 CSS' }))
    await screen.findByText(/Tailwind v4 CSS copied ✓/)
    expect(write.mock.calls[0][0]).toContain('@theme inline')
    expect(screen.getByRole('button', { name: /Copy Tailwind v4 CSS/ })).toBeTruthy()
  })
})

describe('chip menu v2', () => {
  it('opens with why-lines derived from the casting report', () => {
    bootCoastal()
    fireEvent.click(document.querySelectorAll('.badge-ctl')[0] as HTMLElement)
    const lines = [...document.querySelectorAll('.role-menu .why-line')].map((el) => el.textContent)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toBe('leads: strongest claim at the top of your list')
  })

  it('pin options carry consequence subtitles computed from current casting', () => {
    bootCoastal()
    // #1d3557 (row 5) charts today; pinning it to accent would bench #457b9d
    fireEvent.click(document.querySelectorAll('.badge-ctl')[4] as HTMLElement)
    const accentItem = screen.getByRole('button', { name: 'pin to → accent' })
    expect(accentItem.querySelector('.pin-hint')?.textContent).toBe('benches #457b9d')
  })

  it('chart is pinnable; a sub-gate color discloses the chroma nudge', () => {
    bootCoastal()
    // #f1faee (row 2) is near-gray — under the 0.05 chart bar
    fireEvent.click(document.querySelectorAll('.badge-ctl')[1] as HTMLElement)
    const chartItem = screen.getByRole('button', { name: 'pin to → chart' })
    expect(chartItem.querySelector('.pin-hint')?.textContent).toContain(
      'nudges chroma up so the series stays visible',
    )
    fireEvent.click(chartItem)
    expect(document.querySelectorAll('.badge-ctl')[1].textContent).toBe('chart')
    expect(document.querySelectorAll('.badge-pinned')).toHaveLength(1)
    // reopening offers unpin
    fireEvent.click(document.querySelectorAll('.badge-ctl')[1] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'unpin' }))
    expect(document.querySelectorAll('.badge-pinned')).toHaveLength(0)
  })
})

describe('riff', () => {
  const riffChip = () => document.querySelector('.riff-chip')?.textContent ?? null

  it('riff walks the seed forward; back walks it home', () => {
    bootCoastal()
    expect(riffChip()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '⚄ riff' }))
    expect(riffChip()).toBe('riff 1')
    fireEvent.click(screen.getByRole('button', { name: '⚄ riff' }))
    expect(riffChip()).toBe('riff 2')
    fireEvent.click(screen.getByRole('button', { name: 'previous riff' }))
    expect(riffChip()).toBe('riff 1')
    // seed 0 is canonical: the chip and the back button both retire
    fireEvent.click(screen.getByRole('button', { name: 'previous riff' }))
    expect(riffChip()).toBeNull()
    expect(screen.queryByRole('button', { name: 'previous riff' })).toBeNull()
  })

  it('start over resets the riff walk', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: '⚄ riff' }))
    expect(riffChip()).toBe('riff 1')
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: 'from a preset ›' }))
    fireEvent.click(screen.getByRole('button', { name: 'Neon arcade' }))
    expect(riffChip()).toBeNull()
  })

  it('keep as your color pins the invented seed as a real candidate', () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText(/or type/), { target: { value: '#7c3aed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    // one user color: the other five roles are invented and keepable
    expect(document.querySelectorAll('.invented-item')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'keep danger as your color' }))
    expect(stripColors()).toHaveLength(2)
    expect(document.querySelectorAll('.badge-pinned')).toHaveLength(1)
    expect(document.querySelectorAll('.badge-ctl')[1].textContent).toBe('danger')
    // danger is now user-cast — no longer offered as invented
    expect(screen.queryByRole('button', { name: 'keep danger as your color' })).toBeNull()
    expect(document.querySelectorAll('.invented-item')).toHaveLength(4)
  })
})

describe('role-transfer toast', () => {
  it('an edit that moves a seat announces the transfer; undo restores', () => {
    bootCoastal()
    // pin #1d3557 to accent: it takes the seat from #457b9d — both colors
    // exist before and after, so the transfer is news
    fireEvent.click(document.querySelectorAll('.badge-ctl')[4] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'pin to → accent' }))
    expect(document.querySelector('.toast')?.textContent).toContain(
      '#1d3557 took accent from #457b9d',
    )
    fireEvent.click(screen.getByRole('button', { name: 'undo' }))
    expect(document.querySelectorAll('.badge-pinned')).toHaveLength(0)
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('a newly added color claiming a seat is not news', () => {
    bootCoastal()
    // #2563eb out-scores #457b9d for accent the moment it lands — but it did
    // not exist before the edit, so no toast fires
    fireEvent.change(screen.getByPlaceholderText(/add a color/), {
      target: { value: '#2563eb' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(stripColors()).toContain('#2563eb')
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('removing a color never announces — the leaver is gone from the after side', () => {
    bootCoastal()
    // removing accent-holder #457b9d reseats accent, but #457b9d is not
    // present after the edit, so the both-sides rule keeps it quiet
    const idx = stripColors().indexOf('#457b9d')
    fireEvent.click(screen.getAllByTitle('Remove')[idx])
    expect(document.querySelector('.toast')).toBeNull()
  })
})
