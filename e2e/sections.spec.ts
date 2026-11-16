/**
 * The pane's numbered sections: headers, folds, hotkeys, and the popovers
 * that live inside them.
 *
 * The section numbers are also the rail now, with a tracer threading them;
 * that behaviour (the scrollbar mapping, the push, reaching a section) is
 * pinned in guided-flow.spec.ts, the maths in tracer.test.ts.
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

test.describe('sections', () => {
  test('before any input the pane is away and holds nothing; it arrives with the theme', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.start-stage')).toBeVisible()
    await expect(page.locator('.sidebar-shell')).toHaveClass(/away/)
    await expect(page.locator('[data-sec]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Coastal starter' }).click()
    await expect(page.locator('.sidebar-shell')).not.toHaveClass(/away/)
    await expect(page.locator('[data-sec] .sec-label')).toHaveText(['colors', 'tuning', 'riff'])
    await expect(page.locator('.sidebar-shell').getByRole('button', { name: 'Export' })).toBeEnabled()
  })

  test('an emptied frame in a split gets the ways in back, in the pane', async ({ page }) => {
    await boot(page)
    await page.locator('.board-btn[title*="compare two frames"]').click()
    await page.locator('.sb-head-act').getByRole('button', { name: /start over/ }).click()
    await expect(page.locator('[data-sec="input"] .sec-label')).toHaveText('input')
    await expect(page.locator('.start-stage')).toHaveCount(0)
  })

  test('headers are reachable and foldable from the keyboard', async ({ page }) => {
    await boot(page)
    const tuning = head(page, 'tuning')
    await tuning.focus()
    // a new flow opens on colors; tuning waits folded
    await expect(tuning).toHaveAttribute('aria-expanded', 'false')
    // folded content is inert: the slider cannot take focus
    await expect(page.locator('.dial-slider')).not.toBeFocused()
    await page.keyboard.press('Enter')
    await expect(tuning).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(tuning).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Space')
    await expect(tuning).toHaveAttribute('aria-expanded', 'true')
    // the controls region it names is the body it folds
    const body = await tuning.getAttribute('aria-controls')
    await expect(page.locator(`[id="${body}"] .dial`)).toBeVisible()
  })

  test('a hotkey aimed at a folded section opens it and shows the result', async ({ page }) => {
    await boot(page)
    // riff waits folded in a new flow
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
