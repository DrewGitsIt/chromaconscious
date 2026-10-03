// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

afterEach(cleanup)
import App from './App'
import { parseColor } from './engine'
import { hueDistance } from './engine/color'
import { SHORTCUTS } from './shortcuts'

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
/**
 * A seat shows the SEED — the colour really in the theme — so it need not be
 * the string you typed. The input survives in the body tooltip as "from #…",
 * and these read a seat back by the colour it came from.
 */
const sourceOf = (role: RoleSeat): string | null =>
  /from (#[0-9a-f]{6})/.exec(seat(role).querySelector('.rb-body')?.getAttribute('title') ?? '')?.[1] ??
  null
const originOf = (role: RoleSeat): string | null => sourceOf(role) ?? hexOf(role)
const seatOrigins = (): (string | null)[] => ROLE_SEATS.map(originOf)

/** A frame read back off its label row, e.g. `B · dark · editing`: the mode
    from the toggle's label (it offers the OTHER mode), and whether it is the
    frame being edited from the pane letter's pressed state. */
const frameState = (label: 'A' | 'B'): string => {
  const mode = screen.queryByLabelText(`switch frame ${label} to light`) ? 'dark' : 'light'
  const editing =
    screen.getByLabelText(`edit frame ${label}`).getAttribute('aria-pressed') === 'true'
  return `${label} · ${mode}${editing ? ' · editing' : ''}`
}
/** Every seat as "hex tag", so a whole board is one assertion. */
const boardState = (): Record<string, string> =>
  Object.fromEntries(ROLE_SEATS.map((r) => [r, `${hexOf(r)} ${tagOf(r)}`]))
const seatHexes = (): (string | null)[] => ROLE_SEATS.map(hexOf)
/** Seats whose lock is the `keep` verb — i.e. the ones the engine still owns. */
const keepPins = (): RoleSeat[] => ROLE_SEATS.filter((r) => seat(r).querySelector('.rb-keep'))
/** The one control that decides what riff may move, read off every seat. */
const lockOf = (role: RoleSeat): string | null =>
  seat(role).querySelector('.rb-lock')?.getAttribute('data-locked') ?? null
const lockedSeats = (): RoleSeat[] => ROLE_SEATS.filter((r) => lockOf(r) === 'true')
const toggleLock = (role: RoleSeat) =>
  fireEvent.click(seat(role).querySelector('.rb-lock') as HTMLElement)
/** Chart swatches of yours carry the same control; derived fills have none. */
const seriesLocks = (): (string | null)[] =>
  [...document.querySelectorAll('.tray-set .series')].map(
    (s) => s.querySelector('.series-lock')?.getAttribute('data-locked') ?? null,
  )

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

// The palette's verbs live in `.ctl-row` under the section header and are
// addressed by their titles. Every title now carries its shortcut key on the
// end (`withKey`), so match on a prefix or a fragment, never the whole string.
// Anchor the riff match at the start: `back one riff` also contains the word.
const ctl = (sel: string): HTMLButtonElement =>
  document.querySelector(`.ctl-row ${sel}`) as HTMLButtonElement
const riffBtn = (): HTMLButtonElement =>
  ctl('.ctl[title^="riff"], .ctl[title^="nothing to riff"]')
const backBtn = (): HTMLButtonElement =>
  ctl('.ctl[title^="back one riff"], .ctl[title^="no hops"]')
const resetBtn = (): HTMLButtonElement =>
  ctl('.ctl[title^="clear your placements"], .ctl[title^="nothing to reset"]')
/** The mono control, whichever of its two titles it is wearing. */
const monoBtn = (): HTMLButtonElement =>
  ctl('.ctl[title*="lock the theme"], .ctl[title*="unlock"]')
/** The riff hop badge, or null before the first hop. */
const hop = (): string | null =>
  document.querySelector('.ctl-hop')?.textContent ?? null
/** `start over` is the one verb still in the header. */
const openStartOver = () =>
  fireEvent.click(document.querySelector('.sec-act .mini[title^="start over"]') as HTMLElement)

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
/** Boot with a single user color, so five seats are the engine's. */
const bootOneColor = (hex = '#7c3aed') => {
  render(<App />)
  fireEvent.change(screen.getByPlaceholderText(/or type/), { target: { value: hex } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}
/** Boot enough colors to fill all six seats AND all five chart slots. */
const bootFullBoard = () =>
  bootOneColor(
    '#e63946 #457b9d #f1faee #ef4444 #22c55e #eab308 #3b82f6 #a855f7 #14b8a6 #ec4899 #84cc16',
  )
/**
 * The sidebar's add control is a `+` that opens a picker popover — the field
 * and the commit button both live inside it, so every path opens it first.
 */
const openAdd = () => fireEvent.click(document.querySelector('.addsw') as HTMLElement)
const addField = () => screen.getByPlaceholderText(/add a color/) as HTMLInputElement
const addBtn = () => document.querySelector('.pk-add') as HTMLButtonElement
const addColors = (text: string) => {
  if (!document.querySelector('.pk-pop')) openAdd()
  fireEvent.change(addField(), { target: { value: text } })
  fireEvent.click(addBtn())
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
    expect(seatOrigins()).toContain('#101010')
    expect(seatOrigins()).toContain('#ababab')
    expect(document.querySelector('.addsw')).toBeTruthy()
    expect(document.querySelector('.preview-root')).toBeTruthy()
    // canvas controls live on the stage now, above each frame
    expect([...document.querySelectorAll('.sec .sec-label')].map((e) => e.textContent)).toEqual([
      'colors',
      'tuning',
    ])
  })

  it('a hero preset card applies its palette and keeps its name until you edit', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Neon arcade' }))
    expect(seatOrigins()).toContain('#f72585')
    expect(selectedPreset()).toBe('Neon arcade')
    // editing the set clears the preset name
    addColors('#18aa66')
    expect(selectedPreset()).toBeNull()
  })
})

describe('frames', () => {
  it('defaults to a single frame with its own mockup select', () => {
    bootCoastal()
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(document.querySelectorAll('.artboard')).toHaveLength(1)
    expect(screen.getByLabelText('edit frame A')).toBeTruthy()
    expect(screen.getByTitle('compare two frames')).toBeTruthy()
    expect(document.querySelectorAll('.frame-mockup')).toHaveLength(1)
  })

  it('the frame card sun/moon toggle flips a frame between light and dark', () => {
    // frames boot dark, so the first flip offers light
    bootCoastal()
    fireEvent.click(screen.getByLabelText('switch frame A to light'))
    expect(screen.getByLabelText('switch frame A to dark')).toBeTruthy()
  })

  it('compare creates frame B as an exact copy and selects it', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    expect(document.querySelectorAll('.preview-root')).toHaveLength(2)
    expect(frameState('B')).toBe('B · dark · editing')
    expect(frameState('A')).toBe('A · dark')
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
    expect(frameState('A')).toBe('A · dark')
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
    expect(frameState('A')).toBe('A · dark · editing')
    expect(originOf('primary')).toBe('#f72585')
    expect(selectedPreset()).toBe('Neon arcade')
  })

  it('closing frame B returns to a single full-width frame', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    // B's label row carries the close, captioned with the frame it closes
    fireEvent.click(screen.getByRole('button', { name: 'close B' }))
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(document.querySelectorAll('.artboard')).toHaveLength(1)
    expect(screen.getByTitle('compare two frames')).toBeTruthy()
  })

  it('each label row closes its own frame', () => {
    bootCoastal()
    fireEvent.click(screen.getByTitle('compare two frames'))
    // closing A promotes B into the single full-width slot
    fireEvent.click(screen.getByTitle('close frame A'))
    expect(document.querySelectorAll('.preview-root')).toHaveLength(1)
    expect(document.querySelectorAll('.artboard')).toHaveLength(1)
  })
})

describe('the role board', () => {
  it('renders every role as a seat, and every seat is filled', () => {
    bootOneColor()
    const slots = [...document.querySelectorAll('.rb-slot')]
    expect(slots.map((s) => s.getAttribute('data-role'))).toEqual([...ROLE_SEATS])
    // one purple cannot fill six seats — the engine fills the rest, so there is
    // no such thing as an empty seat once colors exist
    for (const role of ROLE_SEATS) expect(hexOf(role)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('shows provenance on every seat: your color reads yours, the engine derived reads derived', () => {
    bootOneColor()
    expect(tagOf('primary')).toBe('yours')
    expect(originOf('primary')).toBe('#7c3aed')
    expect(tagOf('danger')).toBe('derived')
    expect(ROLE_SEATS.filter((r) => tagOf(r) === 'derived').length).toBe(5)
  })

  it('a seat shows the colour in the theme, and names the one you typed', () => {
    // The chip sits beside the preview and must track it. Below fidelity 1 the
    // engine normalizes a user colour toward its role, so the two legitimately
    // differ — and after a riff hop they differ every time.
    bootOneColor()
    expect(hexOf('primary')).not.toBe('#7c3aed')
    expect(sourceOf('primary')).toBe('#7c3aed')
    expect(seat('primary').querySelector('.rb-body')?.getAttribute('title')).toContain(
      `${hexOf('primary')} — yours, from #7c3aed`,
    )
    // a derived seat had no input, so there is nothing to disclose
    expect(sourceOf('danger')).toBeNull()
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
    // …and freezing is now spelled with the lock, which is what keep was always for
    expect(lockOf('danger')).toBe('true')
    // a kept seat is no longer offered a pin — its lock is an ordinary one
    expect(seat('danger').querySelector('.rb-keep')).toBeNull()
    expect(seat('danger').querySelector('.rb-lock')).toBeTruthy()
    expect(keepPins()).toEqual(['success', 'warning'])
  })

  it('every seat carries a lock, and it starts open even on colours of yours', () => {
    // The whole rewrite in one assertion: a colour you supplied is riffable
    // until you say otherwise. Placing a colour is not a vow never to move it.
    bootCoastal()
    expect(ROLE_SEATS.map(lockOf)).toEqual(Array(6).fill('false'))
    expect(lockedSeats()).toEqual([])
    const lock = seat('primary').querySelector('.rb-lock') as HTMLElement
    expect(lock.getAttribute('title')).toBe('unlocked — riff may move this')

    toggleLock('primary')
    expect(lockedSeats()).toEqual(['primary'])
    expect(seat('primary').className).toContain('is-locked')
    expect(seat('primary').querySelector('.rb-lock')?.getAttribute('title')).toBe(
      'locked — riff will not move this',
    )
    // Unlocking is not a bench and not an unseat: the same colour of yours is
    // still in the same seat, it is simply riffable again. (Its rendered seed
    // may shift a little either way — a lock costs the repair pass its budget
    // here, so the pairwise minimums get paid for by someone else.)
    toggleLock('primary')
    expect(lockOf('primary')).toBe('false')
    expect(seat('primary').className).not.toContain('is-locked')
    expect(originOf('primary')).toBe('#e63946')
    expect(tagOf('primary')).toBe('yours')
    expect(benchHexes()).toEqual([])
  })

  it('a chart swatch of yours carries the same lock; a derived fill has none', () => {
    bootCoastal()
    // coastal charts two of your colors; the engine invents the other three
    expect(seriesLocks()).toEqual(['false', 'false', null, null, null])
    fireEvent.click(document.querySelector('.tray-set .series-lock') as HTMLElement)
    expect(seriesLocks()[0]).toBe('true')
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
    // two coastal colors chart today; the rest of the series is the engine's
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
    expect(originOf('primary')).toBe('#457b9d')
    expect(tagOf('primary')).toBe('yours')
    expect(document.querySelector('.rp-asg')).toBeNull()
    expect(benchBar().textContent).toContain('1 color not in play')
    expect(benchHexes()).toEqual(['#e63946'])
  })

  it('adjust hands the seat a hand-picked colour on apply — and only on apply', () => {
    bootCoastal()
    openAssign('accent')
    fireEvent.click(screen.getByRole('button', { name: /adjust this color/ }))
    const before = originOf('accent')
    fireEvent.change(screen.getByLabelText('new color for accent'), {
      target: { value: '00a651' },
    })
    // editing the draft regenerates nothing — the engine hears about it on apply
    expect(originOf('accent')).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))
    expect(document.querySelector('.rp-asg')).toBeNull()
    expect(originOf('accent')).toBe('#00a651')
    expect(tagOf('accent')).toBe('yours')
  })

  it('free this seat names the color that would take over — and it does', () => {
    bootCoastal()
    openAssign('accent')
    // #1d3557 charts today but is the runner-up for accent, so freeing the
    // seat hands it over rather than inventing anything
    expect(freeHint()).toBe('#1d3557 takes over')
    freeSeat()
    expect(originOf('accent')).toBe('#1d3557')
    expect(tagOf('accent')).toBe('yours')
    expect(benchHexes()).toEqual(['#457b9d'])
  })

  it('only when nothing of yours can step in does it promise the engine', () => {
    bootOneColor()
    openAssign('primary')
    // one color, and it is in this seat: there is no successor
    expect(assignOptions()).toHaveLength(0)
    expect(document.querySelector('.rp-asg-empty')?.textContent).toContain(
      'no other colors of yours to put here',
    )
    expect(freeHint()).toBe('the engine derives it')
    freeSeat()
    expect(tagOf('primary')).toBe('derived')
    expect(benchHexes()).toEqual(['#7c3aed'])
  })

  it('a seat freed with a spare color of yours is not promised to the engine', () => {
    bootCoastal()
    // #18aa66 lands in success; coastal has nothing left to fill it after
    addColors('#18aa66')
    expect(boardState().success).toBe('#18aa66 yours')
    openAssign('success')
    expect(freeHint()).toBe('the engine derives it')
    // whereas primary, with spares around, names its successor
    fireEvent.keyDown(document, { key: 'Escape' })
    openAssign('primary')
    expect(freeHint()).toMatch(/^#[0-9a-f]{6} takes over$/)
  })

  it.skip('drag-and-drop between seat, tray and bench — jsdom has no dataTransfer; covered in e2e', () => {})

  it.skip('dragging a seat to the bench parks its color — same reason; covered in e2e', () => {})
})

describe('riff', () => {
  it('walks every unlocked seat, including the ones that are yours', () => {
    bootCoastal()
    // primary, accent and neutral are all colours you supplied
    expect(ROLE_SEATS.filter((r) => tagOf(r) === 'yours')).toEqual(['primary', 'accent', 'neutral'])
    const before = boardState()

    fireEvent.click(riffBtn())

    const after = boardState()
    for (const role of ROLE_SEATS) expect(after[role]).not.toBe(before[role])
    // a hop moves colours, never the casting: who sits where is unchanged
    expect(ROLE_SEATS.map(tagOf)).toEqual(ROLE_SEATS.map((r) => before[r].split(' ')[1]))
  })

  it('a locked seat holds still while the walk carries the rest away', () => {
    bootCoastal()
    toggleLock('accent')
    keep('danger')
    expect(lockedSeats()).toEqual(['accent', 'danger'])
    const before = boardState()

    fireEvent.click(riffBtn())
    fireEvent.click(riffBtn())

    const after = boardState()
    for (const role of ['accent', 'danger'] as const) expect(after[role]).toBe(before[role])
    for (const role of ['primary', 'neutral', 'success', 'warning'] as const) {
      expect(after[role]).not.toBe(before[role])
    }
  })

  it('a colour you lock mid-walk stays put from there on', () => {
    bootCoastal()
    fireEvent.click(riffBtn())
    toggleLock('primary')
    const held = hexOf('primary')
    fireEvent.click(riffBtn())
    fireEvent.click(riffBtn())
    expect(hexOf('primary')).toBe(held)
    expect(lockOf('primary')).toBe('true')
  })

  it('walks the seed forward, and back walks it home', () => {
    bootCoastal()
    const canonical = boardState()
    // The hop count is its own badge now that the button carries a word, and
    // `back` greys out in place rather than unmounting — so riff never slides
    // sideways under a pointer that is about to press it again.
    expect(hop()).toBeNull()
    expect(backBtn().disabled).toBe(true)
    fireEvent.click(riffBtn())
    expect(hop()).toBe('1')
    fireEvent.click(riffBtn())
    expect(hop()).toBe('2')
    fireEvent.click(backBtn())
    expect(hop()).toBe('1')
    // seed 0 is canonical: the count retires and back goes quiet again
    fireEvent.click(backBtn())
    expect(hop()).toBeNull()
    expect(backBtn().disabled).toBe(true)
    expect(boardState()).toEqual(canonical)
  })

  it('start over resets the riff walk', () => {
    bootCoastal()
    fireEvent.click(riffBtn())
    expect(hop()).toBe('1')
    openStartOver()
    fireEvent.click(screen.getByRole('button', { name: /from a preset/ }))
    fireEvent.click(screen.getByRole('button', { name: /Neon arcade/ }))
    expect(hop()).toBeNull()
    expect(backBtn().disabled).toBe(true)
  })

  it('a board with every seat filled by you is still fully riffable', () => {
    // The defect this replaced: `hasDerivedSeats` went false the moment your
    // colours filled the board, killing riff on exactly the palette you had
    // just pulled out of an image and most wanted to explore.
    bootFullBoard()
    expect(ROLE_SEATS.map(tagOf).every((t) => t === 'yours')).toBe(true)
    expect(document.querySelector('.tray-cap')?.textContent).toBe('5 of 5')
    expect(lockedSeats()).toEqual([])
    expect(riffBtn().disabled).toBe(false)

    const before = boardState()
    fireEvent.click(riffBtn())
    for (const role of ROLE_SEATS) expect(boardState()[role]).not.toBe(before[role])
  })

  it('is disabled only once every seat is locked', () => {
    bootCoastal()
    expect(riffBtn().disabled).toBe(false)
    // lock the three seats of yours, keep (= lock) the three the engine owns…
    for (const role of ROLE_SEATS) toggleLock(role)
    expect(lockedSeats()).toEqual([...ROLE_SEATS])
    // …and lock the two colours of yours sitting in the chart tray
    for (const el of document.querySelectorAll('.tray-set .series-lock')) {
      fireEvent.click(el as HTMLElement)
    }
    expect(seriesLocks().every((l) => l !== 'false')).toBe(true)
    expect(riffBtn().disabled).toBe(true)
    expect(riffBtn().title).toContain('nothing to riff — every seat is locked')
  })
})

describe('placements', () => {
  it('reset appears only once you have placed something, and restores the engine casting', () => {
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

  it('says so plainly when nothing is parked, and says it once', () => {
    bootCoastal()
    expect(benchBar().textContent).toContain('bench · 0 colors not in play')
    expect(document.querySelectorAll('.benched')).toHaveLength(0)
    // The bar's own count is the whole message. A second line inside the
    // drawer restating it was redundant; the bar is also the drop target, so
    // an empty drawer costs nothing.
    expect(document.querySelector('.bench-empty')).toBeNull()
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

  it('the + opens a picker, and what you type in it lands on the board', () => {
    bootCoastal()
    expect(document.querySelector('.pk-pop')).toBeNull()
    openAdd()
    expect(document.querySelector('.pk-pop')).toBeTruthy()
    fireEvent.change(addField(), { target: { value: '#18aa66' } })
    fireEvent.click(addBtn())
    expect(boardState().success).toBe('#18aa66 yours')
  })

  it('a color already in the list cannot be added twice', () => {
    bootCoastal()
    addColors('#18aa66')
    expect(boardState().success).toBe('#18aa66 yours')
    openAdd()
    fireEvent.change(addField(), { target: { value: '#18aa66' } })
    // the control says so rather than silently making a duplicate
    expect(addBtn().disabled).toBe(true)
    expect(seatHexes().filter((h) => h === '#18aa66')).toHaveLength(1)
    expect(benchHexes()).not.toContain('#18aa66')
  })

  it('a color removed from the bench can be added again', () => {
    bootCoastal()
    addColors('#18aa66')
    // free its seat to park it, then drop it from the bench entirely
    openAssign('success')
    freeSeat()
    expect(benchHexes()).toEqual(['#18aa66'])
    fireEvent.click(benchBar())
    fireEvent.click(screen.getByLabelText('remove #18aa66'))
    expect(benchHexes()).toEqual([])
    expect(seatHexes()).not.toContain('#18aa66')
    addColors('#18aa66')
    expect(boardState().success).toBe('#18aa66 yours')
  })

  it('the popover previews the color being typed', () => {
    bootCoastal()
    openAdd()
    fireEvent.change(addField(), { target: { value: '#22aa88' } })
    const swatch = document.querySelector('.pk-prev') as HTMLElement
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
    expect(originOf('primary')).toBe('#f72585')
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

  it('the padlock turns the board into the menu; the base stays in its seat', async () => {
    bootCoastal()
    const accentBefore = hexOf('accent')
    const primaryBefore = hexOf('primary')
    fireEvent.click(monoBtn())
    expect(document.querySelector('.pick-hint')?.textContent).toContain('click a seat to lock')
    openAssign('accent')

    // The base is NOT crowned primary any more. Picking the accent used to
    // move that colour into the primary seat and displace whoever was there,
    // which read as the pick being ignored — the chip would say "primary"
    // however you had chosen.
    expect(document.querySelectorAll('.rb-anchor')).toHaveLength(1)
    expect(anchoredRole()).toBe('accent')
    // The base keeps its hue and its seat. Its LIGHTNESS may still shift: once
    // every seat shares one hue, the pairwise minimums can only be paid for in
    // lightness, and the base is not exempt from that.
    const hue = (h: string) => parseColor(h)!.h
    expect(hueDistance(hue(hexOf('accent')!), hue(accentBefore!))).toBeLessThan(3)
    // and the seat that was NOT picked is coerced onto the base's hue
    expect(hexOf('primary')).not.toBe(primaryBefore)
    expect(hueDistance(hue(hexOf('primary')!), hue(accentBefore!))).toBeLessThan(3)

    // the chip names the colour, not the seat
    expect(monoBtn().textContent).toContain('mono')
    expect(monoBtn().querySelector('.mono-dot')).toBeTruthy()
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

  it('re-locking asks again, so the base can be changed', () => {
    // It used to remember the last base and restore it on the next click. That
    // saved one click and cost the ability to ever change your mind: off, on,
    // and you were back on the same base with no route to the picker.
    bootCoastal()
    fireEvent.click(monoBtn())
    openAssign('primary')
    expect(anchoredRole()).toBe('primary')

    fireEvent.click(monoBtn())
    expect(document.querySelector('.rb-anchor')).toBeNull()
    expect(monoBtn().querySelector('.mono-dot')).toBeNull()

    fireEvent.click(monoBtn())
    expect(document.querySelector('.pick-hint')).toBeTruthy()
    openAssign('accent')
    expect(anchoredRole()).toBe('accent')
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
    expect(document.querySelector('.dial-value')?.textContent).toBe('1.00')
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
    // an untouched frame is the engine's historical output — read in light,
    // where the ladder recedes the card below the page (frames boot dark now)
    fireEvent.click(screen.getByLabelText('switch frame A to light'))
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

describe('keyboard', () => {
  const press = (key: string) => fireEvent.keyDown(window, { key })

  it('one key per verb in the row, and each button names its own', () => {
    // SHORTCUTS is the single source of truth: the handler switches on it, the
    // tooltips append from it, and the flyout lists it. This asserts the three
    // agree, so a key can never be bound to one thing and documented as another.
    bootCoastal()
    for (const [btn, id] of [
      [monoBtn(), 'mono'],
      [riffBtn(), 'riff'],
      [backBtn(), 'back'],
      [resetBtn(), 'reset'],
    ] as const) {
      expect(btn.title, id).toContain(SHORTCUTS.find((s) => s.id === id)!.key.toUpperCase())
    }
  })

  it('r riffs, z walks back', () => {
    bootCoastal()
    expect(hop()).toBeNull()
    press('r')
    expect(hop()).toBe('1')
    press('r')
    expect(hop()).toBe('2')
    press('z')
    expect(hop()).toBe('1')
  })

  it('m opens the mono picker, b toggles the bench', () => {
    bootCoastal()
    press('m')
    expect(document.querySelector('.pick-hint')).toBeTruthy()
    press('Escape')
    expect(document.querySelector('.pick-hint')).toBeNull()

    expect(benchBar().getAttribute('aria-expanded')).toBe('false')
    press('b')
    expect(benchBar().getAttribute('aria-expanded')).toBe('true')
  })

  it('shift+? opens the map, and it lists every shortcut', () => {
    bootCoastal()
    expect(document.querySelector('.sc-flyout')).toBeNull()
    press('?')
    const fly = document.querySelector('.sc-flyout') as HTMLElement
    expect(fly).toBeTruthy()
    // Both spellings of the same keystroke: the browser usually hands us the
    // mapped `?`, but only when the layout maps it that way.
    press('Escape')
    fireEvent.keyDown(window, { key: '/', shiftKey: true })
    expect(document.querySelector('.sc-flyout')).toBeTruthy()
    for (const s of SHORTCUTS) expect(fly.textContent, s.id).toContain(s.label)
    press('Escape')
    expect(document.querySelector('.sc-flyout')).toBeNull()
  })

  it('keys are ignored while you are typing in a field', () => {
    // Without this, typing a hex into the add field would riff, bench and
    // start over on the way through.
    bootCoastal()
    openAdd()
    const field = addField()
    fireEvent.keyDown(field, { key: 'r' })
    fireEvent.keyDown(field, { key: 'b' })
    expect(hop()).toBeNull()
    expect(benchBar().getAttribute('aria-expanded')).toBe('false')
  })

  it('a modifier hands the key back to the browser', () => {
    bootCoastal()
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'r', metaKey: true })
    expect(hop()).toBeNull()
  })
})
