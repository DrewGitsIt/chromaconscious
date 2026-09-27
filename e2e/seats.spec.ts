import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** One labelled seat on the board. */
const seat = (page: Page, role: string) => page.locator(`.rb-slot[data-role="${role}"]`)

/**
 * Match a seat by the colour it CAME FROM. A seat's chip shows the seed the
 * engine resolved — below fidelity 1 that is not the string you typed, and
 * after a riff hop it is not the string you typed either — so the input is
 * disclosed in the body tooltip as "from #…" and matched here.
 */
const seatFrom = (page: Page, role: string, hex: string) =>
  expect(seat(page, role).locator('.rb-body')).toHaveAttribute('title', new RegExp(hex))

/** Boot a working session with the pastel picnic preset (blue sits in accent). */
const bootPicnic = async (page: Page) => {
  await page.getByRole('button', { name: 'Pastel picnic' }).click()
  await seatFrom(page, 'accent', '#a0c4ff')
}

/** The assign popover's real options — the free-the-seat button is not one. */
const options = (page: Page) => page.locator('.rp-asg-list .rp-opt')

test.describe('seats explain themselves', () => {
  test('the seat label teaches the role and names the jobs it holds', async ({ page }) => {
    await bootPicnic(page)
    await seat(page, 'accent').locator('.rb-name').click()
    const tip = page.locator('.rp-tip')
    await expect(tip).toBeVisible()
    await expect(tip.locator('.rp-tip-name')).toHaveText('accent')
    await expect(tip.locator('.rp-tip-gloss')).not.toBeEmpty()
    // the jobs are read off the live ancestry map, so they can't drift
    await expect(tip.locator('.rp-tip-job', { hasText: 'links' })).toBeVisible()
  })

  test('the seat color asks what fills it, and every option states its consequence', async ({
    page,
  }) => {
    await bootPicnic(page)
    await seat(page, 'accent').locator('.rb-body').click()
    const asg = page.locator('.rp-asg')
    await expect(asg).toBeVisible()
    await expect(asg.locator('.rp-asg-q')).toHaveText('What fills accent?')
    // provenance says where the colour came from; the seat's lock, not this
    // line, says whether riff may move it
    await expect(asg.locator('.rp-asg-sub')).toHaveText('you placed this one')
    await expect(options(page).first()).toBeVisible()
    for (const hint of await asg.locator('.rp-opt-hint').allTextContents()) {
      expect(hint.trim()).not.toBe('')
    }
    // the seat's current holder is displaced, and the option says so up front
    await expect(options(page).filter({ hasText: '#ffadad' }).locator('.rp-opt-hint')).toContainText(
      'benches #a0c4ff',
    )
  })

  test('picking an option seats that color and benches the one it displaced', async ({ page }) => {
    await bootPicnic(page)
    await seat(page, 'accent').locator('.rb-body').click()
    // "benches #a0c4ff · frees primary for #ffd6a5" — hold the popover to it
    await options(page).filter({ hasText: '#ffadad' }).click()
    await expect(page.locator('.rp-asg')).toHaveCount(0)
    await seatFrom(page, 'accent', '#ffadad')
    await expect(seat(page, 'accent').locator('.rb-tag')).toHaveText('yours')
    await seatFrom(page, 'primary', '#ffd6a5')
    // the displaced color parks on the bench rather than vanishing
    await expect(page.locator('.bench-bar')).toContainText('1 color not in play')
    await page.locator('.bench-bar').click()
    await expect(page.locator('.benched', { hasText: '#a0c4ff' })).toBeVisible()
  })

  test('freeing a seat names its successor, and the successor really takes over', async ({
    page,
  }) => {
    await bootPicnic(page)
    await seat(page, 'accent').locator('.rb-body').click()
    // the one line that must not lie
    await expect(page.locator('.rp-free .rp-opt-hint')).toHaveText('#9bf6ff takes over')
    await page.locator('.rp-free').click()
    await seatFrom(page, 'accent', '#9bf6ff')
    await expect(seat(page, 'accent').locator('.rb-tag')).toHaveText('yours')
  })

  test('a derived seat says the smith owns it, and offers your colors instead', async ({ page }) => {
    await bootPicnic(page)
    const neutral = seat(page, 'neutral')
    await expect(neutral.locator('.rb-tag')).toHaveText('derived')
    await neutral.locator('.rb-body').click()
    await expect(page.locator('.rp-asg-sub')).toHaveText('derived — riff re-rolls it')
    const pick = options(page).first()
    // the option names the CANDIDATE, so the seat is matched by what it came from
    const hex = await pick.locator('.rp-opt-name').textContent()
    await pick.click()
    await seatFrom(page, 'neutral', hex!)
    await expect(neutral.locator('.rb-tag')).toHaveText('yours')
  })
})
