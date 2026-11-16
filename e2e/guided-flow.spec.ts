/**
 * The guided flow: the way in on the stage, and the rail that walks you
 * through colors → tuning → riff.
 *
 * Every behaviour here was tuned by hand on a trackpad against a mockup
 * (mockups/guided-flow-v7.html) and then pinned with the same measurements
 * the mockup's fixes were made with. Two of them exist because synthetic
 * input once hid a real bug: the recoil only showed when scrolling went on
 * THROUGH the pop, and the hop only showed frame by frame. So those two read
 * the tracer every animation frame rather than once at the end.
 */
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// Short enough that a theme overflows the pane, so the tracer has scroll to map.
test.use({ viewport: { width: 1400, height: 640 } })

async function boot(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion })
  await page.goto('/')
  await expect(page.locator('.start-stage')).toBeVisible()
}

/** Start a theme from a preset and let the pane arrive. */
async function start(page: Page, preset = 'Coastal starter') {
  await page.locator('.ss-preset', { hasText: preset }).click()
  await expect(page.locator('.role-board')).toBeVisible()
  await expect(page.locator('.sidebar-shell')).not.toHaveClass(/away/)
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

/** The rail, read straight off the DOM. */
function rail(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector('.sb-body') as HTMLElement
    const secs = [...body.querySelectorAll<HTMLElement>('.sb-body-inner > .sec')]
    const t = body.querySelector('.tracer') as HTMLElement
    const top = parseFloat(t.style.top || '0')
    return {
      open: secs.filter((s) => !s.classList.contains('shut')).map((s) => s.dataset.sec),
      here: secs.find((s) => s.hasAttribute('data-here'))?.dataset.sec,
      visited: secs.filter((s) => s.hasAttribute('data-visited')).map((s) => s.dataset.sec),
      tip: top + parseFloat(t.style.height || '0'),
      node: Object.fromEntries(secs.map((s) => [s.dataset.sec, s.offsetTop + 12])),
      scrollTop: body.scrollTop,
      max: body.scrollHeight - body.clientHeight,
    }
  })
}

const head = (page: Page, id: string) => page.locator(`[data-sec="${id}"] .sec-toggle`)

/** Put the pointer over the pane, so a wheel lands there. */
async function overPane(page: Page) {
  const b = (await page.locator('.sb-body').boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + 120)
}

async function toEnd(page: Page) {
  await page.evaluate(() => {
    const b = document.querySelector('.sb-body') as HTMLElement
    b.scrollTop = b.scrollHeight
  })
  await page.waitForTimeout(50)
}

test.describe('the way in', () => {
  test('the stage is the way in, over a live specimen; the pane waits off the edge', async ({ page }) => {
    await boot(page)
    await expect(page.locator('.sidebar-shell')).toHaveClass(/away/)
    await expect(page.locator('.artboard')).toHaveClass(/under/)
    await expect(page.locator('.frame .preview-root')).toBeVisible()
    await expect(page.locator('.frame-mockup')).toHaveValue('marketing')
    await expect(page.locator('.ss-panel')).toHaveCount(3)
  })

  test('hovering a preset repaints the specimen; leaving puts it back', async ({ page }) => {
    await boot(page)
    const paint = () => page.locator('.frame .preview-root').getAttribute('style')
    const before = await paint()
    await page.locator('.ss-preset', { hasText: 'Neon arcade' }).hover()
    await expect.poll(paint).not.toBe(before)
    await page.mouse.move(5, 5)
    await expect.poll(paint).toBe(before)
  })

  test('a color takes several: Enter adds, × and Backspace remove, Paint paints them', async ({ page }) => {
    await boot(page)
    const field = page.locator('.ss-hex')
    await field.fill('#e63946')
    await field.press('Enter')
    await field.fill('#457b9d, rgb(241, 250, 238)')
    await field.press('Enter')
    await expect(page.locator('.ss-coin')).toHaveCount(3)
    await expect(field).toHaveValue('')
    // a duplicate is ignored
    await field.fill('#e63946')
    await field.press('Enter')
    await expect(page.locator('.ss-coin')).toHaveCount(3)
    // the specimen paints what you have chosen, before you commit
    const style = await page.locator('.frame .preview-root').getAttribute('style')
    await page.locator('.ss-coin').nth(1).hover()
    await page.getByRole('button', { name: 'remove #457b9d' }).click()
    await expect(page.locator('.ss-coin')).toHaveCount(2)
    await expect.poll(() => page.locator('.frame .preview-root').getAttribute('style')).not.toBe(style)
    await field.press('Backspace')
    await expect(page.locator('.ss-coin')).toHaveCount(1)
    // unreadable input is refused with a reason, and nothing starts
    await field.fill('nope')
    await page.locator('.ss-paint').click()
    await expect(page.locator('.ss-problem')).toContainText('nope')
    await expect(page.locator('.start-stage')).toBeVisible()
    await field.fill('')
    await page.locator('.ss-paint').click()
    await expect(page.locator('.role-board')).toBeVisible()
    await expect(page.locator('.rb-slot[data-role="primary"] .rb-in')).toContainText('#e63946')
  })

  test('closing the picker on a new color adds it', async ({ page }) => {
    await boot(page)
    await page.locator('.ss-swatch').click()
    await page.locator('.ss-pop input').fill('2a9d8f')
    await page.locator('.ss-title').click() // outside: the picker closes
    await expect(page.locator('.ss-coin')).toHaveCount(1)
    await expect(page.locator('.ss-coin')).toHaveAttribute('title', /#2a9d8f/)
  })
})

test.describe('the rail', () => {
  test('a new flow opens on colors; tuning and riff wait folded and the rail starts at 1', async ({ page }) => {
    await boot(page)
    await start(page)
    const r = await rail(page)
    expect(r.open).toEqual(['colors'])
    expect(r.here).toBe('colors')
    expect(r.visited).toEqual(['colors'])
    expect(r.tip).toBeCloseTo(r.node.colors, 0)
  })

  test('the tracer maps scroll like a scrollbar, and climbs back when you scroll up', async ({ page }) => {
    await boot(page)
    await start(page)
    const r0 = await rail(page)
    expect(r0.max).toBeGreaterThan(50)
    const tips: number[] = []
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate((frac) => {
        const b = document.querySelector('.sb-body') as HTMLElement
        b.scrollTop = (b.scrollHeight - b.clientHeight) * frac
      }, f)
      await page.waitForTimeout(40)
      tips.push((await rail(page)).tip)
    }
    for (let i = 1; i < tips.length; i++) expect(tips[i]).toBeGreaterThan(tips[i - 1])
    await page.evaluate(() => ((document.querySelector('.sb-body') as HTMLElement).scrollTop = 0))
    await page.waitForTimeout(40)
    expect((await rail(page)).tip).toBeCloseTo(r0.node.colors, 0)
  })

  test('a header click unfolds the section, lights its number, and the tracer reaches it', async ({ page }) => {
    await boot(page)
    await start(page)
    await head(page, 'tuning').click()
    await settle(page)
    const r = await rail(page)
    expect(r.open).toContain('tuning')
    expect(r.here).toBe('tuning')
    expect(r.visited).toContain('tuning')
    expect(r.tip).toBeGreaterThanOrEqual(r.node.tuning - 1)
  })

  test('opening riff directly runs the tracer through tuning to riff', async ({ page }) => {
    await boot(page)
    await start(page)
    await head(page, 'riff').click()
    await settle(page)
    const r = await rail(page)
    expect(r.open).toEqual(['colors', 'riff'])
    expect(r.here).toBe('riff')
    expect(r.visited).toEqual(['colors', 'tuning', 'riff'])
    expect(r.tip).toBeGreaterThanOrEqual(r.node.riff - 1)
  })

  test('folding a section moves the tracer back to the last one open', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1900 }) // nothing scrolls: focus rules
    await boot(page)
    await start(page)
    await head(page, 'tuning').click()
    await settle(page)
    expect((await rail(page)).here).toBe('tuning')
    await head(page, 'tuning').click()
    await settle(page)
    const r = await rail(page)
    expect(r.here).toBe('colors')
    expect(r.tip).toBeCloseTo(r.node.colors, 0)
  })

  test('a hotkey aimed at a folded section opens it and lights it', async ({ page }) => {
    await boot(page)
    await start(page)
    await page.keyboard.press('r')
    await settle(page)
    const r = await rail(page)
    expect(r.open).toContain('riff')
    expect(r.here).toBe('riff')
    await expect(page.locator('.ctl-hop')).toHaveText('1')
  })
})

test.describe('the push', () => {
  test('40px of scroll past the end unfolds the next section; less does not', async ({ page }) => {
    await boot(page)
    await start(page)
    await toEnd(page)
    await overPane(page)
    await page.mouse.wheel(0, 20)
    await page.waitForTimeout(40)
    let r = await rail(page)
    expect(r.open).toEqual(['colors'])
    expect(await page.locator('[data-sec="tuning"]').getAttribute('data-armed')).toBe('')
    // scrolling back up cancels the push outright
    await page.mouse.wheel(0, -10)
    await page.waitForTimeout(40)
    expect(await page.locator('[data-sec="tuning"]').getAttribute('data-armed')).toBeNull()
    await toEnd(page)
    await page.mouse.wheel(0, 20)
    await page.mouse.wheel(0, 25)
    await settle(page)
    r = await rail(page)
    expect(r.open).toEqual(['colors', 'tuning'])
    expect(r.here).toBe('tuning')
  })

  test('a push left unfinished drains away', async ({ page }) => {
    await boot(page)
    await start(page)
    await toEnd(page)
    await overPane(page)
    await page.mouse.wheel(0, 25)
    await expect(page.locator('[data-sec="tuning"]')).toHaveAttribute('data-armed', '')
    await expect
      .poll(() => page.locator('[data-sec="tuning"]').getAttribute('data-armed'), { timeout: 2000 })
      .toBeNull()
    expect((await rail(page)).open).toEqual(['colors'])
  })

  // Decided by hand: no "arrive, then push" pause. A long enough flick can
  // carry on through the next section too; that is the same rule, twice.
  test('a flick that reaches the end pushes straight through', async ({ page }) => {
    await boot(page)
    await start(page)
    await overPane(page)
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 60)
    await settle(page)
    expect((await rail(page)).open).toContain('tuning')
  })

  /**
   * The recoil: a real trackpad keeps scrolling through the pop. Unanchored,
   * the taller pane mapped the same scrollTop ~380px higher and the tracer
   * fell back up the rail. Read every frame, from the pop on.
   */
  test('scrolling on through the pop never moves the tracer back up', async ({ page }) => {
    await boot(page, 'no-preference')
    await start(page)
    await toEnd(page)
    await overPane(page)
    await page.evaluate(() => {
      const w = window as unknown as { __tips: number[] }
      w.__tips = []
      const t0 = performance.now()
      const rec = () => {
        const t = document.querySelector('.tracer') as HTMLElement
        const tuning = document.querySelector('[data-sec="tuning"]') as HTMLElement
        if (!tuning.classList.contains('shut'))
          w.__tips.push(parseFloat(t.style.top) + parseFloat(getComputedStyle(t).height))
        if (performance.now() - t0 < 2500) requestAnimationFrame(rec)
      }
      requestAnimationFrame(rec)
    })
    for (let i = 0; i < 36; i++) {
      await page.mouse.wheel(0, 14)
      await page.waitForTimeout(16)
    }
    for (let v = 14; v > 0.6; v *= 0.94) {
      await page.mouse.wheel(0, v)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(600)
    const tips = await page.evaluate(() => (window as unknown as { __tips: number[] }).__tips)
    expect(tips.length).toBeGreaterThan(10)
    const falls = tips.slice(1).filter((y, i) => y < tips[i] - 4)
    expect(falls).toEqual([])
  })

  /** The hop: opening a section used to dip the tracer ~200px and climb back. */
  test('opening a section moves the tracer one way only', async ({ page }) => {
    await boot(page, 'no-preference')
    await start(page)
    await toEnd(page)
    await page.evaluate(() => {
      const w = window as unknown as { __tips: number[] }
      w.__tips = []
      const t0 = performance.now()
      const rec = () => {
        const t = document.querySelector('.tracer') as HTMLElement
        w.__tips.push(parseFloat(t.style.top) + parseFloat(getComputedStyle(t).height))
        if (performance.now() - t0 < 2000) requestAnimationFrame(rec)
      }
      requestAnimationFrame(rec)
    })
    await head(page, 'tuning').click()
    await page.waitForTimeout(2100)
    const tips = await page.evaluate(() => (window as unknown as { __tips: number[] }).__tips)
    const falls = tips.slice(1).filter((y, i) => y < tips[i] - 2)
    expect(falls).toEqual([])
  })
})

test.describe('the push by touch', () => {
  test.use({ hasTouch: true })

  test('a finger dragging up past the end unfolds the next section', async ({ page, context }) => {
    await boot(page)
    await start(page)
    await toEnd(page)
    const cdp = await context.newCDPSession(page)
    const b = (await page.locator('.sb-body').boundingBox())!
    const x = b.x + 120
    const drag = async (y0: number, y1: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
      for (let i = 1; i <= 10; i++)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    await drag(b.y + 300, b.y + 140)
    await settle(page)
    expect((await rail(page)).open).toEqual(['colors', 'tuning'])
  })
})

test.describe('the way out', () => {
  test('start over goes back to the start screen, and undo brings the theme back', async ({ page }) => {
    await boot(page)
    await start(page)
    await page.locator('.sb-head-act').getByRole('button', { name: /start over/ }).click()
    await expect(page.locator('.start-stage')).toBeVisible()
    await expect(page.locator('.sidebar-shell')).toHaveClass(/away/)
    await page.getByRole('button', { name: 'undo' }).click()
    await expect(page.locator('.start-stage')).toHaveCount(0)
    await expect(page.locator('.role-board')).toBeVisible()
  })
})

test.describe('riff', () => {
  test('after a riff the trail is in view, not under the footer', async ({ page }) => {
    await boot(page)
    await start(page)
    await head(page, 'riff').click()
    await settle(page)
    await page.locator('.stage').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('r')
    await page.keyboard.press('r')
    await settle(page)
    const { trail, mid } = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
      return { trail: r('.trail'), mid: r('.sb-mid') }
    })
    expect(trail.bottom).toBeLessThanOrEqual(mid.bottom + 1)
    expect(trail.top).toBeGreaterThanOrEqual(mid.top - 1)
  })
})
