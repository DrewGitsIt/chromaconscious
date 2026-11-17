// usage: node shot.mjs <html> <png>
import { chromium } from '/home/drew/repo/chromaconscious/node_modules/playwright/index.mjs'
const [src, png] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1229/chrome-headless-shell-linux64/chrome-headless-shell' })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
await p.goto('file://' + src)
const h = await p.evaluate(() => document.body.scrollHeight)
await p.setViewportSize({ width: 1600, height: h + 20 })
await p.screenshot({ path: png })
await b.close()
