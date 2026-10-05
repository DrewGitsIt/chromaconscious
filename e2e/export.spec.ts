/**
 * The Export dialog, in a real browser: it opens beside the pane, the keyboard
 * drives it, Copy puts the API's bytes on the clipboard, Esc hands focus back,
 * and the backdrop never touches the swatches the user judges colour with.
 */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

const exportBtn = (page: Page) => page.locator('.sidebar-shell').getByRole('button', { name: 'Export' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export' })
const tab = (page: Page, name: RegExp) => dialog(page).getByRole('tab', { name })

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Coastal starter' }).click()
  await expect(page.locator('.role-board')).toBeVisible()
}

async function open(page: Page) {
  await exportBtn(page).click()
  await expect(dialog(page)).toBeVisible()
  // the id is hashed when the dialog opens; everything waits on it
  await expect(dialog(page).locator('.xd-id')).toHaveText(/^t_[a-z2-7]{12}$/)
}

test('before any input Export is there, greyed, says why, and a press does nothing', async ({ page }) => {
  await page.goto('/')
  const btn = exportBtn(page)
  await expect(btn).toBeVisible()
  await expect(btn).toBeDisabled() // aria-disabled: announced as dimmed, still focusable
  await expect(btn).toHaveAccessibleDescription(
    'add a color to export CSS, Tailwind, Figma variables or a share link',
  )
  await btn.click({ force: true })
  await btn.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('open, walk the formats by keyboard, copy, and Esc returns focus to Export', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await boot(page)
  await open(page)

  // the first format is selected and has focus; the list says which is selected
  const css = tab(page, /CSS variables/)
  await expect(css).toBeFocused()
  await expect(css).toHaveAttribute('aria-selected', 'true')
  await expect(dialog(page).getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical')

  // arrows move through formats, and the preview follows
  await page.keyboard.press('ArrowDown')
  await expect(tab(page, /Tailwind v4/)).toBeFocused()
  await expect(tab(page, /Tailwind v4/)).toHaveAttribute('aria-selected', 'true')
  await expect(css).toHaveAttribute('aria-selected', 'false')
  await page.keyboard.press('ArrowDown')
  await expect(tab(page, /Design tokens/)).toHaveAttribute('aria-selected', 'true')
  await expect(dialog(page).locator('.xd-pre')).toContainText('$extensions')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(css).toBeFocused()
  // wraps: up from the first lands on the last
  await page.keyboard.press('ArrowUp')
  await expect(tab(page, /API \/ agent link/)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(css).toBeFocused()

  // Tab into the pane, find Copy, press it
  const copy = dialog(page).getByRole('button', { name: 'Copy', exact: true })
  for (let i = 0; i < 6 && !(await copy.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(copy).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog(page).getByRole('status')).toHaveText('copied')
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  const id = await dialog(page).locator('.xd-id').textContent()
  const origin = new URL(page.url()).origin
  expect(clip.split('\n')[0]).toMatch(
    new RegExp(`^/\\* ChromaConscious ${id} · ${origin}/chromaconscious#s=[A-Za-z0-9_-]+ \\*/$`),
  )
  expect(clip).toContain(':root {')
  expect(clip).toContain('.dark {')

  // Tab is trapped: a full lap never leaves the dialog
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }

  // shortcuts don't act behind it: r would riff
  const backTitle = await page.locator('.ctl[title^="no hops"]').count()
  await page.keyboard.press('r')
  expect(await page.locator('.ctl[title^="no hops"]').count()).toBe(backTitle)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(exportBtn(page)).toBeFocused()
})

test('the links: share carries the theme and the vision; the agent entry carries state=', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await boot(page)
  await open(page)
  const origin = new URL(page.url()).origin
  await tab(page, /Share link/).click()
  const link = (await dialog(page).locator('.xd-link').textContent())!
  expect(link).toMatch(new RegExp(`^${origin}/chromaconscious#s=[A-Za-z0-9_-]+$`))
  const payload = link.split('#s=')[1]

  await tab(page, /API \/ agent link/).click()
  await dialog(page).getByRole('button', { name: 'Copy link' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${origin}/api/chromaconscious/v1/theme?state=${payload}`,
  )
  await dialog(page).getByRole('button', { name: 'Copy calls' }).click()
  const calls = await page.evaluate(() => navigator.clipboard.readText())
  expect(calls).toContain(`/api/chromaconscious/v1/export?state=${payload}&format=css`)
  expect(calls).not.toContain('theme=t_')
  await page.keyboard.press('Escape')

  // a frame under a simulation shares it
  await page.keyboard.press('v') // typical → protan
  await open(page)
  await tab(page, /Share link/).click()
  await expect(dialog(page).locator('.xd-link')).toHaveText(/#s=[A-Za-z0-9_-]+&vision=protan$/)
})

/** The tokens a frame paints, read off its preview root. */
const painted = (page: Page) =>
  page.locator('.preview-root').first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return ['--background', '--foreground', '--primary', '--accent-strong', '--destructive', '--chart-3', '--border'].map(
      (t) => `${t}: ${cs.getPropertyValue(t).trim()}`,
    )
  })

test('a share link opens the same theme in a fresh page, with no network', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await boot(page)
  // a theme a preset alone can't name: riffed, with a lock and a taste
  await page.locator('.dial-slider').fill('0.8')
  const riff = page.locator('.ctl-row .ctl[title*="walk the palette"]')
  await riff.click()
  await riff.click()
  await open(page)
  const id = await dialog(page).locator('.xd-id').textContent()
  await tab(page, /Share link/).click()
  await dialog(page).getByRole('button', { name: 'Copy link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  await page.keyboard.press('Escape')
  const before = await painted(page)
  expect(before.every((t) => /#[0-9a-f]{6}/.test(t))).toBe(true)

  // a fresh page; the API is unreachable, so this can only come from the link
  const fresh = await context.newPage()
  await fresh.route('**/api/**', (r) => r.abort())
  await fresh.emulateMedia({ reducedMotion: 'reduce' })
  // the preview server has no /chromaconscious path; the fragment is the link
  await fresh.goto('/' + new URL(link).hash)
  await expect(fresh.locator('.role-board')).toBeVisible()
  await expect(fresh.getByText('opened the theme in this link')).toBeVisible()
  expect(await painted(fresh)).toEqual(before)
  await fresh.locator('.sidebar-shell').getByRole('button', { name: 'Export' }).click()
  await expect(fresh.getByRole('dialog', { name: 'Export' }).locator('.xd-id')).toHaveText(id!)
})

test('a malformed share link opens the start screen with a quiet note', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#s=AQMDGR01Vz_YHVmR42')
  await expect(page.getByText(/couldn't read this link/)).toBeVisible()
  await expect(page.locator('[data-sec="input"]')).toBeVisible()
  await page.goto('/#s=Ag&vision=deutan')
  await page.reload()
  await expect(page.getByText(/newer ChromaConscious/)).toBeVisible()
  expect(errors).toEqual([])
})

test('a failing check is a note, never a gate', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Ink & sky' }).click()
  // every check passes: no note at all
  await open(page)
  await expect(dialog(page).locator('.xd-note')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // the same palette kept exactly as typed fails one pair
  await page.locator('.dial-slider').fill('1')
  await expect(page.locator('.status-chip')).toContainText('1 issue')
  await open(page)
  await expect(dialog(page).locator('.xd-note')).toHaveText('exports as you set it — 1 check to review')
  // information only: Copy still works
  await dialog(page).getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(dialog(page).getByRole('status')).toHaveText('copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(':root {')
})

test('the note names every locked seat that warns in its row, and counts it', async ({ page }) => {
  await boot(page)
  // lock primary as typed at a near-white: its row warns (triangle + ratio)
  await page.locator('.rb-slot[data-role="primary"] .rb-body').click()
  await page.locator('.rp-ship').getByLabel('color primary ships').fill('f8f8f8')
  await page.locator('.rp-ship').getByRole('button', { name: 'lock' }).click()
  const short = await page.locator('.rb-slot[data-role="primary"] .dc-short').textContent()
  const warned = await page.locator('.rb-slot .dc-fail').count()
  expect(warned).toBe(1)
  await expect(page.locator('.status-chip')).toContainText('1 issue')
  await open(page)
  await expect(dialog(page).locator('.xd-note')).toHaveText(
    `exports as you set it — 1 check to review · locked as typed: primary ${short}; derive safely is on its row`,
  )
})

test('it opens beside the pane; the backdrop leaves the swatches exactly as they were', async ({ page }) => {
  await boot(page)
  const swatches = page.locator('.sidebar-shell .rb-body')
  const read = () =>
    swatches.evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el)
        return [cs.backgroundColor, cs.filter, cs.opacity].join('|')
      }),
    )
  // park the pointer on bare stage: the preset click left it resting over a
  // colour row, and that row's hover ring is not what this test is about
  await page.mouse.move(900, 6)
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const before = await read()
  const shot = await page.locator('.sidebar-shell .role-board').screenshot()
  await open(page)

  // beside the pane, not over it
  const pane = (await page.locator('.sidebar-shell').boundingBox())!
  const box = (await dialog(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(pane.x + pane.width)

  // the tinted backdrop starts at the pane's edge, with no blur anywhere
  const scrim = await page.locator('.xd-scrim').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { left: el.getBoundingClientRect().left, bg: cs.backgroundColor, blur: cs.backdropFilter }
  })
  expect(scrim.left).toBeGreaterThanOrEqual(pane.x + pane.width - 0.5)
  expect(scrim.bg).toBe('rgba(0, 0, 0, 0.1)')
  expect(scrim.blur).toBe('none')
  expect(await page.locator('.xd-catch').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  )

  // computed colours unchanged, and the pixels too
  expect(await read()).toEqual(before)
  expect(await page.locator('.sidebar-shell .role-board').screenshot()).toEqual(shot)

  // a click on the pane closes it rather than editing behind it
  await page.mouse.click(pane.x + 40, pane.y + 40)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('narrow when the room beside the pane is tight', async ({ page }) => {
  await page.setViewportSize({ width: 860, height: 800 })
  await boot(page)
  await open(page)
  await expect(dialog(page)).toHaveClass(/narrow/)
  await expect(dialog(page).getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal')
  const pane = (await page.locator('.sidebar-shell').boundingBox())!
  const box = (await dialog(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(pane.x + pane.width)
  await page.keyboard.press('ArrowRight')
  await expect(tab(page, /Tailwind v4/)).toHaveAttribute('aria-selected', 'true')
})

test('Figma variables: lists the zip, then downloads it', async ({ page }) => {
  await boot(page)
  await open(page)
  const id = await dialog(page).locator('.xd-id').textContent()
  await tab(page, /Figma variables/).click()
  const files = dialog(page).getByRole('list', { name: 'files in the zip' })
  await expect(files.getByRole('listitem')).toHaveCount(7)
  await expect(files).toContainText('dark-high.json')
  await expect(files).toContainText(/\d+ variables/)
  await expect(dialog(page)).toContainText("On Figma's free plan, import each file as its own collection")
  // download-only: no Copy
  await expect(dialog(page).getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0)
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dialog(page).getByRole('button', { name: 'Download' }).click(),
  ])
  expect(dl.suggestedFilename()).toBe(`chromaconscious-${id}-figma.zip`)
  await expect(dialog(page).getByRole('status')).toHaveText(`downloaded chromaconscious-${id}-figma.zip`)
})
