/**
 * The pane's numbered sections and the rail beside them.
 *
 * The rail's invariant is the reason it exists, so it is checked in a real
 * browser, against real layout, at several scroll positions and after folds:
 * a tick lies inside the thumb exactly when its section's top is in the
 * scroll viewport. (rail.test.ts pins the maths; this pins the wiring —
 * the coordinate frame, the ResizeObserver, and 1:1 tracking.)
 */
import { expect, test, type Page } from '@playwright/test'

// Short enough that a built theme overflows the pane, so there is a thumb.
test.use({ viewport: { width: 1440, height: 720 } })

async function boot(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion })
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.role-board')).toBeVisible()
  await settle(page)
}

/** Let folds, entrances and smooth scrolls finish before measuring anything. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  )
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const body = document.querySelector('.sb-body') as HTMLElement
        let last = -1
        let same = 0
        const tick = () => {
          same = body.scrollTop === last ? same + 1 : 0
          last = body.scrollTop
          if (same >= 3) done()
          else requestAnimationFrame(tick)
        }
        tick()
      }),
  )
}

const head = (page: Page, id: string) => page.locator(`[data-sec="${id}"] .sec-toggle`)

/** Every section's view state against its tick, read straight off the DOM. */
async function railReport(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector('.sb-body') as HTMLElement
    const thumb = document.querySelector('.rail-thumb') as HTMLElement
    const tT = parseFloat(thumb.style.top)
    const tH = parseFloat(thumb.style.height)
    const secs = [...body.querySelectorAll<HTMLElement>('[data-sec]')]
    const ticks = [...document.querySelectorAll<HTMLElement>('.rail-tick')]
    return {
      sections: secs.map((s) => s.dataset.sec),
      ticks: ticks.map((t) => t.dataset.tick),
      thumbVisible: getComputedStyle(thumb).visibility !== 'hidden',
      rows: secs.map((s) => {
        const top = s.offsetTop
        const y = parseFloat(
          (document.querySelector(`.rail-tick[data-tick="${s.dataset.sec}"]`) as HTMLElement).style.top,
        )
        const inView = top >= body.scrollTop - 0.5 && top <= body.scrollTop + body.clientHeight + 0.5
        const inThumb = y >= tT - 0.5 && y <= tT + tH + 0.5
        return { id: s.dataset.sec, inView, inThumb }
      }),
    }
  })
}

async function expectInvariant(page: Page, where: string) {
  const r = await railReport(page)
  expect(r.ticks, `${where}: one tick per section`).toEqual(r.sections)
  for (const row of r.rows) expect(row.inThumb, `${where}: ${row.id} (inView ${row.inView})`).toBe(row.inView)
  return r
}

test.describe('the rail', () => {
  test('a tick lies inside the thumb exactly when its section top is in view', async ({ page }) => {
    await boot(page)
    const r = await expectInvariant(page, 'top')
    expect(r.thumbVisible, 'the pane overflows at 720px, so the thumb shows').toBe(true)
    const max = await page.locator('.sb-body').evaluate((b) => b.scrollHeight - b.clientHeight)
    for (const f of [0.25, 0.5, 0.75, 1]) {
      await page.locator('.sb-body').evaluate((b, y) => b.scrollTo(0, y), Math.round(max * f))
      await settle(page)
      await expectInvariant(page, `scrolled ${f}`)
    }
  })

  test('the invariant survives folds, including mid-fold', async ({ page }) => {
    await boot(page, 'no-preference')
    await page.locator('.sb-body').evaluate((b) => b.scrollTo(0, 200))
    await settle(page)
    await head(page, 'colors').click()
    // mid-fold: the ResizeObserver on the one content wrapper moves the ticks on every frame
    await page.waitForTimeout(120)
    await expectInvariant(page, 'mid-fold')
    await settle(page)
    await expectInvariant(page, 'colors folded')
    await head(page, 'colors').click()
    await settle(page)
    await expectInvariant(page, 'colors reopened')
  })

  test('clicking a tick scrolls its section to the top', async ({ page }) => {
    await boot(page)
    await page.locator('.rail-tick[data-tick="riff"]').click()
    await settle(page)
    const { top, scrollTop, max } = await page.evaluate(() => {
      const body = document.querySelector('.sb-body') as HTMLElement
      const sec = body.querySelector('[data-sec="riff"]') as HTMLElement
      return { top: sec.offsetTop, scrollTop: body.scrollTop, max: body.scrollHeight - body.clientHeight }
    })
    // at the top, or as far as the scroller goes
    expect(Math.abs(scrollTop - Math.min(max, top - 6))).toBeLessThan(2)
    await expect(page.locator('.rail-tick[data-tick="riff"]')).toHaveClass(/here/)
  })

  test('compare gets a tick only once the stage is split', async ({ page }) => {
    await boot(page)
    await expect(page.locator('.rail-tick')).toHaveCount(3)
    await page.locator('.board-btn[title*="compare two frames"]').click()
    await expect(page.locator('.rail-tick')).toHaveCount(4)
    await expect(page.locator('[data-sec="compare"] .sec-n')).toHaveText('4')
    await settle(page)
    await expectInvariant(page, 'split')
  })
})

test.describe('sections', () => {
  test('before any input the pane holds one section, input, and a greyed Export', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-sec]')).toHaveCount(1)
    await expect(page.locator('[data-sec="input"] .sec-label')).toHaveText('input')
    await expect(page.locator('.export-main')).toBeDisabled()
    await expect(page.getByText('add a color to export CSS, Tailwind, Figma variables or a share link')).toBeVisible()
    await page.getByRole('button', { name: 'Coastal starter' }).click()
    await expect(page.locator('[data-sec] .sec-label')).toHaveText(['colors', 'tuning', 'riff'])
    await expect(page.locator('.export-main')).toBeEnabled()
  })

  test('headers are reachable and foldable from the keyboard', async ({ page }) => {
    await boot(page)
    const tuning = head(page, 'tuning')
    await tuning.focus()
    await expect(tuning).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Enter')
    await expect(tuning).toHaveAttribute('aria-expanded', 'false')
    // folded content is inert: the slider cannot take focus
    await expect(page.locator('.dial-slider')).not.toBeFocused()
    await page.keyboard.press('Space')
    await expect(tuning).toHaveAttribute('aria-expanded', 'true')
    // the controls region it names is the body it folds
    const body = await tuning.getAttribute('aria-controls')
    await expect(page.locator(`[id="${body}"] .dial`)).toBeVisible()
  })

  test('a hotkey aimed at a folded section opens it and shows the result', async ({ page }) => {
    await boot(page)
    await head(page, 'riff').click()
    await expect(head(page, 'riff')).toHaveAttribute('aria-expanded', 'false')
    await page.locator('.stage').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('r')
    await expect(head(page, 'riff')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.ctl-hop')).toHaveText('1')
    await expect(page.locator('.ctl-hop')).toBeInViewport()
  })

  test('no section is left wearing a transform once it has entered', async ({ page }) => {
    // An identity transform from a filled entrance animation still makes a
    // containing block, and re-anchors every position:fixed popover inside.
    await boot(page, 'no-preference')
    await page.locator('.board-btn[title*="compare two frames"]').click()
    await settle(page)
    const transforms = await page
      .locator('.sb-body [data-sec], .sb-body-inner')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).transform))
    for (const t of transforms) expect(t).toBe('none')
  })
})

/** Is the fixed popover where its anchor is, rather than a scroll offset away? */
async function expectBesideAnchor(page: Page, pop: string, anchor: string) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel)
      return !!el && el.getAnimations().every((a) => a.playState !== 'running')
    },
    pop,
  )
  const { p, a, vw, vh } = await page.evaluate(
    ([popSel, anchorSel]) => {
      const r = (s: string) => {
        const b = document.querySelector(s)!.getBoundingClientRect()
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }
      }
      return { p: r(popSel), a: r(anchorSel), vw: innerWidth, vh: innerHeight }
    },
    [pop, anchor],
  )
  expect(p.top, 'inside the viewport').toBeGreaterThanOrEqual(0)
  expect(p.bottom).toBeLessThanOrEqual(vh)
  expect(p.right).toBeLessThanOrEqual(vw)
  // vertically adjacent to the anchor (above or below), unless clamped at an edge
  const gap = Math.max(p.top - a.bottom, a.top - p.bottom)
  const clamped = p.top <= 12 || p.bottom >= vh - 12
  expect(gap <= 16 || clamped, `gap ${gap}px between ${pop} and ${anchor}`).toBe(true)
  // and horizontally it starts at the anchor's edge (clamped to the viewport)
  expect(Math.abs(p.left - Math.max(8, Math.min(a.left, vw - (p.right - p.left) - 8)))).toBeLessThan(10)
}

test.describe('portalled popovers after folds while scrolled', () => {
  test('the role popover opens at its seat', async ({ page }) => {
    await boot(page, 'no-preference')
    await head(page, 'tuning').click()
    await settle(page)
    await head(page, 'tuning').click()
    await settle(page)
    await page.locator('.sb-body').evaluate((b) => b.scrollTo(0, 120))
    await settle(page)
    await page.locator('.rb-slot[data-role="danger"] .rb-add').click()
    await expect(page.locator('.rp-asg')).toBeVisible()
    await expectBesideAnchor(page, '.rp-asg', '.rb-slot[data-role="danger"] .rb-add')
  })

  test('the + add popover opens at its button', async ({ page }) => {
    await boot(page, 'no-preference')
    await head(page, 'riff').click()
    await settle(page)
    await head(page, 'colors').click()
    await settle(page)
    await head(page, 'colors').click()
    await settle(page)
    await page.locator('.sb-body').evaluate((b) => b.scrollTo(0, b.scrollHeight))
    await settle(page)
    await page.locator('.addsw').click()
    await expect(page.locator('.pk-pop')).toBeVisible()
    await expectBesideAnchor(page, '.pk-pop', '.addsw')
  })
})
