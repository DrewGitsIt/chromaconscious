// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

afterEach(cleanup)
import App from './App'
import { parseColor } from './engine'

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

// ---------------------------------------------------------------------------
// The board is the sidebar's spine: six labelled seats, a pooled chart tray and
// a collapsed bench. These helpers read it the way a user does — by seat.

const ROLE_SEATS = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning'] as const
type RoleSeat = (typeof ROLE_SEATS)[number]

const seat = (role: RoleSeat): HTMLElement =>
  document.querySelector(`.rb-slot[data-role="${role}"]`) as HTMLElement
const hexOf = (role: RoleSeat): string | null =>
  seat(role).querySelector('.rb-hex')?.textContent ?? null
const tagOf = (role: RoleSeat): string | null =>
  seat(role).querySelector('.rb-tag')?.textContent ?? null
/** Every seat as "hex tag", so a whole board is one assertion. */
const boardState = (): Record<string, string> =>
  Object.fromEntries(ROLE_SEATS.map((r) => [r, `${hexOf(r)} ${tagOf(r)}`]))
const seatHexes = (): (string | null)[] => ROLE_SEATS.map(hexOf)
const keepPins = (): RoleSeat[] => ROLE_SEATS.filter((r) => seat(r).querySelector('.rb-keep'))

const benchBar = (): HTMLElement => document.querySelector('.bench-bar') as HTMLElement
const benchHexes = (): (string | null)[] =>
  [...document.querySelectorAll('.benched .bench-hex')].map((e) => e.textContent)

const openAssign = (role: RoleSeat) =>
  fireEvent.click(seat(role).querySelector('.rb-body') as HTMLElement)
const openTip = (role: RoleSeat) =>
  fireEvent.click(seat(role).querySelector('.rb-name') as HTMLElement)
const keep = (role: RoleSeat) =>
  fireEvent.click(seat(role).querySelector('.rb-keep') as HTMLElement)

/** Assign-popover rows, excluding the "free this seat" row below the list. */
const assignOptions = (): { hex: string | null; hint: string | null }[] =>
  [...document.querySelectorAll('.rp-asg-list .rp-opt')].map((o) => ({
    hex: o.querySelector('.rp-opt-name')?.textContent ?? null,
    hint: o.querySelector('.rp-opt-hint')?.textContent ?? null,
  }))
const pickOption = (hex: string) => {
  const row = [...document.querySelectorAll('.rp-asg-list .rp-opt')].find(
    (o) => o.querySelector('.rp-opt-name')?.textContent === hex,
  )
  fireEvent.click(row as HTMLElement)
}
const freeHint = (): string | null =>
  document.querySelector('.rp-free .rp-opt-hint')?.textContent ?? null
const freeSeat = () => fireEvent.click(document.querySelector('.rp-free') as HTMLElement)

// Section tools live in `.sec-act` and are addressed by their titles.
const riffBtn = (): HTMLButtonElement =>
  document.querySelector(
    '.sec-act .mini[title*="re-roll"], .sec-act .mini[title*="nothing to riff"]',
  ) as HTMLButtonElement
/** The mono padlock, whichever of its two titles it is wearing. */
const monoBtn = (): HTMLButtonElement =>
  document.querySelector('.sec-act .mini[title*="lock the theme"], .sec-act .mini[title*="unlock"]') as HTMLButtonElement
const openStartOver = () => fireEvent.click(screen.getByTitle('start over'))

/** Which preset the current set still belongs to — the menu marks it `sel`. */
const selectedPreset = (): string | null => {
  openStartOver()
  fireEvent.click(screen.getByRole('button', { name: /from a preset/ }))
  const name = document.querySelector('.preset-item.sel')?.textContent?.trim() ?? null
  openStartOver() // toggle the menu shut again
  return name
}

/** Boot past the first-run hero by clicking a preset card. */
const bootCoastal = () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Coastal starter' }))
}
/** Boot with a single user color, so five seats are the smith's. */
const bootOneColor = (hex = '#7c3aed') => {
  render(<App />)
  fireEvent.change(screen.getByPlaceholderText(/or type/), { target: { value: hex } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}
const addColors = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText(/add a color/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

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
    expect(document.querySelector('.sidebar-shell')).toBeTruthy()
    expect(document.querySelector('.role-board')).toBeNull()
    expect(document.querySelector('.dial')).toBeNull()
  })

  it('the hero yields to the working layout after the first colors', () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText(/or type/), {
      target: { value: '#101010 #ababab' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(document.querySelector('.start-hero')).toBeNull()
    expect(document.querySelector('.role-board')).toBeTruthy()
    expect(seatHexes()).toContain('#101010')
    expect(seatHexes()).toContain('#ababab')
    expect(screen.getByPlaceholderText(/add a color/)).toBeTruthy()
    expect(document.querySelector('.preview-root')).toBeTruthy()
    expect([...document.querySelectorAll('.sec .sec-label')].map((e) => e.textContent)).toEqual([
      'canvas',
      'colors',
      'tuning',
    ])
  })

  it('a hero preset card applies its palette and keeps its name until you edit', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Neon arcade' }))
    expect(seatHexes()).toContain('#f72585')
    expect(selectedPreset()).toBe('Neon arcade')
    // editing the set clears the preset name
    addColors('#18aa66')
    expect(selectedPreset()).toBeNull()
  })
})

describe('frames', () => {
  it('defaults to a single full-bleed frame with its own mockup select', () => {
    bootCoastal()
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(document.querySelector('.frame-indicator')).toBeNull()
    expect(screen.getByLabelText('edit frame A')).toBeTruthy()
    expect(screen.getByTitle('compare two frames')).toBeTruthy()
    expect(document.querySelectorAll('.frame-mockup')).toHaveLength(1)
  })

  it('the frame card sun/moon toggle flips a frame between light and dark', () => {
    bootCoastal()
    fireEvent.click(screen.getByLabelText('switch frame A to dark'))
    expect(screen.getByLabelText('switch frame A to light')).toBeTruthy()
  })

  it('compare creates frame B as an exact copy and selects it', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    expect(document.querySelectorAll('.preview-root')).toHaveLength(2)
    expect(screen.getByText('B · light · editing')).toBeTruthy()
    expect(screen.getByText('A · light')).toBeTruthy()
    // with a sibling, each card can copy itself over the other
    expect(screen.getByLabelText('copy frame A over frame B')).toBeTruthy()
    expect(screen.getByLabelText('copy frame B over frame A')).toBeTruthy()
  })

  it('sidebar edits only touch the selected frame', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    // B is selected; starting it over empty must not affect A
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: /start empty/ }))
    expect(document.querySelectorAll('.start-hero')).toHaveLength(1)
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(screen.getByText('A · light')).toBeTruthy()
    // the empty frame has no board or dial to show
    expect(document.querySelector('.role-board')).toBeNull()
  })

  it('copy B over A overwrites frame A', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    // diverge B, then copy it over A
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: /from a preset/ }))
    fireEvent.click(screen.getByRole('button', { name: /Neon arcade/ }))
    fireEvent.click(screen.getByLabelText('copy frame B over frame A'))
    expect(screen.getByText('A · light · editing')).toBeTruthy()
    expect(hexOf('primary')).toBe('#f72585')
    expect(selectedPreset()).toBe('Neon arcade')
  })

  it('closing frame B returns to a single full-width frame', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    fireEvent.click(screen.getByTitle('close frame B'))
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(document.querySelector('.frame-indicator')).toBeNull()
    expect(screen.getByTitle('compare two frames')).toBeTruthy()
  })
})

describe('the role board', () => {
  it('renders every role as a seat, and every seat is filled', () => {
    bootOneColor()
    const slots = [...document.querySelectorAll('.rb-slot')]
    expect(slots.map((s) => s.getAttribute('data-role'))).toEqual([...ROLE_SEATS])
    // one purple cannot fill six seats — the smith fills the rest, so there is
    // no such thing as an empty seat once colors exist
    for (const role of ROLE_SEATS) expect(hexOf(role)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('shows provenance on every seat: your color reads yours, the smith derived reads derived', () => {
    bootOneColor()
    expect(boardState().primary).toBe('#7c3aed yours')
    expect(tagOf('danger')).toBe('derived')
    expect(ROLE_SEATS.filter((r) => tagOf(r) === 'derived').length).toBe(5)
  })

  it('the keep pin appears only on derived seats', () => {
    bootCoastal()
    expect(ROLE_SEATS.filter((r) => tagOf(r) === 'yours')).toEqual(['primary', 'accent', 'neutral'])
    expect(keepPins()).toEqual(['danger', 'success', 'warning'])
  })

  it('keeping a derived seat freezes it as kept — without changing its color', () => {
    bootCoastal()
    const before = hexOf('danger')
    keep('danger')
    expect(tagOf('danger')).toBe('kept')
    // keeping freezes; it does not re-pick
    expect(hexOf('danger')).toBe(before)
    // a kept seat is no longer offered a pin
    expect(seat('danger').querySelector('.rb-keep')).toBeNull()
    expect(keepPins()).toEqual(['success', 'warning'])
  })

  it('the seat label teaches what the role is for and what it is doing now', () => {
    bootCoastal()
    openTip('accent')
    expect(document.querySelector('.rp-tip')).toBeTruthy()
    expect(document.querySelector('.rp-tip-name')?.textContent).toBe('accent')
    expect(document.querySelector('.rp-tip-gloss')?.textContent).toContain('quiet second voice')
    const jobs = [...document.querySelectorAll('.rp-tip-job')].map((e) => e.textContent)
    expect(jobs.length).toBeGreaterThan(0)
    expect(jobs).toContain('links')
  })

  it('chart is a pooled series tray, not a seat', () => {
    bootCoastal()
    expect(document.querySelectorAll('.tray-set > *')).toHaveLength(5)
    // two coastal colors chart today; the rest of the series is the smith's
    expect(document.querySelector('.tray-cap')?.textContent).toBe('2 of 5')
    fireEvent.click(document.querySelector('.tray-name') as HTMLElement)
    expect(document.querySelector('.rp-tip-name')?.textContent).toBe('Chart series')
    expect(document.querySelector('.rp-tip-gloss')?.textContent).toContain('Data series')
    expect([...document.querySelectorAll('.rp-tip-job')].map((e) => e.textContent)).toContain(
      'chart 1',
    )
  })
})

describe('assigning a seat', () => {
  it('the popover lists your other colors with the consequence of each', () => {
    bootCoastal()
    openAssign('primary')
    expect(document.querySelector('.rp-asg-q')?.textContent).toBe('What fills primary?')
    const options = assignOptions()
    // every other color of yours is offered — including ones parked in the
    // chart tray, which used to be unreachable from this list
    expect(options.map((o) => o.hex)).toEqual(
      expect.arrayContaining(['#457b9d', '#f1faee']),
    )
    expect(options.every((o) => (o.hint ?? '').length > 0)).toBe(true)
    expect(options[0].hint).toContain('benches #e63946')
    // every option names a hex that is really one of your candidates, not a
    // chart-adjusted token value
    const mine = new Set(['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557'])
    expect(options.every((o) => o.hex != null && mine.has(o.hex))).toBe(true)
  })

  it('a hint never names the color the same pick is about to bench', () => {
    // pinConsequence predicted from the current casting and could name the
    // displaced holder as the successor; the hint is a probe now, so the
    // contradiction is unrepresentable.
    bootCoastal()
    openAssign('primary')
    for (const o of assignOptions()) {
      const benched = /benches (#[0-9a-f]{6})/.exec(o.hint ?? '')?.[1]
      const successor = /frees \w+ for (#[0-9a-f]{6})/.exec(o.hint ?? '')?.[1]
      if (benched && successor) expect(successor).not.toBe(benched)
    }
  })

  it('picking a color seats it and benches the one it displaced', () => {
    bootCoastal()
    openAssign('primary')
    pickOption('#457b9d')
    expect(boardState().primary).toBe('#457b9d yours')
    expect(document.querySelector('.rp-asg')).toBeNull()
    expect(benchBar().textContent).toContain('1 color not in play')
    expect(benchHexes()).toEqual(['#e63946'])
  })

  it('free this seat names the color that would take over — and it does', () => {
    bootCoastal()
    openAssign('accent')
    // #1d3557 charts today but is the runner-up for accent, so freeing the
    // seat hands it over rather than inventing anything
    expect(freeHint()).toBe('#1d3557 takes over')
    freeSeat()
    expect(boardState().accent).toBe('#1d3557 yours')
    expect(benchHexes()).toEqual(['#457b9d'])
  })

  it('only when nothing of yours can step in does it promise the smith', () => {
    bootOneColor()
    openAssign('primary')
    // one color, and it is in this seat: there is no successor
    expect(assignOptions()).toHaveLength(0)
    expect(document.querySelector('.rp-asg-empty')?.textContent).toContain(
      'no other colors of yours to put here',
    )
    expect(freeHint()).toBe('the smith derives it')
    freeSeat()
    expect(tagOf('primary')).toBe('derived')
    expect(benchHexes()).toEqual(['#7c3aed'])
  })

  it('a seat freed with a spare color of yours is not promised to the smith', () => {
    bootCoastal()
    // #18aa66 lands in success; coastal has nothing left to fill it after
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    fireEvent.change(document.querySelector('.picker-pop input') as HTMLInputElement, {
      target: { value: '18aa66' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    expect(boardState().success).toBe('#18aa66 yours')
    openAssign('success')
    expect(freeHint()).toBe('the smith derives it')
    // whereas primary, with spares around, names its successor
    fireEvent.keyDown(document, { key: 'Escape' })
    openAssign('primary')
    expect(freeHint()).toMatch(/^#[0-9a-f]{6} takes over$/)
  })

  it.skip('drag-and-drop between seat, tray and bench — jsdom has no dataTransfer; covered in e2e', () => {})

  it.skip('dragging a seat to the bench parks its color — same reason; covered in e2e', () => {})
})

describe('riff', () => {
  it('re-rolls the derived seats and leaves yours and kept untouched', () => {
    bootCoastal()
    keep('danger')
    const before = boardState()
    expect(before.danger).toContain('kept')
    fireEvent.click(riffBtn())
    const after = boardState()
    // riff never touches a color you own
    expect(after.primary).toBe(before.primary)
    expect(after.accent).toBe(before.accent)
    expect(after.neutral).toBe(before.neutral)
    expect(after.danger).toBe(before.danger)
    // and it does move the ones the smith computed
    expect(after.success).not.toBe(before.success)
    expect(after.warning).not.toBe(before.warning)
    expect(tagOf('success')).toBe('derived')
    expect(tagOf('warning')).toBe('derived')
  })

  it('walks the seed forward, and back walks it home', () => {
    bootCoastal()
    const canonical = boardState()
    expect(riffBtn().textContent).toBe('')
    expect(screen.queryByTitle('back one riff')).toBeNull()
    fireEvent.click(riffBtn())
    expect(riffBtn().textContent).toBe('1')
    fireEvent.click(riffBtn())
    expect(riffBtn().textContent).toBe('2')
    fireEvent.click(screen.getByTitle('back one riff'))
    expect(riffBtn().textContent).toBe('1')
    // seed 0 is canonical: the count and the back button both retire
    fireEvent.click(screen.getByTitle('back one riff'))
    expect(riffBtn().textContent).toBe('')
    expect(screen.queryByTitle('back one riff')).toBeNull()
    expect(boardState()).toEqual(canonical)
  })

  it('start over resets the riff walk', () => {
    bootCoastal()
    fireEvent.click(riffBtn())
    expect(riffBtn().textContent).toBe('1')
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: /from a preset/ }))
    fireEvent.click(screen.getByRole('button', { name: /Neon arcade/ }))
    expect(riffBtn().textContent).toBe('')
    expect(screen.queryByTitle('back one riff')).toBeNull()
  })

  it('is disabled once every seat is yours or kept — there is nothing left to roll', () => {
    bootCoastal()
    expect(riffBtn().disabled).toBe(false)
    // freeze the three derived seats…
    for (const role of ['danger', 'success', 'warning'] as const) keep(role)
    // …and give the chart series enough of your colors to fill itself
    addColors('#123456 #abcdef #ff00aa #00ffaa #aa00ff #55aa22 #2288cc')
    expect(ROLE_SEATS.map(tagOf).every((t) => t === 'yours' || t === 'kept')).toBe(true)
    expect(document.querySelector('.tray-cap')?.textContent).toBe('5 of 5')
    expect(riffBtn().disabled).toBe(true)
    expect(riffBtn().title).toBe('nothing to riff — every seat is yours')
  })
})

describe('placements', () => {
  it('reset appears only once you have placed something, and restores the smith casting', () => {
    bootCoastal()
    const canonical = boardState()
    expect(screen.queryByTitle(/clear your placements/)).toBeNull()
    openAssign('primary')
    pickOption('#457b9d')
    expect(boardState()).not.toEqual(canonical)
    fireEvent.click(screen.getByTitle(/clear your placements/))
    expect(boardState()).toEqual(canonical)
    expect(benchBar().textContent).toContain('0 colors not in play')
    expect(screen.queryByTitle(/clear your placements/)).toBeNull()
  })
})

describe('the bench', () => {
  it('starts collapsed, counts what is parked, and opens on click', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Mono + ember' }))
    const bar = benchBar()
    expect(bar.textContent).toContain('bench · 3 colors not in play')
    expect(bar.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.bench-drawer')?.getAttribute('aria-hidden')).toBe('true')
    // the collapsed bar still shows what is down there
    expect(document.querySelectorAll('.bench-dots i')).toHaveLength(3)
    fireEvent.click(bar)
    expect(bar.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.bench-drawer')?.getAttribute('aria-hidden')).toBe('false')
    expect(benchHexes()).toEqual(['#4d4d4d', '#9a9a9a', '#e8e8e8'])
  })

  it('says so plainly when nothing is parked', () => {
    bootCoastal()
    expect(benchBar().textContent).toContain('bench · 0 colors not in play')
    expect(document.querySelectorAll('.benched')).toHaveLength(0)
    expect(document.querySelector('.bench-empty')?.textContent).toContain(
      'every color you added is in play',
    )
  })
})

describe('color input', () => {
  it('the hero picker commits a first color and the hero yields', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    const hexInput = document.querySelector('.picker-pop input') as HTMLInputElement
    fireEvent.change(hexInput, { target: { value: '405480' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    expect(boardState().primary).toBe('#405480 yours')
    expect(document.querySelector('.start-hero')).toBeNull()
  })

  it('a color picked in the add-row popover is added by the main Add button', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    const hexInput = document.querySelector('.picker-pop input') as HTMLInputElement
    fireEvent.change(hexInput, { target: { value: '18aa66' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(boardState().success).toBe('#18aa66 yours')
  })

  it('the popover Add color button commits the picked color directly, once', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    const hexInput = document.querySelector('.picker-pop input') as HTMLInputElement
    fireEvent.change(hexInput, { target: { value: '18aa66' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    expect(boardState().success).toBe('#18aa66 yours')
    // the color is in the list — a later Add must not re-add it
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(seatHexes().filter((h) => h === '#18aa66')).toHaveLength(1)
    expect(benchHexes()).not.toContain('#18aa66')
  })

  it('a color removed from the bench can be re-added with the main Add button', () => {
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    fireEvent.change(document.querySelector('.picker-pop input') as HTMLInputElement, {
      target: { value: '18aa66' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    // free its seat to park it, then drop it from the bench entirely
    openAssign('success')
    freeSeat()
    expect(benchHexes()).toEqual(['#18aa66'])
    fireEvent.click(benchBar())
    fireEvent.click(screen.getByLabelText('remove #18aa66'))
    expect(benchHexes()).toEqual([])
    expect(seatHexes()).not.toContain('#18aa66')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(boardState().success).toBe('#18aa66 yours')
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
    expect(screen.getByRole('button', { name: /from an image/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /from a preset/ })).toBeTruthy()
    expect(document.querySelector('.menu-cap')?.textContent).toContain(
      'replaces your current 5 colors',
    )
    fireEvent.click(screen.getByRole('button', { name: /start empty/ }))
    expect(document.querySelector('.start-hero')).toBeTruthy()
    expect(document.querySelector('.role-board')).toBeNull()
    expect(document.querySelector('.toast')?.textContent).toContain('cleared 5 colors')
  })

  it('undo restores the replaced set', () => {
    bootCoastal()
    const before = boardState()
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: /start empty/ }))
    expect(document.querySelector('.role-board')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'undo' }))
    expect(boardState()).toEqual(before)
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('the preset page applies a palette and reports it in the toast', () => {
    bootCoastal()
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: /from a preset/ }))
    fireEvent.click(screen.getByRole('button', { name: /Neon arcade/ }))
    expect(hexOf('primary')).toBe('#f72585')
    expect(document.querySelector('.toast')?.textContent).toContain('started over with Neon arcade')
    expect(selectedPreset()).toBe('Neon arcade')
  })

  it('starting over releases the mono lock', () => {
    bootCoastal()
    fireEvent.click(monoBtn())
    openAssign('primary')
    expect(document.querySelector('.rb-anchor')).toBeTruthy()
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: /from a preset/ }))
    fireEvent.click(screen.getByRole('button', { name: /Terracotta/ }))
    expect(document.querySelector('.rb-anchor')).toBeNull()
    expect(monoBtn().textContent).toBe('mono')
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

describe('mono lock', () => {
  /** The seat currently wearing the anchor badge. */
  const anchoredRole = (): string | null =>
    document.querySelector('.rb-slot:has(.rb-anchor)')?.getAttribute('data-role') ?? null

  it('the padlock turns the board into the menu; clicking a seat locks its hue', async () => {
    bootCoastal()
    fireEvent.click(monoBtn())
    expect(document.querySelector('.pick-hint')?.textContent).toContain('click a seat to lock')
    openAssign('accent')
    // exactly one seat is the base, and the tool names it
    expect(document.querySelectorAll('.rb-anchor')).toHaveLength(1)
    expect(monoBtn().textContent).toBe(anchoredRole())
    expect(monoBtn().title).toContain('unlock')
    expect(document.querySelector('.pick-hint')).toBeNull()
    const slider = document.querySelector('.dial-slider') as HTMLInputElement
    expect(slider.getAttribute('aria-valuetext')).toContain('mono')
    await screen.findByText(/^mono/)
  })

  it('esc cancels pick mode without locking', () => {
    bootCoastal()
    fireEvent.click(monoBtn())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.pick-hint')).toBeNull()
    expect(document.querySelector('.rb-anchor')).toBeNull()
    expect(monoBtn().textContent).toBe('mono')
  })

  it('unlock parks the base; one click re-locks it', () => {
    bootCoastal()
    fireEvent.click(monoBtn())
    openAssign('primary')
    const base = anchoredRole()
    fireEvent.click(monoBtn())
    expect(document.querySelector('.rb-anchor')).toBeNull()
    expect(monoBtn().textContent).toBe('mono')
    fireEvent.click(monoBtn())
    expect(anchoredRole()).toBe(base)
  })

  it('with a single candidate the padlock locks immediately', () => {
    bootOneColor('#fa8072')
    fireEvent.click(monoBtn())
    expect(anchoredRole()).toBe('primary')
    expect(document.querySelector('.pick-hint')).toBeNull()
  })

  it('the report marks synthesized roles as mono while locked', () => {
    bootCoastal()
    fireEvent.click(monoBtn())
    openAssign('primary')
    fireEvent.click(document.querySelector('.status-chip') as HTMLElement)
    expect(document.querySelector('.report')?.textContent).toContain('synthesized · mono')
  })
})

describe('mockups', () => {
  it('switching the mockup renders the brand board instead of the app preview', () => {
    bootCoastal()
    fireEvent.change(screen.getByLabelText('mockup for frame A'), { target: { value: 'brand' } })
    expect(document.querySelector('.brand-board')).toBeTruthy()
    expect(document.querySelector('.preview-root')).toBeNull()
    expect(document.querySelector('.brand-board')?.textContent).toContain('Acme')
  })

  it('each frame keeps its own mockup, editable from its own card', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    expect(document.querySelectorAll('.frame-mockup')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('mockup for frame B'), { target: { value: 'brand' } })
    expect(document.querySelectorAll('.brand-board')).toHaveLength(1)
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
  })
})

describe('the dial', () => {
  it('shows a live caption explaining what the slider is doing', async () => {
    bootCoastal()
    expect(document.querySelector('.dial .dial-caption')?.textContent).toBeTruthy()
    const slider = document.querySelector('.dial .dial-slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '1' } })
    expect(document.querySelector('.dial-bubble')?.textContent).toBe('1.00')
    expect(slider.getAttribute('aria-valuetext')).toContain('colors kept exactly')
    // the caption cross-fades, so it lands a beat after the value
    await screen.findByText('colors kept exactly')
  })
})

const EMPTY_SHADOW = '0 0 #0000'

describe('separation', () => {
  type Sep = 'flat' | 'layered' | 'lifted'

  const segment = (s: Sep): HTMLButtonElement =>
    document.querySelector(`.sep-opt[data-sep="${s}"]`) as HTMLButtonElement
  /** Which setting is in force, read off the radio group rather than a class. */
  const inForce = (): string | null =>
    document.querySelector('.sep-opt[aria-checked="true"]')?.getAttribute('data-sep') ?? null
  const sentence = (): string => document.querySelector('.sep-caption')?.textContent ?? ''
  const group = (): HTMLElement => document.querySelector('.sep-seg') as HTMLElement

  /** A generated token, read back off the frame the engine actually painted. */
  const painted = (name: string, frameIndex = 0): string =>
    (document.querySelectorAll('.preview-root')[frameIndex] as HTMLElement).style
      .getPropertyValue(name)
      .trim()
  const L = (hex: string): number => parseColor(hex)!.l

  it('offers the three settings as one control, with layered in force', () => {
    bootCoastal()
    expect([...document.querySelectorAll('.sep-opt')].map((e) => e.getAttribute('data-sep'))).toEqual(
      ['flat', 'layered', 'lifted'],
    )
    expect(group().getAttribute('role')).toBe('radiogroup')
    expect(inForce()).toBe('layered')
    expect(sentence()).toMatch(/hairline and shadow sharing the work/)
    // an untouched frame is the engine's historical output
    expect(L(painted('--card'))).toBeLessThan(L(painted('--background')))
  })

  it('lifted re-solves the theme — the card ends up lighter than the page', () => {
    bootCoastal()
    const before = { card: painted('--card'), bg: painted('--background') }

    fireEvent.click(segment('lifted'))

    expect(inForce()).toBe('lifted')
    expect(painted('--card')).not.toBe(before.card)
    expect(painted('--background')).not.toBe(before.bg)
    // the inversion that makes the setting visible in light mode
    expect(L(painted('--card'))).toBeGreaterThan(L(painted('--background')))
    // the page is the half that receded
    expect(L(painted('--background'))).toBeLessThan(L(before.bg))
    expect(sentence()).toMatch(/the card floats above it/)
  })

  it('flat converges the surfaces and stops the resting shadow', () => {
    bootCoastal()
    expect(painted('--elevation-1')).not.toBe(EMPTY_SHADOW)

    fireEvent.click(segment('flat'))

    expect(Math.abs(L(painted('--card')) - L(painted('--background')))).toBeLessThan(0.005)
    // Separation is paid for in hairlines instead, so level 1 has no shadow —
    // spelled as a transparent layer rather than `none`, because `none` inside
    // a composed box-shadow list is invalid and would drop the ring with it.
    expect(painted('--elevation-1')).toBe(EMPTY_SHADOW)
    expect(sentence()).toMatch(/nothing casts a shadow at rest/)
  })

  it('arrow keys walk the axis and select as they go', () => {
    bootCoastal()
    fireEvent.keyDown(group(), { key: 'ArrowRight' })
    expect(inForce()).toBe('lifted')
    expect(segment('lifted').tabIndex).toBe(0)
    expect(segment('flat').tabIndex).toBe(-1)

    fireEvent.keyDown(group(), { key: 'ArrowLeft' })
    fireEvent.keyDown(group(), { key: 'ArrowLeft' })
    expect(inForce()).toBe('flat')

    fireEvent.keyDown(group(), { key: 'End' })
    expect(inForce()).toBe('lifted')
    fireEvent.keyDown(group(), { key: 'Home' })
    expect(inForce()).toBe('flat')
  })

  it('hovering a setting previews what it would do, without doing it', () => {
    bootCoastal()
    const card = painted('--card')

    fireEvent.mouseEnter(segment('flat'))
    expect(sentence()).toMatch(/card and page meet at one level/)
    expect(inForce()).toBe('layered')
    expect(painted('--card')).toBe(card)

    fireEvent.mouseLeave(group())
    expect(sentence()).toMatch(/hairline and shadow sharing the work/)
  })

  it('is per-frame: moving it in B leaves A where it was', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    const aCard = painted('--card', 0)

    fireEvent.click(segment('lifted'))

    expect(painted('--card', 0)).toBe(aCard)
    expect(painted('--card', 1)).not.toBe(aCard)
    expect(L(painted('--card', 1))).toBeGreaterThan(L(painted('--background', 1)))
    // and the sidebar follows the frame you select back to
    fireEvent.click(screen.getByLabelText('edit frame A'))
    expect(inForce()).toBe('layered')
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
    expect(document.querySelector('.export-row')).toBeTruthy()
    expect(document.querySelector('.export-main-label')?.textContent).toBe('Copy CSS variables')
    fireEvent.click(screen.getByRole('button', { name: /Copy CSS variables/ }))
    await screen.findByText(/CSS variables copied/)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toContain(':root')
    expect(write.mock.calls[0][0]).toContain('.dark')
  })

  it('the format menu copies immediately and is remembered by the button', async () => {
    const write = stubClipboard()
    bootCoastal()
    fireEvent.click(screen.getByRole('button', { name: 'choose export format' }))
    expect(document.querySelector('.export-menu')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /Tailwind v4 CSS/ }))
    await screen.findByText(/Tailwind v4 CSS copied/)
    expect(write.mock.calls[0][0]).toContain('@theme inline')
    expect(document.querySelector('.export-main-label')?.textContent).toContain(
      'Tailwind v4 CSS',
    )
  })
})
