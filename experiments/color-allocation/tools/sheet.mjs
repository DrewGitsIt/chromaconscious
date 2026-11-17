// Contact sheets: labeled per model (for analysis) and one shuffled blind page (for judging).
// usage: node sheet.mjs <round dir> <key.json> <chromium>
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import { basename, join, resolve } from 'path'
const require = createRequire('/home/drew/repo/chromaconscious/package.json')
const { chromium } = require('playwright')
const [roundDir, keyFile, exe] = process.argv.slice(2)
const round = resolve(roundDir), key = JSON.parse(readFileSync(keyFile, 'utf8'))
const ids = Object.keys(key).sort((a, b) => (key[a] < key[b] ? -1 : 1))
const cell = (id, label) => `<figure><figcaption>${label}</figcaption><img src="${id}/shot.png"></figure>`
const page = (title, cells) => `<!doctype html><meta charset=utf-8><title>${title}</title><style>
body{margin:0;padding:16px;background:#d9d9d9;font:600 15px system-ui}figure{margin:0}
.g{display:grid;grid-template-columns:repeat(6,300px);gap:14px;align-items:start}img{width:300px;display:block;box-shadow:0 1px 4px #0003}
figcaption{padding:0 0 6px}</style><div class=g>${cells.join('')}</div>`
const browser = await chromium.launch({ executablePath: exe })
for (const model of [...new Set(Object.values(key).map((v) => v.split('-')[0]))]) {
  const html = page(model, ids.filter((id) => key[id].startsWith(model)).map((id) => cell(id, key[id])))
  writeFileSync(join(round, `sheet-${model}.html`), html)
  const p = await browser.newPage({ viewport: { width: 1900, height: 800 } })
  await p.goto('file://' + join(round, `sheet-${model}.html`))
  await p.waitForLoadState('load')
  await p.setViewportSize({ width: 1900, height: await p.evaluate(() => document.documentElement.scrollHeight) })
  await p.screenshot({ path: join(round, `sheet-${model}.png`) })
  await p.close()
}
// Blind: shuffled, lettered; the letter→id map goes to a separate file so the page reveals nothing.
const shuffled = [...ids].sort(() => Math.random() - 0.5)
const letters = Object.fromEntries(shuffled.map((id, i) => [String.fromCharCode(65 + i), id]))
writeFileSync(join(round, 'blind.html'), page('Sunshare: blind', Object.entries(letters).map(([l, id]) => cell(id, l))).replace('<div class=g>', '<p>Rank them, or pick the best and worst three, and say why. Letters are shuffled.</p><div class=g>'))
writeFileSync(join(round, '..', `${basename(round)}-blind-letters.json`), JSON.stringify(letters, null, 1))
await browser.close()
