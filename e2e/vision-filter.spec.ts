import { expect, test } from '@playwright/test'
import type { Vision } from '../src/engine/cvd'
import { simulateHex } from '../src/engine/cvd'

// The frame's vision filter is SVG, run by the browser; cvd.ts is the same
// math in JS. This renders a grid of swatches through the real filter,
// screenshots it, and checks every swatch against cvd.ts — the only way to
// know the browser's linear-RGB pipeline (and its 8-bit intermediates) agrees
// with the reference. It caught tritan crushing near-black; see VisionFilter.

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

// A 6-level cube, plus dark colors and a dark gray ramp: the shadows are where
// an 8-bit linear-RGB intermediate would show first.
const SWATCHES: string[] = []
const LEVELS = [0, 51, 102, 153, 204, 255]
for (const r of LEVELS) for (const g of LEVELS) for (const b of LEVELS) SWATCHES.push(hex(r, g, b))
for (const v of [4, 8, 12, 16, 24, 32, 40, 48]) SWATCHES.push(hex(v, v, v), hex(v * 2, v, 0), hex(0, v, v * 2))

const SIZE = 10
const COLS = 20

for (const [vision, strength] of [
  ['protan', 1],
  ['deutan', 1],
  ['deutan', 0.6],
  ['tritan', 1],
  ['tritan', 0.5],
] as [Vision, number][]) {
  test(`${vision} at ${strength * 100}% matches cvd.ts`, async ({ page }) => {
    // Any Vite page will do (it carries the React plugin's preamble); it's replaced below.
    await page.goto('/')
    const filter = await page.evaluate(
      async ({ vision, strength }) => {
        const m = await import('/e2e/vision-filter.fixture.ts')
        return m.filterMarkup('v', vision, strength) as string
      },
      { vision, strength },
    )
    const cells = SWATCHES.map((c) => `<i style="background:${c}"></i>`).join('')
    await page.setViewportSize({ width: COLS * SIZE, height: Math.ceil(SWATCHES.length / COLS) * SIZE })
    await page.setContent(
      `<style>body{margin:0}#g{display:grid;grid-template-columns:repeat(${COLS},${SIZE}px);filter:url(#v)}
       i{display:block;width:${SIZE}px;height:${SIZE}px}</style>${filter}<div id="g">${cells}</div>`,
    )
    const png = await page.locator('#g').screenshot()

    // Read the screenshot's pixels back through a canvas.
    const pixels = await page.evaluate(
      async ({ src, n, cols, size }) => {
        const img = new Image()
        img.src = src
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const out: number[][] = []
        for (let i = 0; i < n; i++) {
          const x = (i % cols) * size + size / 2
          const y = Math.floor(i / cols) * size + size / 2
          out.push([...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)])
        }
        return out
      },
      { src: `data:image/png;base64,${png.toString('base64')}`, n: SWATCHES.length, cols: COLS, size: SIZE },
    )

    let worst = 0
    let worstAt = ''
    SWATCHES.forEach((c, i) => {
      const want = simulateHex(c, vision, strength)
      const exp = [1, 3, 5].map((k) => parseInt(want.slice(k, k + 2), 16))
      const d = Math.max(...exp.map((v, k) => Math.abs(v - pixels[i][k])))
      if (d > worst) {
        worst = d
        worstAt = `${c} → browser ${hex(...(pixels[i] as [number, number, number]))}, cvd.ts ${want}`
      }
    })
    console.log(`${vision}@${strength}: worst ${worst}/255 at ${worstAt}`)
    // Measured at 1; 2 leaves room for a GPU that rounds differently.
    expect(worst, worstAt).toBeLessThanOrEqual(2)
  })
}
