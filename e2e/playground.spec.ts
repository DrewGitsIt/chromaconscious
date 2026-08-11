import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** Boot past the first-run hero by clicking a preset card. */
const bootCoastal = async (page: Page) => {
  await page.getByRole('button', { name: 'Coastal starter' }).click()
}

test.describe('first run', () => {
  test('boots into the hero; a preset card forges the first theme', async ({ page }) => {
    await expect(page.getByText('Start with anything')).toBeVisible()
    await expect(page.locator('.candidate-strip')).toHaveCount(0)
    await bootCoastal(page)
    await expect(page.locator('.start-hero')).toHaveCount(0)
    await expect(page.locator('.preview-root')).toBeVisible()
    await expect(page.locator('.candidate-strip')).toContainText('#e63946')
  })

  test('typing colors into the hero forges a theme from them', async ({ page }) => {
    await page.getByPlaceholder(/or type/).fill('#101010 #ababab')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.candidate-strip')).toContainText('#101010')
    await expect(page.locator('.candidate-strip')).toContainText('#ababab')
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
    await expect(page.locator('.candidate-strip')).toContainText(hex)
  })

  test('the popover Add color button commits directly, without duplicates', async ({ page }) => {
    await page.getByRole('button', { name: 'Pick a color', exact: true }).click()
    await page.locator('.react-colorful__saturation').click({ position: { x: 60, y: 60 } })
    await expect(page.locator('.picker-pop input')).not.toHaveValue('#7aa2f7')
    const hex = await page.locator('.picker-pop input').inputValue()
    await page.getByRole('button', { name: 'Add color', exact: true }).click()
    await expect(page.locator('.candidate-strip')).toContainText(hex)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.candidate-strip code', { hasText: hex })).toHaveCount(1)
  })

  test('the add-row grows an existing set additively', async ({ page }) => {
    await bootCoastal(page)
    await page.getByPlaceholder(/add a color/).fill('#101010 #ababab')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.candidate-strip')).toContainText('#e63946')
    await expect(page.locator('.candidate-strip')).toContainText('#101010')
    await expect(page.locator('.candidate-strip')).toContainText('#ababab')
  })

  test('editing a candidate chip in place persists the new color', async ({ page }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'Edit #e63946' }).click()
    await page.locator('.candidate-strip .picker-pop input').fill('#22aa88')
    await expect(page.locator('.candidate-strip')).toContainText('#22aa88')
  })

  test('the candidate picker popover stays inside the sidebar', async ({ page }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'Edit #e63946' }).click()
    const box = await page.locator('.candidate-strip .picker-pop').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
  })

  test('dragging a candidate reorders the list', async ({ page }) => {
    await bootCoastal(page)
    const strip = page.locator('.candidate-strip li')
    const before = await strip.locator('code').allTextContents()
    await strip.nth(1).locator('.drag-handle').dragTo(strip.nth(0))
    const after = strip.locator('code')
    await expect(after.nth(0)).toHaveText(before[1])
    await expect(after.nth(1)).toHaveText(before[0])
  })
})

test.describe('start over', () => {
  test('start empty returns to the hero; undo brings the colors back', async ({ page }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'start over' }).click()
    await expect(page.locator('.menu-cap')).toContainText('replaces your current 5 colors')
    await page.getByRole('button', { name: 'start empty' }).click()
    await expect(page.getByText('Start with anything')).toBeVisible()
    await expect(page.locator('.toast')).toContainText('cleared 5 colors')
    await page.getByRole('button', { name: 'undo' }).click()
    await expect(page.locator('.candidate-strip')).toContainText('#e63946')
    await expect(page.locator('.preview-root')).toBeVisible()
  })

  test('the preset page swaps the palette and shows its name by the button', async ({ page }) => {
    await bootCoastal(page)
    await expect(page.locator('.startover-preset')).toHaveText('Coastal starter')
    await page.getByRole('button', { name: 'start over' }).click()
    await page.getByRole('button', { name: 'from a preset ›' }).click()
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await expect(page.locator('.candidate-strip')).toContainText('#f72585')
    await expect(page.locator('.startover-preset')).toHaveText('Neon arcade')
    // editing candidates clears the preset name
    await page.locator('.candidate-strip li').first().locator('[title="Remove"]').click()
    await expect(page.locator('.startover-preset')).toHaveCount(0)
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
    await page.getByRole('button', { name: 'start over' }).click()
    await page.getByRole('button', { name: 'from a preset ›' }).click()
    await page.getByRole('button', { name: 'Terracotta' }).click()
    const terracotta = await bgOf()
    expect(terracotta).not.toBe(coastal)
  })
})

test.describe('frames', () => {
  test('defaults to a single full-bleed frame; toolbar toggle flips its mode', async ({ page }) => {
    await bootCoastal(page)
    await expect(page.locator('.preview-root')).toHaveCount(1)
    await expect(page.locator('.frame-indicator')).toHaveCount(0)
    await page.getByRole('button', { name: 'switch A to dark' }).click()
    await expect(page.getByRole('button', { name: 'switch A to light' })).toBeVisible()
  })

  test('duplicate splits the canvas; each frame keeps its own mode', async ({ page }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'duplicate' }).click()
    await expect(page.locator('.preview-root')).toHaveCount(2)
    await expect(page.locator('.frame-indicator').nth(1)).toHaveText('B · light · editing')
    await page.getByRole('button', { name: 'switch B to dark' }).click()
    await expect(page.locator('.frame-indicator').nth(1)).toHaveText('B · dark · editing')
    await expect(page.locator('.frame-indicator').nth(0)).toHaveText('A · light')
  })

  test('toolbar edits only touch the selected frame', async ({ page }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'duplicate' }).click()
    // B is now selected; diverge it
    await page.getByRole('button', { name: 'start over' }).click()
    await page.getByRole('button', { name: 'from a preset ›' }).click()
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await expect(page.locator('.frame-indicator').nth(1)).toContainText('editing')
    // switch back to A: still the starter preset
    await page.getByRole('button', { name: 'select A' }).click()
    await expect(page.locator('.startover-preset')).toHaveText('Coastal starter')
  })

  test('copy → A overwrites frame A with frame B', async ({ page }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'duplicate' }).click()
    await page.getByRole('button', { name: 'start over' }).click()
    await page.getByRole('button', { name: 'from a preset ›' }).click()
    await page.getByRole('button', { name: 'Neon arcade' }).click()
    await page.getByRole('button', { name: 'copy → A' }).click()
    await expect(page.locator('.frame-indicator').nth(0)).toHaveText('A · light · editing')
    await expect(page.locator('.startover-preset')).toHaveText('Neon arcade')
  })

  test('closing a frame returns to a single full-width view', async ({ page }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'duplicate' }).click()
    await page.getByRole('button', { name: 'close B' }).click()
    await expect(page.locator('.preview-root')).toHaveCount(1)
    await expect(page.locator('.frame-indicator')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'duplicate' })).toBeVisible()
  })
})

test.describe('mockups', () => {
  test('a frame can render the brand board while the other keeps the app dashboard', async ({
    page,
  }) => {
    await bootCoastal(page)
    await page.locator('.mockup-select').selectOption('brand')
    await expect(page.locator('.brand-board')).toBeVisible()
    await expect(page.locator('.bb-wordmark')).toHaveText('Acme')
    await page.getByRole('button', { name: 'duplicate' }).click()
    // B (a brand clone) now has its own row select; flip it back to the app dashboard
    await page.locator('.mockup-select').nth(1).selectOption('app')
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
  test('the split button copies, and the format menu copies + is remembered', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await bootCoastal(page)
    await page.getByRole('button', { name: /Copy CSS variables/ }).click()
    await expect(page.getByText(/CSS variables copied/)).toBeVisible()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain(':root')
    expect(clip).toContain('.dark')

    await page.getByRole('button', { name: 'choose export format' }).click()
    await page.getByRole('button', { name: 'Tailwind v4 CSS' }).click()
    await expect(page.getByText(/Tailwind v4 CSS copied/)).toBeVisible()
    const tw = await page.evaluate(() => navigator.clipboard.readText())
    expect(tw).toContain('@theme inline')
    // the main button remembers the last-used format
    await expect(page.getByRole('button', { name: /Copy Tailwind v4 CSS/ })).toBeVisible()

    await page.getByRole('button', { name: 'choose export format' }).click()
    await page.getByRole('button', { name: 'Design tokens JSON' }).click()
    await expect(page.getByText(/Design tokens JSON copied/)).toBeVisible()
    const json = await page.evaluate(() => navigator.clipboard.readText())
    expect(JSON.parse(json).light.primary.$type).toBe('color')
  })
})

test.describe('mono lock', () => {
  test('padlock → pick a color → chrome goes mono; unlock re-locks in one click', async ({
    page,
  }) => {
    await bootCoastal(page)
    await page.getByRole('button', { name: 'lock the theme to one color' }).click()
    await expect(page.locator('.lock-cap.hint')).toContainText('click a color')
    await page.locator('.candidate-strip li').first().click()
    await expect(page.locator('.badge-base')).toContainText('base')
    await expect(page.locator('.lock-cap')).toContainText('invents no new hues')
    await expect(page.locator('.fid-caption')).toContainText('mono')
    // flip off: base parks next to the open padlock; flip back on
    await page.getByRole('button', { name: 'unlock mono' }).click()
    await expect(page.locator('.lock-sw.parked')).toBeVisible()
    await page.getByRole('button', { name: /re-lock/ }).click()
    await expect(page.locator('.badge-base')).toBeVisible()
  })
})
