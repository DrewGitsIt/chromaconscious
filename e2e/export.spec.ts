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
  expect(clip.split('\n')[0]).toBe(`/* ChromaConscious ${id} · ${origin}/chromaconscious#${id} */`)
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

test('the links: share carries the vision; the agent entry copies the id', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await boot(page)
  await open(page)
  const id = await dialog(page).locator('.xd-id').textContent()
  await tab(page, /API \/ agent link/).click()
  await dialog(page).getByRole('button', { name: 'Copy id' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id)
  await dialog(page).getByRole('button', { name: 'Copy calls' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    `/api/chromaconscious/v1/export?theme=${id}&format=css`,
  )
  await tab(page, /Share link/).click()
  await expect(dialog(page).locator('.xd-link')).toHaveText(`${new URL(page.url()).origin}/chromaconscious#${id}`)
  await page.keyboard.press('Escape')

  // a frame under a simulation shares it
  await page.keyboard.press('v') // typical → protan
  await open(page)
  await tab(page, /Share link/).click()
  await expect(dialog(page).locator('.xd-link')).toHaveText(/&vision=protan$/)
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
