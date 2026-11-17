// Screenshots every run in a round and measures how it spends color.
// usage: node measure.mjs <round dir> <chromium executable>
// Writes <run>/shot.png and <round>/metrics.json. Runs are blind ids; the key lives beside the round.
import { createRequire } from 'module'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const require = createRequire('/home/drew/repo/chromaconscious/package.json')
const { chromium } = require('playwright')
const [roundDir, exe] = process.argv.slice(2)
const round = resolve(roundDir)
const runs = readdirSync(round).filter((d) => /^b[0-9a-f]{6}$/.test(d) && existsSync(join(round, d, 'index.html')))

// The theme's hue anchors, so a colored pixel can be filed under the token family it came from.
const theme = readFileSync(join(round, 'theme.css'), 'utf8').split('.dark')[0]
const tok = (n) => theme.match(new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`))[1]
const FAMILIES = { primary: tok('primary'), accent: tok('accent-strong'), destructive: tok('destructive'), success: tok('success'), warning: tok('warning'), 'chart-2': tok('chart-2') }

const browser = await chromium.launch({ executablePath: exe })
const out = {}
for (const id of runs) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('file://' + join(round, id, 'index.html'))
  await page.waitForTimeout(400)
  // A full-page capture strands position:fixed bars mid-page; a viewport as tall as the page keeps them at the bottom.
  const tall = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: 390, height: Math.max(844, tall) })
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(round, id, 'shot.png') })

  const dom = await page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number)
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.backgroundImage !== 'none') return { gradient: true }
        const c = rgb(cs.backgroundColor)
        if (c.length === 3 || c[3] > 0.5) return { c: c.slice(0, 3) }
      }
      return { c: [255, 255, 255] }
    }
    let texts = 0, fails = 0, onGradient = 0
    const failures = []
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!own || !el.getClientRects().length) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue
      texts++
      const bg = bgOf(el)
      if (bg.gradient) { onGradient++; continue }
      const a = lum(rgb(cs.color).slice(0, 3)), b = lum(bg.c)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
      if (ratio < need) { fails++; failures.push(`${el.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}`) }
    }
    // Reading order of the brief's sections, by the first text node that mentions each.
    const topOf = (re) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n; (n = w.nextNode()); ) if (re.test(n.textContent)) return n.parentElement.getBoundingClientRect().top
      return null
    }
    const marks = { credit: /48\.20/, alert: /peak pricing/i, use: /312/, output: /1,840/, activity: /recent activity/i }
    const order = Object.entries(marks).map(([k, re]) => [k, topOf(re)]).filter(([, y]) => y != null).sort((a, b) => a[1] - b[1]).map(([k]) => k)
    return { height: document.documentElement.scrollHeight, texts, fails, onGradient, failures: failures.slice(0, 6), order: order.join('>') }
  })

  // Pixel pass in the page itself: canvas over the screenshot, OKLCH per pixel.
  const png = readFileSync(join(round, id, 'shot.png')).toString('base64')
  const px = await page.evaluate(async ({ png, FAMILIES }) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + png
    await img.decode()
    const W = Math.floor(img.width / 4), H = Math.floor(img.height / 4) // 2px CSS cells
    const cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d')
    cx.drawImage(img, 0, 0, W, H)
    const d = cx.getImageData(0, 0, W, H).data
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const oklch = (r, g, b) => {
      ;[r, g, b] = [lin(r), lin(g), lin(b)]
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
      const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
      const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
      return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
    }
    const hex = (h) => oklch(...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
    const anchors = Object.entries(FAMILIES).map(([k, h]) => [k, hex(h)[2]])
    const fam = Object.fromEntries(anchors.map(([k]) => [k, 0]))
    let colorful = 0, dark = 0
    const mask = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) {
      const [L, C, h] = oklch(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
      if (L < 0.4) dark++
      if (C < 0.045) continue
      colorful++
      mask[i] = 1
      let best = null, bd = 999
      for (const [k, ah] of anchors) {
        const dh = Math.min(Math.abs(h - ah), 360 - Math.abs(h - ah))
        if (dh < bd) { bd = dh; best = k }
      }
      fam[best]++
    }
    // Colored regions: connected components of colored cells, keeping those over 0.15% of the page.
    const seen = new Uint8Array(W * H), min = W * H * 0.0015
    let regions = 0
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || seen[i]) continue
      let n = 0
      const stack = [i]
      seen[i] = 1
      while (stack.length) {
        const j = stack.pop(), x = j % W, y = (j / W) | 0
        n++
        for (const k of [x > 0 && j - 1, x < W - 1 && j + 1, y > 0 && j - W, y < H - 1 && j + W])
          if (k !== false && mask[k] && !seen[k]) { seen[k] = 1; stack.push(k) }
      }
      if (n >= min) regions++
    }
    const pct = (n) => +((100 * n) / (W * H)).toFixed(1)
    return { colorful: pct(colorful), dark: pct(dark), regions, families: Object.fromEntries(Object.entries(fam).map(([k, n]) => [k, pct(n)])) }
  }, { png, FAMILIES })

  // Source pass: what the author reached for.
  const src = readFileSync(join(round, id, 'index.html'), 'utf8')
  const count = (re) => (src.match(re) || []).length
  const tokens = {}
  for (const t of ['primary', 'accent-strong', 'accent', 'destructive', 'warning', 'success', 'chart-\\d', 'muted', 'card'])
    tokens[t.replace('\\d', 'N')] = count(new RegExp(`var\\(--${t}(?:[),\\s])`, 'g'))
  const literals = count(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/g)
  const plan = /\/\*[^]*?(color plan|means|meaning)[^]*?\*\//i.test(src)
  out[id] = { ...px, ...dom, tokens, literals, plan, gradients: count(/(?:linear|radial|conic)-gradient\(/g), colorMix: count(/color-mix\(/g), bytes: src.length, errors }
  await page.close()
  console.log(id, JSON.stringify(out[id]))
}
await browser.close()
writeFileSync(join(round, 'metrics.json'), JSON.stringify(out, null, 1))
