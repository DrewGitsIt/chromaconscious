import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * The Analytics console is the only mockup that renders chart-1…chart-5 at
 * mark size, adjacent, in every encoding. These specs are less about pixels
 * than about honesty: each one drives a control and reads state back across
 * the click, because a screenshot proves something rendered and only a
 * read-back proves the click changed anything.
 */

/** Boot past the hero into a preset, then point frame A at the console. */
const boot = async (page: Page, preset = 'Coastal starter') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.role-board')).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption('analytics')
  // Panels only exist after the cold load resolves — see the skeleton spec.
  await expect(page.locator('.an-panel').first()).toBeVisible()
}

const root = (page: Page) => page.locator('.preview-root').first()

/** Read an engine-generated CSS variable off the preview root (hex string). */
const previewVar = (page: Page, name: string) =>
  root(page).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)

/** #rrggbb -> the rgb(r, g, b) string computed styles report. */
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const styleOf = (locator: Locator, prop: string) =>
  locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

test.describe('analytics console — it renders the whole palette', () => {
  test('all five chart tokens are on screen at once, as marks', async ({ page }) => {
    await boot(page)
    // Five lines, five donut wedges, five stacked segments per column, five
    // tiles. Adjacency is the entire reason this mockup exists.
    await expect(page.locator('.an-line-path')).toHaveCount(5)
    await expect(page.locator('.an-arc')).toHaveCount(5)
    await expect(page.locator('.an-tile')).toHaveCount(5)
    await expect(page.locator('.an-legend-item')).toHaveCount(5)

    for (let i = 1; i <= 5; i++) {
      const token = await previewVar(page, `--chart-${i}`)
      expect(token).toMatch(/^#[0-9a-f]{6}$/)
      const line = page.locator('.an-line-path').nth(i - 1)
      expect(await styleOf(line, 'stroke')).toBe(hexToRgb(token))
    }
  })

  test('axes and gridlines recede — they never wear a chart token', async ({ page }) => {
    await boot(page)
    const border = await previewVar(page, '--border')
    const muted = await previewVar(page, '--muted-foreground')
    const grid = page.locator('.an-line line').first()
    expect(await styleOf(grid, 'stroke')).toBe(hexToRgb(border))
    const axisLabel = page.locator('.an-line text').first()
    expect(await styleOf(axisLabel, 'fill')).toBe(hexToRgb(muted))
  })

  test('the heatmap ramps ONE hue, in at most six bins', async ({ page }) => {
    await boot(page)
    const fills = await page
      .locator('.an-heat-cell')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))
    expect(fills.length).toBe(42)
    // A sequential encoding is one hue's steps, not the categorical five.
    expect(new Set(fills).size).toBeLessThanOrEqual(6)
    for (let i = 1; i <= 5; i++) {
      const token = await previewVar(page, `--chart-${i}`)
      if (i > 1) expect(fills).not.toContain(hexToRgb(token))
    }
  })
})

test.describe('analytics console — every control is real', () => {
  test('the legend toggles a series out of every chart, and the total follows', async ({
    page,
  }) => {
    await boot(page)
    const before = await page.locator('.an-donut-total').innerText()
    await expect(page.locator('.an-line-path')).toHaveCount(5)
    await expect(page.locator('.an-arc')).toHaveCount(5)
    const barsBefore = await page.locator('.an-bar-seg').count()

    await page.locator('.an-legend-item[data-series="paid"]').click()

    await expect(page.locator('.an-line-path')).toHaveCount(4)
    await expect(page.locator('.an-arc')).toHaveCount(4)
    expect(await page.locator('.an-bar-seg').count()).toBeLessThan(barsBefore)
    await expect(page.locator('.an-legend-item[data-series="paid"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(await page.locator('.an-donut-total').innerText()).not.toBe(before)

    await page.locator('.an-legend-item[data-series="paid"]').click()
    await expect(page.locator('.an-line-path')).toHaveCount(5)
    expect(await page.locator('.an-donut-total').innerText()).toBe(before)
  })

  test('the last visible series is deliberately locked, not silently ignored', async ({
    page,
  }) => {
    await boot(page)
    for (const id of ['organic', 'referral', 'paid', 'email']) {
      await page.locator(`.an-legend-item[data-series="${id}"]`).click()
    }
    await expect(page.locator('.an-line-path')).toHaveCount(1)
    const last = page.locator('.an-legend-item[data-series="direct"]')
    await expect(last).toBeDisabled()
    await expect(last).toHaveAttribute('title', /at least one channel/i)
    await expect(last).toHaveAttribute('aria-disabled', 'true')
  })

  test('the time range changes the data, not just the label', async ({ page }) => {
    await boot(page)
    const note = page.locator('.an-panel[data-panel="line"] p').first()
    const value = page.locator('.an-tile[data-series="direct"] .an-tile-value')
    await expect(note).toContainText('30-day window')
    const at30 = await value.innerText()

    await page.locator('.an-range-opt', { hasText: '7d' }).click()
    await expect(note).toContainText('7-day window')
    await expect(page.locator('.an-range-opt[aria-pressed="true"]')).toHaveText(/7d/)
    const at7 = await value.innerText()
    expect(at7).not.toBe(at30)

    await page.locator('.an-range-opt', { hasText: '90d' }).click()
    await expect(note).toContainText('90-day window')
    expect(await value.innerText()).not.toBe(at7)
    // The x-axis moved with it, so the plot really re-scaled.
    await expect(page.locator('.an-line text').last()).toBeVisible()
  })

  test('scrubbing the line chart reports real values, by pointer and by key', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.locator('.an-line-tip')).toHaveCount(0)
    await page.locator('.an-scrub').hover()
    await expect(page.locator('.an-line-tip')).toBeVisible()
    // One readout, every visible series — the pointer never has to find a line.
    await expect(page.locator('.an-line-tip li')).toHaveCount(5)
    await expect(page.locator('.an-hover-dot')).toHaveCount(5)
    const hovered = await page.locator('.an-line-tip').innerText()
    expect(hovered).toMatch(/\d/)

    // Keyboard equivalent: same readout, no mouse.
    await page.locator('.an-scrub').focus()
    const first = await page.locator('.an-scrub').getAttribute('aria-valuetext')
    await page.keyboard.press('Home')
    const home = await page.locator('.an-scrub').getAttribute('aria-valuetext')
    expect(home).not.toBe(first)
    await expect(page.locator('.an-line-tip')).toContainText(String(home))
  })

  test('the heatmap reads out on hover and on arrow keys', async ({ page }) => {
    await boot(page)
    const readout = page.locator('.an-heat-readout')
    await expect(readout).toContainText(/hover or focus/i)

    await page.locator('.an-heat-cell[data-cell="2-3"]').hover()
    await expect(readout).toContainText('Wed 12:00–16:00')
    const wed = await readout.innerText()

    // The keyboard picks up where the pointer left off and walks the grid.
    await page.locator('[role="group"][aria-label*="weekday"]').focus()
    await page.keyboard.press('ArrowDown')
    await expect(readout).toContainText('Thu 12:00–16:00')
    await page.keyboard.press('ArrowLeft')
    await expect(readout).toContainText('Thu 08:00–12:00')
    expect(await readout.innerText()).not.toBe(wed)
  })

  test('a metric tile, a bar segment, a wedge and a share row all drill in', async ({
    page,
  }) => {
    await boot(page)
    await expect(page.locator('.an-drill')).toHaveCount(0)

    await page.locator('.an-tile[data-series="referral"]').click()
    await expect(page.locator('.an-drill h3')).toHaveText('Referral')
    await expect(page.locator('.an-drill')).toContainText('news.ycombinator.com')
    await page.locator('.an-drill-close').click()
    await expect(page.locator('.an-drill')).toHaveCount(0)

    await page.locator('.an-bar-seg[data-series="email"]').first().click()
    await expect(page.locator('.an-drill h3')).toHaveText('Lifecycle email')
    await page.locator('.an-scrim').click()
    await expect(page.locator('.an-drill')).toHaveCount(0)

    // The wedge itself: a ring only responds where it is painted, so aim at a
    // point on the arc rather than at the bounding box's (empty) centre.
    const donut = page.locator('.an-donut')
    const box = await donut.boundingBox()
    if (!box) throw new Error('donut not laid out')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.08)
    await expect(page.locator('.an-drill h3')).toHaveText('Organic search')
    await page.keyboard.press('Escape')
    await expect(page.locator('.an-drill')).toHaveCount(0)

    // …and its keyboard-reachable twin in the share list.
    await page.locator('.an-share-row[data-series="paid"]').click()
    await expect(page.locator('.an-drill h3')).toHaveText('Paid social')
    await page.keyboard.press('Escape')
    await expect(page.locator('.an-drill')).toHaveCount(0)
  })

  test('hovering a wedge retargets the donut centre', async ({ page }) => {
    await boot(page)
    const total = page.locator('.an-donut-total')
    const caption = page.locator('.an-donut-caption')
    const before = await total.innerText()
    await expect(caption).toContainText('5 of 5')
    await page.locator('.an-share-row[data-series="direct"]').hover()
    await expect(caption).toContainText('Direct')
    expect(await total.innerText()).not.toBe(before)
  })

  test('the table view is a real twin of the chart, not a second chart', async ({ page }) => {
    await boot(page)
    await expect(page.locator('.an-line')).toHaveCount(1)
    await expect(page.locator('.an-series-table')).toHaveCount(0)
    await page.locator('.an-table-toggle').click()
    await expect(page.locator('.an-line')).toHaveCount(0)
    await expect(page.locator('.an-series-table')).toBeVisible()
    await expect(page.locator('.an-table-toggle')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.an-series-table th')).toHaveCount(6)
    await page.locator('.an-table-toggle').click()
    await expect(page.locator('.an-line')).toHaveCount(1)
  })
})

test.describe('analytics console — the states a theme has to survive', () => {
  test('a cold load renders a skeleton, and Reload really re-enters it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Coastal starter' }).click()
    await expect(page.locator('.role-board')).toBeVisible()
    await page.locator('.frame-mockup').first().selectOption('analytics')
    // Straight after mount the console is skeleton, not panels.
    await expect(page.locator('.an-skeleton')).toBeVisible()
    await expect(page.locator('.an-panel')).toHaveCount(0)
    await expect(page.locator('.an-panel')).toHaveCount(4)

    await page.locator('.an-reload').click()
    await expect(page.locator('.an-skeleton')).toBeVisible()
    await expect(page.locator('.an-panel')).toHaveCount(0)
    await expect(page.locator('.an-panel')).toHaveCount(4)
  })

  test('a segment with too little history shows the empty state, with a way out', async ({
    page,
  }) => {
    await boot(page)
    await page.locator('.an-segment').click()
    await page.getByRole('option', { name: 'Kiosk (beta)' }).click()
    await expect(page.locator('.an-segment')).toContainText('Kiosk (beta)')

    await expect(page.locator('.an-empty')).toHaveCount(4)
    await expect(page.locator('.an-empty').first()).toContainText(
      'Kiosk (beta) has 12 days of history. The 30-day range needs 30.',
    )
    // Nothing to drill into or tabulate, so those controls say so.
    await expect(page.locator('.an-tile').first()).toBeDisabled()
    await expect(page.locator('.an-table-toggle')).toBeDisabled()
    await expect(page.locator('.an-tile-value').first()).toHaveText('—')

    await page.locator('.an-empty-fix').first().click()
    await expect(page.locator('.an-empty')).toHaveCount(0)
    await expect(page.locator('.an-line-path')).toHaveCount(5)
    await expect(page.locator('.an-panel[data-panel="line"] p').first()).toContainText(
      '7-day window',
    )
  })

  test('the disabled control explains itself instead of swallowing a click', async ({
    page,
  }) => {
    await boot(page)
    const annotate = page.locator('.an-annotate')
    await expect(annotate).toBeVisible()
    await expect(annotate).toBeDisabled()
    await expect(annotate).toHaveAttribute('aria-disabled', 'true')
    await expect(annotate).toHaveAttribute('title', /read-only/i)
    // The reason is reachable by pointer too — a disabled button gets no
    // pointer events, so the wrapper carries the same title.
    const wrapper = page.locator('span:has(> .an-annotate)')
    await expect(wrapper).toHaveAttribute('title', /read-only/i)
  })

  test('the portaled segment menu is painted in the theme, not the app chrome', async ({
    page,
  }) => {
    await boot(page)
    const popover = await previewVar(page, '--popover')
    await page.locator('.an-segment').click()
    const menu = page.getByRole('option', { name: 'Mobile app' })
    await expect(menu).toBeVisible()
    const bg = await menu.evaluate((el) => {
      const popup = el.closest('[data-slot="select-content"]') as HTMLElement | null
      return popup ? getComputedStyle(popup).backgroundColor : ''
    })
    expect(bg).toBe(hexToRgb(popover))
  })
})

test.describe('analytics console — dark mode and split view', () => {
  test('dark mode re-solves the chart tokens and the sequential ramp flips', async ({
    page,
  }) => {
    await boot(page)
    const lightChart1 = await previewVar(page, '--chart-1')
    const lightCell = await styleOf(page.locator('.an-heat-cell').first(), 'fill')

    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
    await expect(page.locator('.an-panel')).toHaveCount(4)

    const darkChart1 = await previewVar(page, '--chart-1')
    expect(darkChart1).not.toBe(lightChart1)
    expect(await styleOf(page.locator('.an-line-path').first(), 'stroke')).toBe(
      hexToRgb(darkChart1),
    )
    expect(await styleOf(page.locator('.an-heat-cell').first(), 'fill')).not.toBe(lightCell)
  })

  test('split view keeps two consoles independent, with unique element ids', async ({
    page,
  }) => {
    await boot(page)
    await page.locator('.sec-act .mini[title*="compare two frames"]').click()
    await page.locator('.frame-mockup').nth(1).selectOption('analytics')
    await expect(page.locator('.an-console')).toHaveCount(2)
    await expect(page.locator('.an-panel')).toHaveCount(8)

    const paneA = page.locator('.split-pane').nth(0)
    const paneB = page.locator('.split-pane').nth(1)

    // Ids are the trap: two panes sharing a clipPath id means one pane clips
    // with the other's geometry.
    const ids = await page.locator('.an-console clipPath').evaluateAll((els) =>
      els.map((el) => el.id),
    )
    expect(ids.length).toBe(2)
    expect(new Set(ids).size).toBe(2)

    // Same data in both panes — a difference here would read as a theme
    // difference rather than a data one.
    expect(await paneA.locator('.an-donut-total').innerText()).toBe(
      await paneB.locator('.an-donut-total').innerText(),
    )

    // State is per-pane: toggling in A must not touch B.
    await paneA.locator('.an-legend-item[data-series="paid"]').click()
    await expect(paneA.locator('.an-line-path')).toHaveCount(4)
    await expect(paneB.locator('.an-line-path')).toHaveCount(5)

    await paneB.locator('.an-range-opt', { hasText: '7d' }).click()
    await expect(paneB.locator('.an-panel[data-panel="line"] p').first()).toContainText(
      '7-day window',
    )
    await expect(paneA.locator('.an-panel[data-panel="line"] p').first()).toContainText(
      '30-day window',
    )
  })
})

/**
 * The console used to render no `primary`, no `primary-foreground`, no
 * `accent`, no `accent-foreground` and no `link` at all — the brand color, the
 * one the user most wants to judge, was absent from an entire design space
 * while the accent did double duty as a UI mark and a chart series. These
 * specs pin the jobs it got back, by reading the paint off the element rather
 * than trusting that a class name shipped.
 */
test.describe('analytics console — the brand color has real jobs', () => {
  test('the header action is a brand fill at a judgeable size', async ({ page }) => {
    await boot(page)
    const primary = await previewVar(page, '--primary')
    const primaryFg = await previewVar(page, '--primary-foreground')
    const save = page.locator('.an-save-view')

    await expect(save).toHaveCSS('background-color', hexToRgb(primary))
    await expect(save).toHaveCSS('color', hexToRgb(primaryFg))
    // A swatch is not a judgement. This has to be a real button.
    const box = await save.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(28)
    expect(box!.width).toBeGreaterThan(90)
  })

  /**
   * Selection wears the ACCENT, not the brand — the rule the dashboard's tab
   * indicator already follows ("selection and focus are not the brand's
   * voice", `engine/tokens.ts`). The brand belongs on actions; this control
   * picks a window, so it is a selection however consequential it is.
   */
  test('the active range option wears the accent wash — and only the active one', async ({
    page,
  }) => {
    await boot(page)
    const accent = await previewVar(page, '--accent')
    const accentFg = await previewVar(page, '--accent-foreground')
    const muted = await previewVar(page, '--muted-foreground')

    const on = page.locator('.an-range-opt[aria-pressed="true"]')
    await expect(on).toHaveText('30d')
    await expect(on).toHaveCSS('background-color', hexToRgb(accent))
    await expect(on).toHaveCSS('color', hexToRgb(accentFg))
    // and it is NOT the brand — the two must stay distinguishable jobs
    expect(accent).not.toBe(await previewVar(page, '--primary'))

    const off = page.locator('.an-range-opt', { hasText: '7d' })
    await expect(off).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(off).toHaveCSS('color', hexToRgb(muted))

    // and the wash follows the selection rather than being painted in place
    await off.click()
    await expect(page.locator('.an-range-opt[aria-pressed="true"]')).toHaveText('7d')
    await expect(off).toHaveCSS('background-color', hexToRgb(accent))
    await expect(page.locator('.an-range-opt', { hasText: '30d' })).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    )
  })

  test('Save view really saves, notices the drift, and restores', async ({ page }) => {
    await boot(page)
    const link = await previewVar(page, '--link')
    const save = page.locator('.an-save-view')
    const note = page.locator('.an-saved-note')
    await expect(note).toHaveCount(0)

    await save.click()
    await expect(note).toContainText('All traffic · 30d · 5 of 5 channels')
    await expect(note).toContainText('you are looking at it')
    // saved is the new clean state, and it says why it is dead
    await expect(save).toBeDisabled()
    await expect(save).toHaveAttribute('title', /already saved/)
    await expect(page.locator('.an-restore-view')).toHaveCount(0)

    // move off it: the console notices, and the way back is running text
    await page.locator('.an-range-opt', { hasText: '7d' }).click()
    await page.locator('.an-legend-item[data-series="paid"]').click()
    await expect(note).toContainText('the filters have moved since')
    const restore = page.locator('.an-restore-view')
    await expect(restore).toHaveCSS('color', hexToRgb(link))
    await expect(save).toBeEnabled()

    await restore.click()
    await expect(page.locator('.an-range-opt[aria-pressed="true"]')).toHaveText('30d')
    await expect(page.locator('.an-line-path')).toHaveCount(5)
    await expect(note).toContainText('you are looking at it')
    await expect(save).toBeDisabled()
  })

  test('the drill-down confirms in the brand, and the charts obey', async ({ page }) => {
    await boot(page)
    const primary = await previewVar(page, '--primary')
    const primaryFg = await previewVar(page, '--primary-foreground')
    const link = await previewVar(page, '--link')

    await page.locator('.an-tile[data-series="referral"]').click()
    const focus = page.locator('.an-drill-focus')
    await expect(focus).toHaveCSS('background-color', hexToRgb(primary))
    await expect(focus).toHaveCSS('color', hexToRgb(primaryFg))

    await focus.click()
    await expect(page.locator('.an-drill')).toHaveCount(0)
    await expect(page.locator('.an-line-path')).toHaveCount(1)
    await expect(page.locator('.an-line-path')).toHaveAttribute('data-series', 'referral')

    // …and the legend hands back the way out, as a link
    const showAll = page.locator('.an-show-all')
    await expect(showAll).toHaveCSS('color', hexToRgb(link))
    await showAll.click()
    await expect(page.locator('.an-line-path')).toHaveCount(5)
    await expect(showAll).toHaveCount(0)
  })

  test('the confirming action goes dead when there is nothing left to focus', async ({
    page,
  }) => {
    await boot(page)
    await page.locator('.an-tile[data-series="referral"]').click()
    await page.locator('.an-drill-focus').click()
    await expect(page.locator('.an-line-path')).toHaveCount(1)

    await page.locator('.an-tile[data-series="referral"]').click()
    const focus = page.locator('.an-drill-focus')
    await expect(focus).toBeDisabled()
    await expect(focus).toHaveAttribute('title', /already the only channel/)
    await page.locator('.an-drill-cancel').click()
    await expect(page.locator('.an-drill')).toHaveCount(0)
  })

  test('link carries running text, not just a control', async ({ page }) => {
    await boot(page)
    const link = await previewVar(page, '--link')
    await page.locator('.an-tile[data-series="organic"]').click()

    const explain = page.locator('.an-attr-link')
    // the link sits inside a sentence, so its paragraph reads as prose
    await expect(page.locator('.an-drill p', { hasText: 'Attribution is last-touch' })).toContainText(
      'What that means',
    )
    await expect(explain).toHaveCSS('color', hexToRgb(link))
    await expect(page.locator('.an-attr-detail')).toHaveCount(0)

    await explain.click()
    await expect(page.locator('.an-attr-detail')).toContainText('Organic search')
    await expect(explain).toHaveAttribute('aria-expanded', 'true')
    await explain.click()
    await expect(page.locator('.an-attr-detail')).toHaveCount(0)
  })

  test('a hovered row wears the accent wash and the ink solved against it', async ({
    page,
  }) => {
    await boot(page)
    const accent = await previewVar(page, '--accent')
    const accentFg = await previewVar(page, '--accent-foreground')

    const share = page.locator('.an-share-row[data-series="direct"]')
    await expect(share).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await share.hover()
    await expect(share).toHaveCSS('background-color', hexToRgb(accent))
    await expect(share).toHaveCSS('color', hexToRgb(accentFg))
    // the label follows the row instead of staying muted on the wash
    await expect(share.locator('span').nth(1)).toHaveCSS('color', hexToRgb(accentFg))

    // the data table's rows do the same job
    await page.locator('.an-table-toggle').click()
    const row = page.locator('.an-series-row').first()
    await row.hover()
    await expect(row).toHaveCSS('background-color', hexToRgb(accent))
    await expect(row).toHaveCSS('color', hexToRgb(accentFg))
  })

  test('the brand chrome is repainted from the dark solve, not reused', async ({ page }) => {
    await boot(page)
    const lightPrimary = await previewVar(page, '--primary')
    const lightLink = await previewVar(page, '--link')
    await page.locator('.an-save-view').click()
    await page.locator('.an-range-opt', { hasText: '7d' }).click()

    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
    await expect(page.locator('.an-panel')).toHaveCount(4)

    const darkPrimary = await previewVar(page, '--primary')
    const darkLink = await previewVar(page, '--link')
    expect(darkPrimary).not.toBe(lightPrimary)
    expect(darkLink).not.toBe(lightLink)
    // the brand lives on the ACTION, so that is what must repaint
    await expect(page.locator('.an-save-view')).toHaveCSS(
      'background-color',
      hexToRgb(darkPrimary),
    )
    await expect(page.locator('.an-save-view')).toHaveCSS(
      'color',
      hexToRgb(await previewVar(page, '--primary-foreground')),
    )
    // ...and the selection repaints from the dark accent, not the dark brand
    await expect(page.locator('.an-range-opt[aria-pressed="true"]')).toHaveCSS(
      'background-color',
      hexToRgb(await previewVar(page, '--accent')),
    )
    await expect(page.locator('.an-restore-view')).toHaveCSS('color', hexToRgb(darkLink))
  })
})

test.describe('analytics console — invented chart colors', () => {
  // The engine invents chart colors when the user supplies too few. The
  // console has to look right either way, so drive a two-color preset.
  test('a two-color preset still fills all five slots with distinct marks', async ({
    page,
  }) => {
    await boot(page, 'Ink & sky')
    await expect(page.locator('.an-line-path')).toHaveCount(5)
    const strokes = await page
      .locator('.an-line-path')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke))
    expect(new Set(strokes).size).toBe(5)
    for (let i = 1; i <= 5; i++) {
      expect(strokes[i - 1]).toBe(hexToRgb(await previewVar(page, `--chart-${i}`)))
    }
  })
})

/**
 * Elevation and the scrim. The engine derives both from the neutral seed, so
 * these are read back as computed style rather than looked at: a portaled menu
 * whose subtree never received `--elevation-2` renders with no shadow at all
 * and nothing on screen announces it.
 *
 * Assigned by meaning, not by taste — level 1 rests, level 2 is summoned,
 * level 3 takes over — and always additive: `separation: 'flat'` makes
 * `--elevation-1` the literal string `none`, so every surface below still owns
 * the border that separated it before any of this landed.
 */

/** Every layer's geometry, in order — matches both the engine's serialization
    and Chrome's computed form, which moves the colour in front of the four
    lengths but leaves them adjacent. */
const geometry = (css: string) => css.match(/-?\d+px -?\d+px -?\d+px -?\d+px/g) ?? []

/** The key layer identifying each level — see GEOMETRY in engine/elevation.ts. */
const KEY_LAYER = {
  1: '0px 2px 6px -1px',
  2: '0px 8px 20px -6px',
  3: '0px 24px 48px -12px',
} as const

const shadowOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).boxShadow)

/** Colour channels + alpha, so `rgb(22 29 20 / 0.32)` and `rgba(22, 29, 20, 0.32)`
    compare equal. */
const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).map(Number)

test.describe('analytics console — elevation and the scrim', () => {
  test('tiles, panels and the legend rest at level 1, from the engine string', async ({
    page,
  }) => {
    await boot(page)
    const declared = await previewVar(page, '--elevation-1')
    expect(declared).not.toBe('')
    expect(declared).not.toBe('none')

    for (const sel of ['.an-tile', '.an-panel', '.an-legend']) {
      const painted = await shadowOf(page, sel)
      expect(painted, sel).not.toBe('none')
      // layer for layer: the preview shows what the CSS export contains
      for (const layer of geometry(declared)) expect(geometry(painted), sel).toContain(layer)
      expect(geometry(painted), sel).toContain(KEY_LAYER[1])
      // and additive — the border that carried `flat` is still there
      const border = await page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth)
      expect(border, sel).toBe('1px')
    }

    // the shadow borrows the neutral's hue rather than going black
    const tint = new RegExp(`rgba\\((\\d+), (\\d+), (\\d+), [\\d.]+\\) ${KEY_LAYER[1]}`).exec(
      await shadowOf(page, '.an-tile'),
    )
    expect(tint).not.toBeNull()
    expect(tint!.slice(1, 4).map(Number).some((c) => c > 0)).toBe(true)
  })

  test('the segment menu is level 2, and the portal really got the variable', async ({ page }) => {
    await boot(page)
    await page.locator('.an-segment').click()
    const list = page.locator('[data-slot="select-content"]').first()
    await expect(list).toBeVisible()

    // mounts outside .preview-root: an empty string here is the silent bug
    const inherited = await list.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--elevation-2').trim(),
    )
    expect(inherited).toBe(await previewVar(page, '--elevation-2'))
    expect(inherited).not.toBe('')

    const painted = await list.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(geometry(painted)).toContain(KEY_LAYER[2])
    // the primitive ships a hardcoded `shadow-md`; the token had to win
    expect(geometry(painted)).not.toContain('0px 4px 6px -1px')
  })

  test('a chart read-out is a tooltip, so it is level 2 too', async ({ page }) => {
    await boot(page)
    await page.locator('.an-scrub').hover()
    await expect(page.locator('.an-line-tip')).toBeVisible()
    expect(geometry(await shadowOf(page, '.an-line-tip'))).toContain(KEY_LAYER[2])
  })

  test('the drill-down takes the console over: level 3 behind the engine scrim', async ({
    page,
  }) => {
    await boot(page)
    await page.locator('.an-tile[data-series="referral"]').click()
    await expect(page.locator('.an-drill')).toBeVisible()

    const painted = await shadowOf(page, '.an-drill')
    expect(painted).not.toBe('none')
    expect(geometry(painted)).toContain(KEY_LAYER[3])
    // a panel's weight would not read as "this owns the screen"
    expect(geometry(painted)).not.toContain(KEY_LAYER[1])

    // it blocks interaction, so the scrim is the engine's, not a local guess
    const scrim = await previewVar(page, '--scrim')
    expect(scrim).not.toBe('')
    const bg = await page.locator('.an-scrim').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(channels(bg)).toEqual(channels(scrim))
    // and it is genuinely translucent — an opaque scrim hides what it dims
    expect(channels(scrim)[3]).toBeGreaterThan(0)
    expect(channels(scrim)[3]).toBeLessThan(1)
  })

  /**
   * `flat` has no level-1 shadow at all and compensates with hairlines, so
   * every surface here has to still be separated with the shadow switched
   * off. Nothing in this console may lean on depth it might not be given.
   */
  test('flat drops the shadow and leaves every border standing', async ({ page }) => {
    await boot(page)
    await page.locator('.sep-opt[data-sep="flat"]').click()
    await expect(page.locator('.an-panel').first()).toBeVisible()
    expect(await previewVar(page, '--elevation-1')).toBe('0 0 #0000')

    for (const sel of ['.an-tile', '.an-panel', '.an-legend']) {
      expect(geometry(await shadowOf(page, sel)), sel).not.toContain(KEY_LAYER[1])
      const border = await page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth)
      expect(border, `${sel} has nothing left to separate it`).toBe('1px')
    }

    // the drill-down still reads as modal: `flat` zeroes level 1, not the
    // scrim, and the border-l is what carries the panel edge
    await page.locator('.an-tile[data-series="referral"]').click()
    await expect(page.locator('.an-drill')).toBeVisible()
    expect(
      await page.locator('.an-drill').evaluate((el) => getComputedStyle(el).borderLeftWidth),
    ).toBe('1px')
    const bg = await page.locator('.an-scrim').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(channels(bg)).toEqual(channels(await previewVar(page, '--scrim')))
  })

  test('dark elevates with a lit top edge, and leans harder on the scrim', async ({ page }) => {
    await boot(page)
    const lightTile = await shadowOf(page, '.an-tile')
    expect(lightTile).not.toContain('inset')
    const lightScrim = channels(await previewVar(page, '--scrim'))[3]

    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
    await expect(page.locator('.an-tile').first()).toBeVisible()

    const darkTile = await shadowOf(page, '.an-tile')
    expect(darkTile).not.toBe(lightTile)
    // dark has no luminance room below the page, so it lights the top edge —
    // the one trick a drop shadow cannot perform
    expect(darkTile).toMatch(/rgba\(255, 255, 255, [\d.]+\) 0px 1px 0px 0px inset/)
    expect(geometry(darkTile)).toContain(KEY_LAYER[1])

    // a pale wash over a near-black page barely registers, so dark opens up
    const darkScrim = channels(await previewVar(page, '--scrim'))[3]
    expect(darkScrim).toBeGreaterThan(lightScrim)

    // and the drill still reads as level 3 down here
    await page.locator('.an-tile[data-series="referral"]').click()
    await expect(page.locator('.an-drill')).toBeVisible()
    expect(geometry(await shadowOf(page, '.an-drill'))).toContain(KEY_LAYER[3])
    expect(await shadowOf(page, '.an-drill')).toContain('inset')
  })
})
