import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * The marketing mockup is the one that fills LARGE fields with the brand color,
 * so these specs check two different things: that every control on the page is
 * real (state read back across a click, never just "it rendered"), and that the
 * big fields are painted with the pair the engine actually solved.
 */

/** Boot past the hero into a theme, then point frame A at the marketing page. */
const boot = async (page: Page, preset = 'Coastal starter') => {
  await page.goto('/')
  await page.getByRole('button', { name: preset }).click()
  await expect(page.locator('.preview-root').first()).toBeVisible()
  await page.locator('.frame-mockup').first().selectOption('marketing')
  await expect(page.locator('.mkt-hero').first()).toBeVisible()
}

/** Read an engine-generated CSS variable off the preview root (hex string). */
const previewVar = (page: Page, name: string) =>
  page
    .locator('.preview-root')
    .first()
    .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)

/** #rrggbb -> the rgb(r, g, b) string computed styles report. */
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** Computed `box-shadow` of the first match — the string the browser resolved. */
const shadowOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).boxShadow)

/**
 * The largest px magnitude in a computed shadow — blur on these levels. A
 * cheap, format-independent way to say "level 2 is a bigger shadow than
 * level 1" without re-deriving the engine's geometry in the test.
 */
const shadowReach = (shadow: string) =>
  Math.max(...(shadow.match(/-?[\d.]+px/g) ?? ['0px']).map((n) => Math.abs(parseFloat(n))))

/** WCAG 2.x contrast between two rgb() strings. */
const contrast = (a: string, b: string) => {
  const lum = (c: string) => {
    const [r, g, bl] = c.match(/[\d.]+/g)!.slice(0, 3).map(Number)
    const ch = [r, g, bl].map((x) => {
      const s = x / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test.describe('the marketing page as a large-field brand test', () => {
  test('the hero is a genuinely large brand field wearing the solved pair', async ({ page }) => {
    await boot(page)
    const primary = await previewVar(page, '--primary')
    const primaryFg = await previewVar(page, '--primary-foreground')
    const hero = page.locator('.mkt-hero')

    await expect(hero).toHaveCSS('background-color', hexToRgb(primary))
    // The headline inherits the section's color — the pair the engine solved,
    // not `foreground` eyeballed against the fill.
    await expect(hero.locator('h1')).toHaveCSS('color', hexToRgb(primaryFg))

    // "Large" is the whole point: the field has to own a real share of the frame.
    const box = await hero.boundingBox()
    expect(box!.height).toBeGreaterThan(400)

    // and nothing on the fill is diluted below the ratio that was solved for
    const heroBg = await hero.evaluate((el) => getComputedStyle(el).backgroundColor)
    for (const sel of ['h1', 'p', '.mkt-hero-cta2']) {
      const fg = await hero.locator(sel).first().evaluate((el) => getComputedStyle(el).color)
      expect(contrast(fg, heroBg), `${sel} on the brand field`).toBeGreaterThan(4.4)
    }
  })

  test('the brand field is repainted from the dark solve, not reused', async ({ page }) => {
    await boot(page)
    const lightPrimary = await previewVar(page, '--primary')
    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
    const darkPrimary = await previewVar(page, '--primary')
    const darkPrimaryFg = await previewVar(page, '--primary-foreground')
    expect(darkPrimary).not.toBe(lightPrimary)
    await expect(page.locator('.mkt-hero')).toHaveCSS('background-color', hexToRgb(darkPrimary))
    await expect(page.locator('.mkt-hero h1')).toHaveCSS('color', hexToRgb(darkPrimaryFg))
    // the closing band is the same pair at a different size, and must follow
    await expect(page.locator('.mkt-cta-band')).toHaveCSS(
      'background-color',
      hexToRgb(darkPrimary),
    )
  })

  test('the billing toggle actually rewrites the prices', async ({ page }) => {
    await boot(page)
    await expect(page.locator('.mkt-price').first()).toHaveText('$15')
    await expect(page.locator('.mkt-plan-summary')).toHaveText(/billed monthly/)

    await page.locator('.mkt-billing-annual').click()

    await expect(page.locator('.mkt-price').first()).toHaveText('$12')
    await expect(page.locator('.mkt-price').nth(1)).toHaveText('$36')
    await expect(page.locator('.mkt-price').nth(2)).toHaveText('$76')
    // the discount is stated, so state it truthfully: 20% off, $108/yr on Growth
    await expect(page.locator('.mkt-plan-summary')).toHaveText(/saving \$108 a year/)
    await expect(page.locator('.mkt-billing-annual')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.mkt-billing-monthly')).toHaveAttribute('aria-pressed', 'false')

    await page.locator('.mkt-billing-monthly').click()
    await expect(page.locator('.mkt-price').first()).toHaveText('$15')
  })

  test('choosing a tier selects it and renames the page CTA', async ({ page }) => {
    await boot(page)
    const growth = page.locator('.mkt-tier[data-tier="growth"]')
    const scale = page.locator('.mkt-tier[data-tier="scale"]')
    await expect(growth).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.mkt-plan-cta')).toHaveText(/Start Growth — \$45\/mo/)

    await scale.click()

    await expect(scale).toHaveAttribute('aria-pressed', 'true')
    await expect(growth).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.mkt-plan-cta')).toHaveText(/Start Scale — \$95\/mo/)
    await expect(page.locator('.mkt-plan-summary')).toHaveText(/^Scale selected/)

    // selection speaks accent-strong so it never competes with the brand fill;
    // the ring is a box-shadow, which is also what keeps it clear of the outline
    // that focus paints in the `ring` token
    const strong = await previewVar(page, '--accent-strong')
    expect(await scale.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(
      hexToRgb(strong),
    )
    expect(await growth.evaluate((el) => getComputedStyle(el).boxShadow)).not.toContain(
      hexToRgb(strong),
    )

    // and the two toggles compose: annual + Scale
    await page.locator('.mkt-billing-annual').click()
    await expect(page.locator('.mkt-plan-cta')).toHaveText(/Start Scale — \$76\/mo/)

    // the brand-filled tier cannot wear accent-strong — that was solved against
    // `background`, not against `primary` — so its ring switches to the pair
    // that was solved against the fill it sits on
    const primaryFg = await previewVar(page, '--primary-foreground')
    await growth.click()
    expect(await growth.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(
      hexToRgb(primaryFg),
    )
  })

  test('the two-year option is visibly dead and says why', async ({ page }) => {
    await boot(page)
    const twoYear = page.locator('.mkt-billing-2y')
    await expect(twoYear).toBeDisabled()
    await expect(twoYear).toHaveAttribute('aria-disabled', 'true')
    await expect(twoYear).toHaveAttribute('title', /talk to sales/)
    await expect(twoYear).toHaveCSS('text-decoration-line', 'line-through')

    // clicking it changes nothing — no click gets swallowed silently
    await page.locator('.mkt-billing-annual').click()
    await expect(page.locator('.mkt-price').first()).toHaveText('$12')
    await twoYear.click({ force: true })
    await expect(page.locator('.mkt-price').first()).toHaveText('$12')
    await expect(page.locator('.mkt-billing-annual')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the FAQ opens and closes, many at a time', async ({ page }) => {
    await boot(page)
    const panels = page.locator('.mkt-faq-panel')
    await expect(panels).toHaveCount(1)

    await page.locator('.mkt-faq-item[data-faq="export"] button').click()
    await expect(panels).toHaveCount(2)
    await page.locator('.mkt-faq-item[data-faq="cancel"] button').click()
    await expect(panels).toHaveCount(3)
    await expect(page.locator('.mkt-faq-item[data-faq="cancel"] button')).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await page.locator('.mkt-faq-item[data-faq="billing"] button').click()
    await expect(panels).toHaveCount(2)
    await expect(page.locator('.mkt-faq-item[data-faq="billing"] button')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  test('the email capture has three real states, in destructive and success', async ({ page }) => {
    await boot(page)
    const msg = page.locator('.mkt-email-msg')
    const field = page.locator('.mkt-email')
    const destructive = await previewVar(page, '--destructive')
    const success = await previewVar(page, '--success')

    // empty
    await page.locator('.mkt-email-submit').click()
    await expect(msg).toHaveText(/Enter an email address first/)
    await expect(page.locator('.mkt-email-error')).toHaveCSS('color', hexToRgb(destructive))
    await expect(field).toHaveAttribute('aria-invalid', 'true')

    // malformed
    await field.fill('ana@halcyon')
    await page.locator('.mkt-email-submit').click()
    await expect(msg).toHaveText(/not a valid email address/)
    await expect(page.locator('.mkt-email-error')).toHaveCSS('color', hexToRgb(destructive))

    // success, and it echoes what was actually typed
    await field.fill('ana@halcyon.dev')
    await page.locator('.mkt-email-submit').click()
    await expect(msg).toHaveText(/Sent — check ana@halcyon\.dev/)
    await expect(page.locator('.mkt-email-ok')).toHaveCSS('border-top-color', hexToRgb(success))
    await expect(page.locator('.mkt-email-error')).toHaveCount(0)
    await expect(field).toHaveAttribute('aria-invalid', 'false')
  })

  test('the product menu opens, closes, carries a disabled item, and is themed', async ({
    page,
  }) => {
    await boot(page)
    const trigger = page.locator('.mkt-product-trigger')
    await expect(page.locator('.mkt-product-menu')).toHaveCount(0)

    await trigger.click()
    const menu = page.locator('.mkt-product-menu')
    await expect(menu).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    // the portal mounts outside .preview-root, so this proves it got style={vars}
    const popover = await previewVar(page, '--popover')
    await expect(menu).toHaveCSS('background-color', hexToRgb(popover))

    const soon = page.locator('.mkt-menu-soon')
    await expect(soon).toHaveAttribute('data-disabled', '')
    await expect(soon).toHaveAttribute('title', /Q3 release/)

    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  test('keyboard focus paints a visible ring in the ring token', async ({ page }) => {
    await boot(page)
    const ring = await previewVar(page, '--ring')
    // click one accordion header, then Tab: the next header takes keyboard focus
    await page.locator('.mkt-faq-item[data-faq="billing"] button').click()
    await page.keyboard.press('Tab')
    const next = page.locator('.mkt-faq-item[data-faq="export"] button')
    await expect(next).toBeFocused()
    await expect(next).toHaveCSS('outline-color', hexToRgb(ring))
    await expect(next).toHaveCSS('outline-width', '2px')
    // style matters as much as width: Tailwind v4's `outline-none` would pin
    // --tw-outline-style to none and paint a 2px outline of nothing
    await expect(next).toHaveCSS('outline-style', 'solid')

    // an unfocused sibling has no ring at all, so the one above is really focus
    await expect(page.locator('.mkt-faq-item[data-faq="cancel"] button')).toHaveCSS(
      'outline-style',
      'none',
    )
  })

  test('split panes keep independent state and uid-scoped ids', async ({ page }) => {
    await boot(page)
    await page.locator('.sec-act .mini[title*="compare two frames"]').click()
    await expect(page.locator('.preview-root')).toHaveCount(2)

    const a = page.locator('.split-pane').nth(0)
    const b = page.locator('.split-pane').nth(1)

    // ids must differ or labels bind across panes
    await expect(a.locator('.mkt-email')).toHaveAttribute('id', 'mkt-email-a')
    await expect(b.locator('.mkt-email')).toHaveAttribute('id', 'mkt-email-b')

    // state must not be hoisted out of the component
    await a.locator('.mkt-billing-annual').click()
    await expect(a.locator('.mkt-price').first()).toHaveText('$12')
    await expect(b.locator('.mkt-price').first()).toHaveText('$15')

    await b.locator('.mkt-tier[data-tier="starter"]').click()
    await expect(a.locator('.mkt-plan-cta')).toHaveText(/Start Growth/)
    await expect(b.locator('.mkt-plan-cta')).toHaveText(/Start Starter/)

    // the narrow panes reveal the compact nav, which is a real toggle
    const toggle = a.locator('.mkt-nav-toggle')
    await expect(toggle).toBeVisible()
    await expect(a.locator('.mkt-nav-panel')).toHaveCount(0)
    await toggle.click()
    await expect(a.locator('.mkt-nav-panel')).toBeVisible()
    await expect(b.locator('.mkt-nav-panel')).toHaveCount(0)
    await toggle.click()
    await expect(a.locator('.mkt-nav-panel')).toHaveCount(0)
  })

  /* ------------------------------------------------------------- elevation */

  test('resting surfaces wear level 1 and summoned ones wear level 2', async ({ page }) => {
    await boot(page)
    // The theme really did serialize the effects onto the mockup's root.
    const level1 = await previewVar(page, '--elevation-1')
    const level2 = await previewVar(page, '--elevation-2')
    expect(level1).not.toBe('none') // true at the default `layered`
    expect(level2).not.toBe('none')

    const feature = await shadowOf(page, '.mkt-feature')
    const tier = await shadowOf(page, '.mkt-tier-lift:not(.mkt-tier-lift-2)')
    const popular = await shadowOf(page, '.mkt-tier-lift-2')

    // resting: painted with the level-1 value itself (a `shadow-*` class that
    // lands as a shadow *color* instead would leave the geometry at zero and
    // still not be `none`), and painted the same at the same level
    expect(feature).not.toBe('none')
    expect(shadowReach(feature)).toBe(shadowReach(level1))
    expect(tier).toBe(feature)

    // the "most popular" tier is a level above its neighbours, not a nudge
    expect(popular).not.toBe(tier)
    expect(shadowReach(popular)).toBe(shadowReach(level2))
    expect(shadowReach(popular)).toBeGreaterThan(shadowReach(tier))

    // the compact nav panel is summoned, so it sits at the menu's level
    await page.locator('.sec-act .mini[title*="compare two frames"]').click()
    const pane = page.locator('.split-pane').nth(0)
    await pane.locator('.mkt-nav-toggle').click()
    const panel = await pane
      .locator('.mkt-nav-panel')
      .evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadowReach(panel)).toBe(shadowReach(popular))
  })

  test('the portaled menu carries the effects, not just the colors', async ({ page }) => {
    await boot(page)
    const rootLevel2 = await previewVar(page, '--elevation-2')
    await page.locator('.mkt-product-trigger').click()
    const menu = page.locator('.mkt-product-menu')
    await expect(menu).toBeVisible()

    // A portal mounts outside .preview-root: without style={vars} it would
    // resolve --elevation-2 to nothing and render shadowless, silently.
    expect(
      await menu.evaluate((el) => getComputedStyle(el).getPropertyValue('--elevation-2').trim()),
    ).toBe(rootLevel2)
    // and the level-2 value is what it actually paints — shadcn ships the
    // popup with `shadow-md`, which tailwind-merge only drops for a class it
    // recognises as a *shadow* rather than a shadow colour
    const shadow = await menu.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow).not.toBe('none')
    expect(shadowReach(shadow)).toBe(shadowReach(rootLevel2))
  })

  test('dark elevates with a lit top edge that light mode does not have', async ({ page }) => {
    await boot(page)
    const lightCard = await shadowOf(page, '.mkt-feature')
    expect(lightCard).not.toContain('inset')

    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()

    const darkCard = await shadowOf(page, '.mkt-feature')
    expect(darkCard).not.toBe('none')
    expect(darkCard).not.toBe(lightCard)
    // dark has no luminance room below the page, so the separation is a lit
    // top edge — an inset layer a drop shadow cannot imitate
    expect(darkCard).toContain('inset')
    expect(await shadowOf(page, '.mkt-tier-lift-2')).toContain('inset')
  })

  test('a card that also wears a ring survives an empty level 1', async ({ page }) => {
    // Under `separation: 'flat'` level 1 carries no shadow. The engine spells
    // that `0 0 #0000` rather than the `none` KEYWORD precisely because `none`
    // inside a composed box-shadow list is invalid and would take the ring with
    // it — this test drives the real emitted value, and elevation still lives
    // on a wrapper rather than on the ringed button so the two never share a
    // declaration. Driven through the real control below.
    await boot(page)
    await page.locator('.sep-opt[data-sep="flat"]').click()
    const strong = await previewVar(page, '--accent-strong')
    const scale = page.locator('.mkt-tier[data-tier="scale"]')
    await scale.click()
    await expect(scale).toHaveAttribute('aria-pressed', 'true')

    expect(await scale.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(
      hexToRgb(strong),
    )
    // The lift itself goes flat. It does NOT compute to `none` — it computes
    // to a list of fully transparent layers, which is exactly the point: the
    // declaration survives (so anything composed beside it survives too) while
    // painting nothing.
    const lift = await shadowOf(page, '.mkt-tier-lift:has([data-tier="scale"])')
    expect(lift).not.toBe('none')
    expect(lift.replace(/rgba\(0, 0, 0, 0\)|0px|,|\s/g, '')).toBe('')
    // level 2 is never empty, so the summoned surfaces keep their depth
    expect(await shadowOf(page, '.mkt-tier-lift-2')).not.toBe('none')
  })

  test('a pale seed still lands a legal pair on the field it fills', async ({ page }) => {
    // Pastel picnic seeds #ffadad — too light to carry text, so the engine has to
    // move it. This is the case where a large field is most likely to go wrong.
    await boot(page, 'Pastel picnic')
    const hero = page.locator('.mkt-hero')
    const [bg, fg] = await hero.evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(el.querySelector('h1')!).color,
    ])
    expect(contrast(fg, bg)).toBeGreaterThan(4.4)
  })
})
