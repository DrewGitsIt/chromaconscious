import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * The App dashboard mockup is the theme's test bench, so every control in it
 * has to be *real* — each test drives a touchpoint and reads the change back.
 * A control that is deliberately dead must say so via `title`, and there are
 * tests for that too: a silently dead button is the bug this file guards.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** Boot past the hero into a forged theme, with frame A on the app mockup. */
const boot = async (page: Page) => {
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await page.locator('.frame-mockup').first().selectOption('app')
  await expect(page.locator('.preview-root')).toBeVisible()
}

const nav = (page: Page, i: number) => page.locator(`.nav-item:nth-child(${i})`)
const projects = async (page: Page) => {
  await nav(page, 2).click()
  await expect(page.locator('.act-deploy')).toBeVisible()
}
const settings = async (page: Page) => {
  await nav(page, 3).click()
  await expect(page.locator('.act-save')).toBeVisible()
}
const row = (page: Page, name: string) => page.getByRole('checkbox', { name: `Select ${name}` })
const toast = (page: Page) => page.locator('.app-toast')

/** Read an engine-generated CSS variable off the preview root (hex string). */
const previewVar = (page: Page, name: string) =>
  page
    .locator('.preview-root')
    .first()
    .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)

/** WCAG 2.x contrast between two `rgb()` strings. */
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

test.describe('table selection', () => {
  test('checking rows arms the archive button and marks the row selected', async ({ page }) => {
    await boot(page)
    await projects(page)
    const archive = page.locator('.act-archive')
    // zero selection: dead on purpose, and it says why
    await expect(archive).toBeDisabled()
    await expect(archive).toHaveAttribute('title', /Select at least one/)
    await expect(page.locator('tbody tr').first()).not.toHaveAttribute('data-state', 'selected')

    await row(page, 'marketing-site').click()
    await expect(page.locator('tbody tr').first()).toHaveAttribute('data-state', 'selected')
    await expect(archive).toBeEnabled()
    await expect(archive).toHaveText('Archive selected (1)')
    await expect(page.locator('[data-slot="card-description"]')).toHaveText('1 of 4 selected')

    await row(page, 'legacy-importer').click()
    await expect(archive).toHaveText('Archive selected (2)')
  })

  test('the header checkbox selects and clears every row in view', async ({ page }) => {
    await boot(page)
    await projects(page)
    const all = page.getByRole('checkbox', { name: 'Select every project in view' })
    await all.click()
    await expect(page.locator('.act-archive')).toHaveText('Archive selected (4)')
    await expect(page.locator('tbody tr[data-state="selected"]')).toHaveCount(4)
    await all.click()
    await expect(page.locator('.act-archive')).toHaveText('Archive selected')
    await expect(page.locator('tbody tr[data-state="selected"]')).toHaveCount(0)
  })

  test('archiving removes the rows; the toast puts them back', async ({ page }) => {
    await boot(page)
    await projects(page)
    await row(page, 'marketing-site').click()
    await row(page, 'docs-portal').click()
    await page.locator('.act-archive').click()
    await expect(page.locator('tbody tr')).toHaveCount(2)
    await expect(toast(page)).toContainText('Archived 2 projects')
    await expect(nav(page, 2)).toContainText('2')

    await page.locator('.toast-action').click()
    await expect(page.locator('tbody tr')).toHaveCount(4)
    await expect(toast(page)).toContainText('Restored')
  })
})

test.describe('deploy', () => {
  test('deploy all runs per-row, locks the buttons, and reports the failure', async ({ page }) => {
    await boot(page)
    await projects(page)
    const deploy = page.locator('.act-deploy')
    await expect(deploy).toBeEnabled()
    await expect(deploy).toHaveText('Deploy all (4)')

    await deploy.click()
    // in flight: both actions locked, and one row wears a live progress bar
    await expect(deploy).toBeDisabled()
    await expect(deploy).toHaveAttribute('title', 'A deploy is already running')
    await expect(page.locator('.act-archive')).toBeDisabled()
    await expect(page.locator('.row-progress')).toHaveCount(1)

    await expect(toast(page)).toContainText('1 of 4 deploys failed', { timeout: 10_000 })
    await expect(deploy).toBeEnabled()
    // the scripted failure is billing-service; everything else ends up live
    await expect(page.locator('tbody tr', { hasText: 'billing-service' })).toContainText('down')
    await expect(page.locator('tbody tr', { hasText: 'legacy-importer' })).toContainText('live')
    // and the dashboard feed recorded every step
    await nav(page, 1).click()
    await expect(page.locator('.feed')).toContainText('billing-service failed to deploy')
  })

  test('the failure toast opens the build it is talking about', async ({ page }) => {
    await boot(page)
    await projects(page)
    await page.locator('.act-deploy').click()
    await expect(toast(page)).toContainText('deploys failed', { timeout: 10_000 })
    await page.locator('.toast-action').click()
    await expect(page.locator('.log-drawer')).toContainText('billing-service · build #4821')
  })
})

test.describe('filter', () => {
  test('the filter menu narrows the table, empties it, and clears', async ({ page }) => {
    await boot(page)
    await projects(page)
    await expect(page.locator('tbody tr')).toHaveCount(4)

    await page.locator('.act-filter').click()
    await page.locator('.fs-live').click()
    await expect(page.locator('tbody tr')).toHaveCount(2)
    await expect(page.locator('.filter-count')).toHaveText('1')
    await expect(page.locator('[data-slot="card-description"]')).toHaveText('2 of 4 shown')

    // menu stays open, so the second axis stacks on the first
    await page.locator('.fo-ana').click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('.filter-count')).toHaveText('2')
    await expect(page.locator('.act-deploy')).toHaveText('Deploy all (1)')

    await page.locator('.fs-down').click()
    await expect(page.locator('tbody')).toContainText('No projects match this filter')
    await page.locator('.act-clear-filters').click()
    await expect(page.locator('tbody tr')).toHaveCount(4)
    await expect(page.locator('.filter-count')).toHaveCount(0)
  })
})

test.describe('log drawer', () => {
  test('view report opens level-coloured lines and closes again', async ({ page }) => {
    await boot(page)
    await expect(page.locator('.log-drawer')).toHaveCount(0)
    await page.locator('.act-view-report').click()
    const drawer = page.locator('.log-drawer')
    await expect(drawer).toContainText('Production deploy · report')
    await expect(drawer.locator('.log-line')).toHaveCount(6)
    // success / warning / muted all in one panel — the point of the fixture
    await expect(drawer.locator('.log-line[data-level="ok"]')).toHaveCount(2)
    await expect(drawer.locator('.log-line[data-level="warn"]')).toHaveCount(1)
    await expect(drawer.locator('.log-line[data-level="info"]')).toHaveCount(3)
    await page.locator('.drawer-close').click()
    await expect(page.locator('.log-drawer')).toHaveCount(0)
  })

  test('the alerts banner opens the failing build, and navigating closes it', async ({ page }) => {
    await boot(page)
    await page.locator('.tab-alerts').click()
    await page.locator('.act-view-logs').click()
    const drawer = page.locator('.log-drawer')
    await expect(drawer).toContainText('billing-service · build #4821')
    await expect(drawer.locator('.log-line[data-level="error"]')).toHaveCount(2)
    await nav(page, 2).click()
    await expect(page.locator('.log-drawer')).toHaveCount(0)
  })
})

test.describe('project detail', () => {
  test('a project link opens its page; back returns to the list', async ({ page }) => {
    await boot(page)
    await projects(page)
    await page.locator('.project-link', { hasText: 'billing-service' }).click()
    const detail = page.locator('.project-detail')
    await expect(detail).toContainText('billing-service')
    await expect(detail).toContainText('Recent deploys')
    await expect(detail).toContainText('eu-west-1')
    // no network in a mockup, so the outbound link says so instead of lying
    const openSite = page.getByRole('button', { name: 'Open site' })
    await expect(openSite).toBeDisabled()
    await expect(openSite).toHaveAttribute('title', /stubbed in this preview/)

    await page.getByRole('button', { name: 'View logs' }).click()
    await expect(page.locator('.log-drawer')).toContainText('billing-service · last 24h')
    await page.locator('.drawer-close').click()

    await page.locator('.detail-back').click()
    await expect(page.locator('.project-detail')).toHaveCount(0)
    await expect(page.locator('tbody tr')).toHaveCount(4)
  })
})

test.describe('settings form', () => {
  test('email validation paints the field and blocks the save', async ({ page }) => {
    await boot(page)
    await settings(page)
    const email = page.locator('#email-a')
    await expect(page.locator('.field-error')).toHaveCount(0)

    await email.fill('not-an-email')
    await expect(page.locator('.field-error')).toContainText('is not a valid email address')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('.act-save')).toBeDisabled()
    await expect(page.locator('.act-save')).toHaveAttribute('title', 'Fix the email address first')

    await email.fill('')
    await expect(page.locator('.field-error')).toContainText('Email is required')

    // cancel reverts to the saved value and the error goes with it
    await page.locator('.act-cancel').click()
    await expect(email).toHaveValue('ana@acme.com')
    await expect(page.locator('.field-error')).toHaveCount(0)
  })

  test('save goes pending, then confirms; a clean form has nothing to save', async ({ page }) => {
    await boot(page)
    await settings(page)
    const save = page.locator('.act-save')
    await expect(save).toBeDisabled()
    await expect(save).toHaveAttribute('title', 'Nothing changed yet')
    await expect(page.locator('.act-cancel')).toBeDisabled()

    await page.locator('#email-a').fill('ops@acme.com')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(save).toContainText('Saving…')
    await expect(toast(page)).toContainText('Team settings saved')
    // saved is the new clean state
    await expect(save).toBeDisabled()
  })

  test('the role select rewrites the permission list', async ({ page }) => {
    await boot(page)
    await settings(page)
    const granted = page.locator('.perms li[data-allowed="true"]')
    const roleValue = page.locator('.role-select [data-slot="select-value"]')
    await expect(roleValue).toHaveText('editor')
    await expect(granted).toHaveCount(3)

    await page.locator('.role-select').click()
    await page.getByRole('option', { name: 'Admin' }).click()
    await expect(roleValue).toHaveText('admin')
    await expect(granted).toHaveCount(5)

    await page.locator('.role-select').click()
    await page.getByRole('option', { name: 'Viewer' }).click()
    await expect(granted).toHaveCount(2)
    await expect(page.locator('.perms li', { hasText: 'Deploy to production' })).toHaveAttribute(
      'data-allowed',
      'false',
    )
  })

  test('the notifications switch gates the digest checkbox and the summary', async ({ page }) => {
    await boot(page)
    await settings(page)
    const digest = page.locator('#digest-a')
    await expect(digest).toBeEnabled()
    await expect(page.locator('.notify-summary')).toContainText('digest every Monday')

    await page.locator('label[for="digest-a"]').click()
    await expect(page.locator('.notify-summary')).toHaveText(
      "We'll email ana@acme.com on failed deploys.",
    )

    await page.locator('label[for="notif-a"]').click()
    await expect(digest).toBeDisabled()
    await expect(page.locator('label[for="digest-a"]')).toHaveAttribute(
      'title',
      'Turn email notifications on first',
    )
    await expect(page.locator('.notify-summary')).toContainText('Notifications are off')
  })

  test('delete team stays dead until the team name is typed exactly', async ({ page }) => {
    await boot(page)
    await settings(page)
    await page.locator('.act-delete').click()
    const confirm = page.locator('.act-confirm-delete')
    await expect(confirm).toBeDisabled()
    await expect(confirm).toHaveAttribute('title', /Type .Acme Web. exactly/)

    await page.locator('#del-a').fill('Acme')
    await expect(confirm).toBeDisabled()
    await page.locator('#del-a').fill('Acme Web')
    await expect(confirm).toBeEnabled()

    await confirm.click()
    await expect(page.locator('.restore-team')).toBeVisible()
    await expect(toast(page)).toContainText('will be deleted in 30 days')
    await page.locator('.toast-action').click()
    await expect(page.locator('.restore-team')).toHaveCount(0)
  })
})

/**
 * `destructive` + `destructive-foreground` is a pair the engine solves AND
 * contrast-checks, but every danger affordance in this app is the subtle
 * pairing, so the solid one was never drawn for anyone to judge. The type-to-
 * confirm delete is the one place that weight is earned; these specs pin it
 * there in both modes. `secondary-foreground` is checked alongside it — it is
 * painted by the primitives rather than by a class in the mockup, and "the
 * primitive renders it" is only a claim until the paint is read back.
 */
test.describe('solved pairs the mockup has to draw', () => {
  test('the delete confirm wears the solid destructive pair', async ({ page }) => {
    await boot(page)
    await settings(page)
    const destructive = await previewVar(page, '--destructive')
    const destructiveFg = await previewVar(page, '--destructive-foreground')

    await page.locator('.act-delete').click()
    const confirm = page.locator('.act-confirm-delete')
    await page.locator('#del-a').fill('Acme Web')
    await expect(confirm).toBeEnabled()

    await expect(confirm).toHaveCSS('background-color', hexToRgb(destructive))
    await expect(confirm).toHaveCSS('color', hexToRgb(destructiveFg))
    // the pair the engine checked is the pair on screen, at the ratio it solved
    const [fg, bg] = await confirm.evaluate((el) => [
      getComputedStyle(el).color,
      getComputedStyle(el).backgroundColor,
    ])
    expect(contrast(fg, bg)).toBeGreaterThan(4.4)

    // and the trigger beside it stays subtle, so the weight means something
    await page.keyboard.press('Escape')
    await expect(page.locator('.act-delete')).not.toHaveCSS(
      'background-color',
      hexToRgb(destructive),
    )
  })

  test('the solid pair is re-solved for dark, not reused from light', async ({ page }) => {
    await boot(page)
    const lightDestructive = await previewVar(page, '--destructive')
    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
    await settings(page)

    const darkDestructive = await previewVar(page, '--destructive')
    const darkFg = await previewVar(page, '--destructive-foreground')
    expect(darkDestructive).not.toBe(lightDestructive)

    await page.locator('.act-delete').click()
    await page.locator('#del-a').fill('Acme Web')
    const confirm = page.locator('.act-confirm-delete')
    await expect(confirm).toHaveCSS('background-color', hexToRgb(darkDestructive))
    await expect(confirm).toHaveCSS('color', hexToRgb(darkFg))
  })

  test('secondary-foreground is really painted, by the filter button and the queued badge', async ({
    page,
  }) => {
    await boot(page)
    await projects(page)
    const secondary = await previewVar(page, '--secondary')
    const secondaryFg = await previewVar(page, '--secondary-foreground')

    const filter = page.locator('.act-filter')
    await expect(filter).toHaveCSS('background-color', hexToRgb(secondary))
    await expect(filter).toHaveCSS('color', hexToRgb(secondaryFg))

    // the same pair shows up as a status: a deploy queues every row it touches
    await page.locator('.act-deploy').click()
    const queued = page.locator('tbody tr', { hasText: 'docs-portal' }).locator('[data-slot="badge"]')
    await expect(queued).toHaveText('queued')
    await expect(queued).toHaveCSS('background-color', hexToRgb(secondary))
    await expect(queued).toHaveCSS('color', hexToRgb(secondaryFg))
  })
})

test.describe('header actions', () => {
  test('every export item produces a visible result', async ({ page }) => {
    await boot(page)
    await page.locator('.act-export').click()
    await page.locator('.export-pdf').click()
    await expect(toast(page)).toContainText('Report exported as PDF')

    await page.locator('.act-export').click()
    await page.locator('.export-csv').click()
    await expect(page.locator('.toast-stack')).toContainText('4 rows exported to CSV')

    await page.locator('.act-export').click()
    await page.locator('.export-share').click()
    await expect(page.locator('.toast-stack')).toContainText('Share link copied')
    await expect(toast(page)).toHaveCount(3)
  })

  test('new project validates the name, then adds a real row', async ({ page }) => {
    await boot(page)
    await page.locator('.act-new').click()
    const create = page.locator('.act-create')
    await expect(create).toBeDisabled()
    await expect(create).toHaveAttribute('title', 'Name the project first')

    await page.locator('#np-a').fill('marketing-site')
    await expect(create).toBeDisabled()
    await expect(create).toHaveAttribute('title', 'That name is taken')

    await page.locator('#np-a').fill('status page')
    await expect(create).toBeEnabled()
    await create.click()
    await expect(page.locator('tbody tr')).toHaveCount(5)
    await expect(page.locator('tbody tr').last()).toContainText('status-page')
    await expect(nav(page, 2)).toContainText('5')
  })
})

test.describe('chart tokens', () => {
  test('the traffic card renders all five chart series and can single one out', async ({ page }) => {
    await boot(page)
    const card = page.locator('.traffic-card')
    await expect(card.locator('.traffic-bar > div')).toHaveCount(5)
    await expect(card.locator('.traffic-key')).toHaveCount(5)
    // chart-4 and chart-5 have no other home in this mockup
    const fills = await card.locator('.traffic-bar > div').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.background),
    )
    expect(fills).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
      'var(--chart-3)',
      'var(--chart-4)',
      'var(--chart-5)',
    ])

    await expect(card.locator('[data-slot="card-title"]')).toHaveText('12,904')
    await card.locator('.traffic-key', { hasText: 'Social' }).click()
    await expect(card.locator('[data-slot="card-title"]')).toHaveText('13%')
    await expect(card.locator('[data-slot="card-description"]')).toHaveText('Social')
    await card.locator('.traffic-key', { hasText: 'Social' }).click()
    await expect(card.locator('[data-slot="card-title"]')).toHaveText('12,904')
  })
})

test.describe('focus', () => {
  test('keyboard focus on the rail paints a ring in sidebar-ring', async ({ page }) => {
    await boot(page)
    await nav(page, 1).click()
    await page.keyboard.press('Tab')
    const focused = nav(page, 2)
    await expect(focused).toBeFocused()
    const ring = await focused.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { shadow: cs.boxShadow, token: cs.getPropertyValue('--sidebar-ring').trim() }
    })
    expect(ring.shadow).not.toBe('none')
    expect(ring.token).not.toBe('')
    // the ring is drawn from the sidebar's own ring token, not the app's
    expect(ring.shadow.toLowerCase()).toContain(hexToRgb(ring.token))
  })
})

test.describe('split view', () => {
  test('the two panes keep independent state and unique element ids', async ({ page }) => {
    await boot(page)
    await page.locator('.board-btn[title*="compare two frames"]').click()
    await expect(page.locator('.preview-root')).toHaveCount(2)
    const a = page.locator('.artboard').nth(0)
    const b = page.locator('.artboard').nth(1)

    await a.locator('.nav-item:nth-child(2)').click()
    await a.getByRole('checkbox', { name: 'Select marketing-site' }).click()
    await expect(a.locator('.act-archive')).toHaveText('Archive selected (1)')
    // B is untouched: still on the dashboard, nothing selected
    await expect(b.locator('header strong')).toHaveText('dashboard')
    await b.locator('.nav-item:nth-child(2)').click()
    await expect(b.locator('.act-archive')).toHaveText('Archive selected')

    await a.locator('.nav-item:nth-child(3)').click()
    await b.locator('.nav-item:nth-child(3)').click()
    await expect(page.locator('#email-a')).toHaveCount(1)
    await expect(page.locator('#email-b')).toHaveCount(1)
    await page.locator('#email-b').fill('bad')
    await expect(b.locator('.field-error')).toHaveCount(1)
    await expect(a.locator('.field-error')).toHaveCount(0)
  })
})

test.describe('dark mode', () => {
  test('every state the mockup can reach also renders dark', async ({ page }) => {
    await boot(page)
    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
    await projects(page)
    await row(page, 'marketing-site').click()
    await expect(page.locator('tbody tr').first()).toHaveAttribute('data-state', 'selected')
    await settings(page)
    await page.locator('#email-a').fill('nope')
    await expect(page.locator('.field-error')).toBeVisible()
    await expect(page.locator('.preview-root.dark')).toBeVisible()
  })
})

/**
 * Elevation is a *colour* decision the engine derives from the neutral seed, so
 * these specs read computed `box-shadow` back rather than looking at a picture.
 * Two things are being pinned:
 *
 *  · the level assigned to a surface matches what the surface means — resting
 *    (1), summoned (2), takes over the screen (3);
 *  · the string that paints is the engine's own, layer for layer. A portaled
 *    menu that never received `--elevation-2` renders with no shadow and says
 *    nothing about it, which is the single easiest failure to ship here.
 */

/** Every layer's geometry, in order. Matches both the engine's serialization
    (`0px 8px 20px -6px rgb(…)`) and Chrome's computed form, which moves the
    colour to the front but leaves the four lengths adjacent. */
const geometry = (css: string) => css.match(/-?\d+px -?\d+px -?\d+px -?\d+px/g) ?? []

/** The key layer that identifies each level — see GEOMETRY in engine/elevation.ts. */
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

/** The `--elevation-N` the frame actually resolved, read off the preview root. */
const elevationVar = (page: Page, level: 1 | 2 | 3) => previewVar(page, `--elevation-${level}`)

test.describe('elevation', () => {
  test('resting surfaces wear level 1, layer for layer from the engine', async ({ page }) => {
    await boot(page)
    const declared = await elevationVar(page, 1)
    expect(declared).not.toBe('')
    expect(declared).not.toBe('none')

    const painted = await shadowOf(page, '.stat-tile')
    expect(painted).not.toBe('none')
    // every layer the engine serialized is on the element, geometry for geometry
    for (const layer of geometry(declared)) expect(geometry(painted)).toContain(layer)
    expect(geometry(painted)).toContain(KEY_LAYER[1])

    // the ring the Card already had is still in the composite — elevation is
    // additive, so `separation: 'flat'` (where --elevation-1 is `none`) still
    // has a hairline doing the separating
    expect(geometry(painted)).toContain('0px 0px 0px 1px')

    // and in light the shadow is tinted by the neutral, never plain black —
    // read off the key layer, since Tailwind's unused slots are transparent
    // black and would satisfy a looser check
    const key = new RegExp(`rgba\\((\\d+), (\\d+), (\\d+), [\\d.]+\\) ${KEY_LAYER[1]}`)
    const tint = key.exec(painted)
    expect(tint, `no level-1 key layer in ${painted}`).not.toBeNull()
    expect(tint!.slice(1, 4).map(Number).some((c) => c > 0)).toBe(true)

    // the other resting surfaces agree
    for (const sel of ['.traffic-card', '.activity-card']) {
      expect(geometry(await shadowOf(page, sel)), sel).toContain(KEY_LAYER[1])
    }
  })

  test('a summoned menu is level 2, and the portal really resolved the variable', async ({
    page,
  }) => {
    await boot(page)
    await page.locator('.act-export').click()
    const menu = page.locator('[data-slot="dropdown-menu-content"]').first()
    await expect(menu).toBeVisible()

    // the menu mounts outside .preview-root: if style={vars} had not carried
    // the effects, this would be the empty string and the shadow would vanish
    const inherited = await menu.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--elevation-2').trim(),
    )
    expect(inherited).toBe(await elevationVar(page, 2))
    expect(inherited).not.toBe('')

    const painted = await menu.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(painted).not.toBe('none')
    expect(geometry(painted)).toContain(KEY_LAYER[2])
    // the primitive's hardcoded `shadow-md` lost — a hardcoded shadow is the
    // same class of lie as a hardcoded colour in a theme test bench
    expect(geometry(painted)).not.toContain('0px 4px 6px -1px')
    // a menu must not carry a dialog's weight
    expect(geometry(painted)).not.toContain(KEY_LAYER[3])
  })

  test('the select menu and the toasts are level 2 as well', async ({ page }) => {
    await boot(page)
    await settings(page)
    await page.locator('.role-select').click()
    const list = page.locator('[data-slot="select-content"]').first()
    await expect(list).toBeVisible()
    expect(geometry(await list.evaluate((el) => getComputedStyle(el).boxShadow))).toContain(
      KEY_LAYER[2],
    )
    await page.keyboard.press('Escape')

    // a toast floats over the page without taking it over: same weight
    await page.locator('.act-export').click()
    await page.locator('.export-pdf').click()
    await expect(toast(page)).toBeVisible()
    expect(geometry(await shadowOf(page, '.app-toast'))).toContain(KEY_LAYER[2])
  })

  test('a dialog takes over the screen, so it outranks the menu', async ({ page }) => {
    await boot(page)
    await settings(page)
    await page.locator('.act-delete').click()
    const dialog = page.locator('[data-slot="dialog-content"]').first()
    await expect(dialog).toBeVisible()

    const painted = await dialog.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(painted).not.toBe('none')
    expect(geometry(painted)).toContain(KEY_LAYER[3])
    expect(geometry(painted)).not.toContain(KEY_LAYER[2])
    await page.keyboard.press('Escape')

    // level 3 is genuinely a different surface from level 2, not a nudge
    await page.locator('.act-export').click()
    const menu = await page
      .locator('[data-slot="dropdown-menu-content"]')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow)
    expect(painted).not.toBe(menu)
  })

  test('the log drawer is level 3 — it owns the right edge of the frame', async ({ page }) => {
    await boot(page)
    await page.locator('.act-view-report').click()
    await expect(page.locator('.log-drawer')).toBeVisible()
    expect(geometry(await shadowOf(page, '.log-drawer'))).toContain(KEY_LAYER[3])
  })

  test('dark elevates with a lit top edge that light does not have', async ({ page }) => {
    await boot(page)
    // light: a drop shadow, and nothing inset
    const light = await shadowOf(page, '.stat-tile')
    expect(light).not.toBe('none')
    expect(light).not.toContain('inset')

    await page.getByRole('button', { name: 'switch frame A to dark' }).click()
    await expect(page.locator('.preview-root.dark')).toBeVisible()

    const dark = await shadowOf(page, '.stat-tile')
    expect(dark).not.toBe(light)
    // the one trick a drop shadow cannot perform: dark has no luminance room
    // below the page, so the separation comes from an inset highlight
    expect(dark).toContain('inset')
    expect(dark).toMatch(/rgba\(255, 255, 255, [\d.]+\) 0px 1px 0px 0px inset/)
    expect(geometry(dark)).toContain(KEY_LAYER[1])

    // and it is re-derived per mode, not reused
    for (const level of [1, 2, 3] as const) {
      expect(await elevationVar(page, level)).toContain('inset')
    }
  })

  /**
   * The constraint that matters most. `flat` pays for separation with
   * hairlines and has no level-1 shadow at all, so elevation has to be purely
   * additive: nothing may lean on a shadow that `flat` will not supply.
   *
   * There is a real trap under this. Tailwind builds `box-shadow` out of a
   * list of layer variables, and a list containing the keyword `none` is
   * invalid CSS — the browser discards the declaration and the Card's `ring-1`
   * goes with it. Routing `--elevation-1` straight into `shadow-[…]` therefore
   * *deletes the hairline* in exactly the setting that depends on it; see
   * `composable` in Preview.tsx.
   */
  test('flat keeps every hairline it pays with, and lifted outweighs layered', async ({
    page,
  }) => {
    await boot(page)
    const sep = (name: string) => page.locator(`.sep-opt[data-sep="${name}"]`)
    const ringOf = (shadow: string) => geometry(shadow).includes('0px 0px 0px 1px')

    await sep('flat').click()
    await expect(page.locator('.preview-root').first()).toBeVisible()
    expect(await elevationVar(page, 1)).toBe('0 0 #0000')
    // no drop shadow, and the ring is still there
    const flat = await shadowOf(page, '.stat-tile')
    expect(geometry(flat)).not.toContain(KEY_LAYER[1])
    expect(ringOf(flat), `flat lost the Card ring: ${flat}`).toBe(true)

    // the transient and blocking surfaces keep their hairline too
    await page.locator('.act-export').click()
    const menu = await page
      .locator('[data-slot="dropdown-menu-content"]')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ringOf(menu), `flat lost the menu ring: ${menu}`).toBe(true)
    await page.keyboard.press('Escape')

    // and lifted spends more shadow for the same geometry
    const alpha = (shadow: string) =>
      Number(new RegExp(`rgba\\(\\d+, \\d+, \\d+, ([\\d.]+)\\) ${KEY_LAYER[1]}`).exec(shadow)?.[1])
    await sep('layered').click()
    const layered = alpha(await shadowOf(page, '.stat-tile'))
    await sep('lifted').click()
    const lifted = alpha(await shadowOf(page, '.stat-tile'))
    expect(lifted).toBeGreaterThan(layered)
    expect(ringOf(await shadowOf(page, '.stat-tile'))).toBe(true)
  })

  test('the two split panes each define their own effects', async ({ page }) => {
    await boot(page)
    await page.locator('.board-btn[title*="compare two frames"]').click()
    await expect(page.locator('.preview-root')).toHaveCount(2)
    const shadows = await page
      .locator('.preview-root .stat-tile')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).boxShadow))
    expect(shadows.length).toBe(6)
    for (const s of shadows) expect(s).not.toBe('none')
  })
})

/** `#rrggbb` → the `rgb(r, g, b)` form computed styles report. */
function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`
}
