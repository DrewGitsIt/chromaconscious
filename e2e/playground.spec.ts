import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** Boot past the first-run hero by clicking a preset card. */
const bootCoastal = async (page: Page) => {
  await page.getByRole('button', { name: 'Coastal starter' }).click()
}

/** The section-header tools are icon-only buttons; they're addressed by title. */
const tool = (page: Page, title: string) => page.locator(`.sec-act .mini[title*="${title}"]`)

/** One labelled seat on the board. */
const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)

test.describe('first run', () => {
  test('boots into the hero; a preset card forges the first theme', async ({ page }) => {
    await expect(page.getByText('Start with anything')).toBeVisible()
    await expect(page.locator('.role-board')).toHaveCount(0)
    await bootCoastal(page)
    await expect(page.locator('.start-hero')).toHaveCount(0)
    await expect(page.locator('.preview-root')).toBeVisible()
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#e63946')
  })

  test('typing colors into the hero forges a theme from them', async ({ page }) => {
    await page.getByPlaceholder(/or type/).fill('#101010 #ababab')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.role-board')).toContainText('#101010')
    await expect(page.locator('.role-board')).toContainText('#ababab')
    await expect(page.locator('.preview-root')).toBeVisible()
  })
})

test.describe('color input', () => {
  test('pick a color in the hero popover, then the main Add button adds it', async ({ page }) => {
    await page.getByRole('button', { name: 'Pick a color', exact: true }).click()
    await page.locator('.react-colorful__saturation').click({ position: { x: 30, y: 40 } })
    // react-colorful commits the picked value asynchronously — wait it out
    await expect(page.locator('.picker-pop input')).not.toHaveValue('#7aa2f7')
    const hex = await page.locator('.picker-pop input').inputValue()
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    // one color, so it takes primary and the smith derives the rest
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText(hex)
  })

  test('the popover Add color button commits directly, without duplicates', async ({ page }) => {
    await page.getByRole('button', { name: 'Pick a color', exact: true }).click()
    await page.locator('.react-colorful__saturation').click({ position: { x: 60, y: 60 } })
    await expect(page.locator('.picker-pop input')).not.toHaveValue('#7aa2f7')
    const hex = await page.locator('.picker-pop input').inputValue()
    await page.getByRole('button', { name: 'Add color', exact: true }).click()
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText(hex)
    // the start-over menu is the one place that counts the whole set out loud
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await tool(page, 'start over').click()
    await expect(page.locator('.menu-cap')).toContainText('replaces your current 1 color')
  })

  test('the add-row grows an existing set additively; the extras park on the bench', async ({
    page,
  }) => {
    await bootCoastal(page)
    await page.getByPlaceholder(/add a color/).fill('#101010 #ababab')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#e63946')
    // neither newcomer wins a seat, so the bench says where they went
    await expect(page.locator('.bench-bar')).toContainText('2 colors not in play')
    await page.locator('.bench-bar').click()
    await expect(page.locator('.benched', { hasText: '#101010' })).toBeVisible()
    await expect(page.locator('.benched', { hasText: '#ababab' })).toBeVisible()
  })

  test('the add-row picker popover stays inside the sidebar', async ({ page }) => {
    await bootCoastal(page)
    await page.locator('.add-row .swatch-btn').click()
    const box = await page.locator('.add-row .picker-pop').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
  })
})

test.describe('start over', () => {
  test('start empty returns to the hero; undo brings the colors back', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'start over').click()
    await expect(page.locator('.menu-cap')).toContainText('replaces your current 5 colors')
    await page.getByRole('button', { name: 'start empty' }).click()
    await expect(page.getByText('Start with anything')).toBeVisible()
    await expect(page.locator('.toast')).toContainText('cleared 5 colors')
    await page.getByRole('button', { name: 'undo' }).click()
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#e63946')
    await expect(page.locator('.preview-root')).toBeVisible()
  })

  test('the preset page swaps the palette and marks the one in play', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await expect(page.locator('.preset-item.sel')).toHaveText(/Coastal starter/)
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#f72585')
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await expect(page.locator('.preset-item.sel')).toHaveText(/Neon arcade/)
    // once you edit the colors it is no longer that preset
    await tool(page, 'start over').click()
    await page.getByPlaceholder(/add a color/).fill('#101010')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
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
  test('defaults to a single full-bleed frame; the card toggle flips its mode', async ({ page }) => {
    await bootCoastal(page)
    await expect(page.locator('.preview-root')).toHaveCount(1)
    await expect(page.locator('.frame-indicator')).toHaveCount(0)
    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.getByRole('button', { name: 'switch frame A to light' })).toBeVisible()
  })

  test('compare splits the canvas; each frame keeps its own mode', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    await expect(page.locator('.preview-root')).toHaveCount(2)
    await expect(page.locator('.frame-indicator').nth(1)).toHaveText('B · light · editing')
    await page.getByRole('button', { name: 'switch frame B to dark' }).click()
    await expect(page.locator('.frame-indicator').nth(1)).toHaveText('B · dark · editing')
    await expect(page.locator('.frame-indicator').nth(0)).toHaveText('A · light')
  })

  test('sidebar edits only touch the selected frame', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    // B is now selected; diverge it
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await expect(page.locator('.frame-indicator').nth(1)).toContainText('editing')
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#f72585')
    // switch back to A: still the starter preset
    await page.getByRole('button', { name: 'edit frame A' }).click()
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#e63946')
  })

  test('copy → A overwrites frame A with frame B', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    await tool(page, 'start over').click()
    await page.getByRole('button', { name: /from a preset/ }).click()
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await page.getByRole('button', { name: 'copy frame B over frame A' }).click()
    await expect(page.locator('.frame-indicator').nth(0)).toHaveText('A · light · editing')
    await expect(seat(page, 'primary').locator('.rb-hex')).toHaveText('#f72585')
  })

  test('closing a frame returns to a single full-width view', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'compare two frames').click()
    await tool(page, 'close frame B').click()
    await expect(page.locator('.preview-root')).toHaveCount(1)
    await expect(page.locator('.frame-indicator')).toHaveCount(0)
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
  test('lock → pick a seat → chrome goes mono; unlock re-locks in one click', async ({ page }) => {
    await bootCoastal(page)
    await tool(page, 'lock the theme').click()
    await expect(page.locator('.pick-hint')).toContainText('click a seat')
    await seat(page, 'primary').locator('.rb-body').click()
    // the locked seat wears the anchor, and the tool names it
    await expect(seat(page, 'primary').locator('.rb-anchor')).toBeVisible()
    await expect(tool(page, 'unlock')).toHaveText('primary')
    await expect(page.locator('.dial-caption')).toContainText('mono')
    // flip off: the base parks; one click puts it back, no picking round two
    await tool(page, 'unlock').click()
    await expect(page.locator('.rb-anchor')).toHaveCount(0)
    await tool(page, 'lock the theme').click()
    await expect(page.locator('.pick-hint')).toHaveCount(0)
    await expect(seat(page, 'primary').locator('.rb-anchor')).toBeVisible()
  })
})
