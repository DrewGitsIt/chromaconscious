import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** Boot past the first-run hero by clicking a preset card. */
const bootCoastal = async (page: Page) => {
  await page.getByRole('button', { name: 'Coastal starter' }).click()
}

/**
 * The palette's verbs, addressed by title. They live in two places now —
 * `start over` and the frame controls stayed in the section header
 * (`.sec-act .mini`), while mono/reset/riff/back moved to the labelled row
 * beneath it (`.ctl-row .ctl`) — so this matches either. Titles carry their
 * shortcut key appended ("… · R"), which is why the match is a substring.
 */
const tool = (page: Page, title: string) =>
  page.locator(
    `.sec-act .mini[title*="${title}"], .ctl-row .ctl[title*="${title}"], .board-btn[title*="${title}"]`,
  )

/** A frame read back off its label row, e.g. `B · dark · editing`: the mode
    from the toggle's label (it offers the OTHER mode), and whether it is the
    frame being edited from the pane letter's pressed state. */
const frameState = async (page: Page, label: 'A' | 'B'): Promise<string> => {
  const dark = await page.getByRole('button', { name: `switch frame ${label} to light` }).count()
  const editing = await page
    .getByRole('button', { name: `edit frame ${label}` })
    .getAttribute('aria-pressed')
  return `${label} · ${dark ? 'dark' : 'light'}${editing === 'true' ? ' · editing' : ''}`
}

/** One labelled seat on the board. */
const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)

/**
 * Match a seat by the colour it CAME FROM. A seat's chip shows the seed the
 * engine resolved, which below fidelity 1 is not the string you typed; the
 * input is disclosed in the body tooltip as "from #…".
 */
const seatFrom = (page: Page, role: string, hex: string) =>
  expect(seat(page, role).locator('.rb-body')).toHaveAttribute('title', new RegExp(hex))

test.describe('first run', () => {
  test('boots into the hero; a preset card builds the first theme', async ({ page }) => {
    await expect(page.getByText('a single color is enough')).toBeVisible()
    await expect(page.locator('.role-board')).toHaveCount(0)
    await bootCoastal(page)
    await expect(page.locator('.start-hero')).toHaveCount(0)
    await expect(page.locator('.preview-root')).toBeVisible()
    await seatFrom(page, 'primary', '#e63946')
  })

  test('typing colors into the hero builds a theme from them', async ({ page }) => {
    await page.getByPlaceholder(/or type/).fill('#101010 #ababab')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.role-board')).toHaveAttribute('class', /role-board/)
    await expect(page.locator('.rb-body[title*="#101010"]')).toHaveCount(1)
    await expect(page.locator('.rb-body[title*="#ababab"]')).toHaveCount(1)
    await expect(page.locator('.preview-root')).toBeVisible()
  })
})

/** The sidebar's add control is a `+` swatch; everything else is behind it. */
const openAddPopover = async (page: Page) => {
  await page.getByRole('button', { name: 'add a color', exact: true }).click()
  await expect(page.locator('.pk-pop')).toBeVisible()
}

test.describe('color input', () => {
  test('pick a color in the hero popover, then the main Add button adds it', async ({ page }) => {
    await page.getByRole('button', { name: 'Pick a color', exact: true }).click()
    await page.locator('.react-colorful__saturation').click({ position: { x: 30, y: 40 } })
    // react-colorful commits the picked value asynchronously — wait it out
    await expect(page.locator('.picker-pop input')).not.toHaveValue('#7aa2f7')
    const hex = await page.locator('.picker-pop input').inputValue()
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    // one color, so it takes primary and the engine derives the rest
    await seatFrom(page, 'primary', hex)
  })

  test('the hero popover Add color button commits directly, without duplicates', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Pick a color', exact: true }).click()
    await page.locator('.react-colorful__saturation').click({ position: { x: 60, y: 60 } })
    await expect(page.locator('.picker-pop input')).not.toHaveValue('#7aa2f7')
    const hex = await page.locator('.picker-pop input').inputValue()
    await page.getByRole('button', { name: 'Add color', exact: true }).click()
    await seatFrom(page, 'primary', hex)
    // the sidebar's + popover is where a second add would happen, and it
    // refuses: the colour is already on the board
    await openAddPopover(page)
    await page.getByPlaceholder(/add a color/).fill(hex)
    await expect(page.locator('.pk-msg')).toContainText('already on the board')
    await expect(page.locator('.pk-add')).toBeDisabled()
    await page.keyboard.press('Escape')
    // the start-over menu is the one place that counts the whole set out loud
    await tool(page, 'start over').click()
    await expect(page.locator('.menu-cap')).toContainText('replaces your current 1 color')
  })

  test('the + popover grows an existing set additively; the extras land in unused', async ({
    page,
  }) => {
    await bootCoastal(page)
    await openAddPopover(page)
    await page.getByPlaceholder(/add a color/).fill('#101010 #ababab')
    await expect(page.locator('.pk-msg')).toContainText('2 colours read')
    await page.getByRole('button', { name: 'add 2 colors' }).click()
    await expect(page.locator('.pk-pop')).toHaveCount(0)
    await seatFrom(page, 'primary', '#e63946')
    // neither newcomer wins a seat, so "unused" says where they went
    await expect(page.locator('.unused-chip')).toHaveCount(2)
    await expect(page.locator('.unused-chip', { hasText: '#101010' })).toBeVisible()
    await expect(page.locator('.unused-chip', { hasText: '#ababab' })).toBeVisible()
  })

  test('a functional colour syntax survives being typed', async ({ page }) => {
    // The field's own placeholder advertises `oklch(…)`, and the tokenizer used
    // to split on every space and comma before parsing. `oklch(0.7 0.12 250)`
    // became three fragments and vanished; `rgb(91, 124, 250)` left `124`,
    // which parses as the hex #124 — so a light blue quietly added a dark navy.
    await page.goto('/')
    await page.getByPlaceholder(/or type/).fill('rgb(91, 124, 250)')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.preview-root')).toBeVisible()
    // The seat records what you typed as its source; #5b7cfa is that colour,
    // #112244 is what the old tokenizer silently substituted for it.
    const body = page.locator('.rb-slot[data-role="primary"] .rb-body')
    await expect(body).toHaveAttribute('title', /#5b7cfa|^#5b7cfa/)
    await expect(page.locator('.rb-slot', { hasText: '#112244' })).toHaveCount(0)

    // and a second functional syntax adds a real second colour, not nothing
    const mine = () =>
      page.locator('.rb-slot.rb-yours').count()
    expect(await mine()).toBe(1)
    await openAddPopover(page)
    await page.getByPlaceholder(/add a color/).fill('oklch(0.7 0.12 250)')
    await page.locator('.pk-add').click()
    await expect.poll(mine).toBe(2)
  })

  test('unreadable input is named in the popover, and stays in the field', async ({ page }) => {
    // The old field's only answer to `#gg12` was to clear itself and add
    // nothing, which is indistinguishable from a working add.
    await bootCoastal(page)
    await openAddPopover(page)
    const field = page.getByPlaceholder(/add a color/)
    await field.fill('#gg12')
    await expect(page.locator('.pk-msg')).toContainText('can’t read')
    await expect(page.locator('.pk-add')).toBeDisabled()
    await expect(field).toHaveValue('#gg12')
    // a readable colour beside it still goes through; the typo is what's left
    await field.fill('#101010 wrong')
    await expect(page.locator('.pk-msg')).toContainText('wrong')
    await page.getByRole('button', { name: 'add #101010' }).click()
    await expect(field).toHaveValue('wrong')
    await expect(page.locator('.pk-pop')).toBeVisible()
    // the colour really did land — the board was full, so it is in "unused"
    await page.keyboard.press('Escape')
    await expect(page.locator('.unused-chip', { hasText: '#101010' })).toBeVisible()
  })

  test('the + popover stays whole at any sidebar scroll offset', async ({ page }) => {
    // `.sidebar-shell` is overflow:hidden and `.sb-body` is overflow-y:auto.
    // Scrolled to the end there is room for this popover on NEITHER side of
    // its swatch, so it is position:fixed and clamped to the viewport.
    await bootCoastal(page)
    // Let the sidebar's entrance settle first. The panel overflows at 720px,
    // and a click landing on a swatch that is still sliding in makes
    // Playwright re-aim by scrolling `.sb-body` — which moves the swatch this
    // test is about to measure against.
    await page.waitForFunction(() =>
      document
        .querySelector('.sb-body')!
        .getAnimations({ subtree: true })
        .every((a) => a.playState !== 'running'),
    )
    await openAddPopover(page)
    const whole = async () => {
      const pop = (await page.locator('.pk-pop').boundingBox())!
      const view = page.viewportSize()!
      expect(pop.x).toBeGreaterThanOrEqual(0)
      expect(pop.y).toBeGreaterThanOrEqual(0)
      expect(pop.x + pop.width).toBeLessThanOrEqual(view.width)
      expect(pop.y + pop.height).toBeLessThanOrEqual(view.height)
    }
    await whole()
    // above the swatch by preference: that is where the board it joins is
    const first = (await page.locator('.pk-pop').boundingBox())!
    const trigger = (await page.locator('.addsw').boundingBox())!
    expect(first.y + first.height).toBeLessThanOrEqual(trigger.y + 1)

    await page.locator('.sb-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await whole()
    // and it still works down there
    await page.getByPlaceholder(/add a color/).fill('#101010')
    await page.getByRole('button', { name: 'add #101010' }).click()
    await expect(page.locator('.pk-pop')).toHaveCount(0)
  })
})

test.describe('start over', () => {
  test('start empty returns to the hero; undo brings the colors back', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'start over').click()
    await expect(page.locator('.menu-cap')).toContainText('replaces your current 5 colors')
    await page.getByRole('button', { name: 'start empty' }).click()
    await expect(page.getByText('a single color is enough')).toBeVisible()
    await expect(page.locator('.toast')).toContainText('cleared 5 colors')
    await page.getByRole('button', { name: 'undo' }).click()
    await seatFrom(page, 'primary', '#e63946')
    await expect(page.locator('.preview-root')).toBeVisible()
  })

  test('the preset page swaps the palette and marks the one in play', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await expect(page.locator('.preset-item.sel')).toHaveText(/Coastal starter/)
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await seatFrom(page, 'primary', '#f72585')
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await expect(page.locator('.preset-item.sel')).toHaveText(/Neon arcade/)
    // once you edit the colors it is no longer that preset
    await tool(page, 'start over').click()
    await openAddPopover(page)
    await page.getByPlaceholder(/add a color/).fill('#101010')
    await page.getByRole('button', { name: 'add #101010' }).click()
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await expect(page.locator('.preset-item.sel')).toHaveCount(0)
  })

  test('dragging files over the window discloses the start-over contract', async ({ page }) => {
    await bootCoastal(page)
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'x.png', { type: 'image/png' }))
      document
        .querySelector('.app')!
        .dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    })
    await expect(page.locator('.drop-overlay')).toContainText('drop to start over from this image')
    await expect(page.locator('.drop-overlay')).toContainText('replaces your current 5 colors')
    await page.evaluate(() => {
      document
        .querySelector('.drop-overlay')!
        .dispatchEvent(new DragEvent('dragleave', { bubbles: true }))
    })
    await expect(page.locator('.drop-overlay')).toHaveCount(0)
  })
})

test.describe('theme output', () => {
  test('the app background carries the palette hue', async ({ page }) => {
    await bootCoastal(page)
    const bgOf = () =>
      page.locator('.preview-root').evaluate((el) => getComputedStyle(el).backgroundColor)
    const coastal = await bgOf()
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await page.getByRole('button', { name: 'Terracotta' }).click()
    const terracotta = await bgOf()
    expect(terracotta).not.toBe(coastal)
  })
})

test.describe('frames', () => {
  test('defaults to a single frame; the label row toggle flips its mode', async ({ page }) => {
    await bootCoastal(page)
    await expect(page.locator('.preview-root')).toHaveCount(1)
    await expect(page.locator('.artboard')).toHaveCount(1)
    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.getByRole('button', { name: 'switch frame A to light' })).toBeVisible()
  })

  test('compare splits the canvas; each frame keeps its own mode', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    await expect(page.locator('.preview-root')).toHaveCount(2)
    await expect.poll(() => frameState(page, 'B')).toBe('B · light · editing')
    await page.getByRole('button', { name: 'switch frame B to dark' }).click()
    await expect.poll(() => frameState(page, 'B')).toBe('B · dark · editing')
    await expect.poll(() => frameState(page, 'A')).toBe('A · light')
  })

  test('sidebar edits only touch the selected frame', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    // B is now selected; diverge it
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await expect.poll(() => frameState(page, 'B')).toContain('editing')
    await seatFrom(page, 'primary', '#f72585')
    // switch back to A: still the starter preset
    await page.getByRole('button', { name: 'edit frame A' }).click()
    await seatFrom(page, 'primary', '#e63946')
  })

  test('copy → A overwrites frame A with frame B', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await page.getByRole('button', { name: 'copy frame B over frame A' }).click()
    await expect.poll(() => frameState(page, 'A')).toBe('A · light · editing')
    await seatFrom(page, 'primary', '#f72585')
  })

  test('closing a frame returns to a single full-width view', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    await tool(page, 'close frame B').click()
    await expect(page.locator('.preview-root')).toHaveCount(1)
    await expect(page.locator('.artboard')).toHaveCount(1)
    await expect(tool(page, 'compare two frames')).toBeVisible()
  })
})

test.describe('mockups', () => {
  test('a frame can render the brand board while the other keeps the app dashboard', async ({
    page,
  }) => {
    await bootCoastal(page)
    await page.locator('.frame-mockup').selectOption('brand')
    await expect(page.locator('.brand-board')).toBeVisible()
    await expect(page.locator('.bb-wordmark')).toHaveText('Acme')
    await tool(page, 'compare two frames').click()
    // B (a brand clone) now has its own card select; flip it back to the dashboard
    await page.locator('.frame-mockup').nth(1).selectOption('app')
    await expect(page.locator('.brand-board')).toHaveCount(1)
    await expect(page.locator('.preview-root')).toHaveCount(1)
  })
})

test.describe('report', () => {
  test('the status chip opens the report drawer over the live canvas', async ({ page }) => {
    await bootCoastal(page)
    await expect(page.locator('.status-chip')).toContainText(/checks pass|issue/)
    await page.locator('.status-chip').click()
    await expect(page.locator('.report-drawer')).toBeVisible()
    await expect(page.locator('.report-drawer')).toContainText('role assignments')
    // the canvas stays underneath — the drawer overlays, it doesn't replace
    await expect(page.locator('.preview-root')).toBeVisible()
    await page.getByRole('button', { name: 'close report' }).click()
    await expect(page.locator('.report-drawer')).toHaveCount(0)
  })
})

test.describe('export', () => {
  /**
   * The "… copied" confirmation clears itself after 1600ms, so asserting it is
   * a race against a wall clock: under a loaded suite the window can close
   * before the first poll, and this test failed roughly two runs in five.
   * Faking the clock makes the transient hold until the test advances time,
   * which tests the same thing without depending on how busy the machine is.
   */
  test('the split button copies, and the format menu copies + is remembered', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.clock.install()
    await bootCoastal(page)

    await page.getByRole('button', { name: /Copy CSS variables/ }).click()
    await expect(page.getByText(/CSS variables copied/)).toBeVisible()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain(':root')
    expect(clip).toContain('.dark')
    await page.clock.runFor(2000) // let the confirmation clear on cue

    await page.getByRole('button', { name: 'choose export format' }).click()
    await page.getByRole('menuitem', { name: 'Tailwind v4 CSS' }).click()
    await expect(page.getByText(/Tailwind v4 CSS copied/)).toBeVisible()
    const tw = await page.evaluate(() => navigator.clipboard.readText())
    expect(tw).toContain('@theme inline')
    // the main button remembers the last-used format
    await page.clock.runFor(2000)
    await expect(page.getByRole('button', { name: /Copy Tailwind v4 CSS/ })).toBeVisible()

    await page.getByRole('button', { name: 'choose export format' }).click()
    await page.getByRole('menuitem', { name: 'Design tokens JSON' }).click()
    await expect(page.getByText(/Design tokens JSON copied/)).toBeVisible()
    const json = await page.evaluate(() => navigator.clipboard.readText())
    expect(JSON.parse(json).light.primary.$type).toBe('color')
  })
})

test.describe('mono lock', () => {
  test('lock → pick a seat → chrome goes mono; re-locking lets you re-pick', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'lock the theme').click()
    await expect(page.locator('.pick-hint')).toContainText('click a seat')
    await seat(page, 'primary').locator('.rb-body').click()
    // the base wears the anchor, and the tool names it by COLOUR — it used to
    // say "primary" whichever seat you picked, because the base was crowned
    await expect(seat(page, 'primary').locator('.rb-anchor')).toBeVisible()
    await expect(tool(page, 'unlock')).toContainText('mono')
    await expect(tool(page, 'unlock').locator('.mono-dot')).toBeVisible()
    await expect(page.locator('.dial-caption')).toContainText('mono')

    // Flip off and on: it asks again rather than silently restoring the last
    // base, which is what made the first pick permanent.
    await tool(page, 'unlock').click()
    await expect(page.locator('.rb-anchor')).toHaveCount(0)
    await tool(page, 'lock the theme').click()
    await expect(page.locator('.pick-hint')).toContainText('click a seat')
    await seat(page, 'accent').locator('.rb-body').click()
    // and the base stays in the seat you picked it from
    await expect(seat(page, 'accent').locator('.rb-anchor')).toBeVisible()
    await expect(seat(page, 'primary').locator('.rb-anchor')).toHaveCount(0)
  })
})
