// Renders a page at phone width and saves a screenshot, for agents that want to look at their work.
// usage: node shot.mjs <page.html> <out.png> [width=390]
import { createRequire } from 'module'
import { resolve } from 'path'
const require = createRequire('/home/drew/repo/chromaconscious/package.json')
const { chromium } = require('playwright')
const [page, out, width = 390] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/home/drew/.cache/ms-playwright/chromium_headless_shell-1229/chrome-headless-shell-linux64/chrome-headless-shell' })
const p = await b.newPage({ viewport: { width: +width, height: 844 }, deviceScaleFactor: 2 })
await p.goto('file://' + resolve(page))
await p.waitForTimeout(300)
const tall = await p.evaluate(() => document.documentElement.scrollHeight)
await p.setViewportSize({ width: +width, height: Math.max(844, tall) })
await p.screenshot({ path: out })
await b.close()
console.log(`saved ${out} (${width}×${Math.max(844, tall)})`)
