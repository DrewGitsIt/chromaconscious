#!/usr/bin/env node
// REPL driver for ChromaConscious: reads commands from stdin, one per line.
// Playwright + the system `chrome` channel (no chromium-cli in this container).
// Usage: node .claude/skills/run-chromaconscious/driver.mjs <<'EOF'
//   nav /
//   wait-for text=Start with anything
//   screenshot /tmp/out.png
// EOF

import { chromium } from '@playwright/test'
import readline from 'node:readline'

const BASE_URL = process.env.CHROMACONSCIOUS_URL || 'http://localhost:5199'
const consoleErrors = []

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message))

// Selector mini-language, matching what the project's own e2e specs use:
//   text=Coastal starter      -> getByText
//   role=button:Coastal starter -> getByRole('button', { name })
//   placeholder=or type       -> getByPlaceholder (regex-ish substring)
//   anything else             -> raw CSS selector
const locatorFor = (raw) => {
  if (raw.startsWith('text=')) return page.getByText(raw.slice(5))
  if (raw.startsWith('role=')) {
    const [role, ...nameParts] = raw.slice(5).split(':')
    return page.getByRole(role, { name: nameParts.join(':') })
  }
  if (raw.startsWith('placeholder=')) return page.getByPlaceholder(new RegExp(raw.slice(12)))
  return page.locator(raw)
}

const run = async (line) => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  const [cmd, ...rest] = trimmed.split(/\s+/)
  const arg = rest.join(' ')
  try {
    switch (cmd) {
      case 'nav': {
        const target = arg.startsWith('http') ? arg : BASE_URL + (arg || '/')
        await page.goto(target, { waitUntil: 'networkidle' })
        console.log('OK nav', target)
        break
      }
      case 'wait-for': {
        await locatorFor(arg).first().waitFor({ timeout: 10000 })
        console.log('OK wait-for', arg)
        break
      }
      case 'click': {
        await locatorFor(arg).first().click()
        console.log('OK click', arg)
        break
      }
      case 'fill': {
        const [selRaw, ...valParts] = rest
        await locatorFor(selRaw).first().fill(valParts.join(' '))
        console.log('OK fill', selRaw)
        break
      }
      case 'press': {
        await page.keyboard.press(arg)
        console.log('OK press', arg)
        break
      }
      case 'select': {
        const [selRaw, ...valParts] = rest
        await locatorFor(selRaw).first().selectOption(valParts.join(' '))
        console.log('OK select', selRaw, valParts.join(' '))
        break
      }
      case 'hover': {
        await locatorFor(arg).first().hover()
        console.log('OK hover', arg)
        break
      }
      // Debounces and transitions mean a screenshot taken on the next line
      // shows the state BEFORE the interaction landed. Locate mode waits
      // 150ms; `transition-colors` runs longer than that again.
      case 'sleep': {
        await new Promise((r) => setTimeout(r, Number(arg) || 300))
        console.log('OK sleep', arg)
        break
      }
      // The three read-backs below are what make "this control is real"
      // checkable. A screenshot proves a thing rendered; only reading state
      // back proves a click CHANGED it.
      case 'text': {
        console.log('TEXT', JSON.stringify(await locatorFor(arg).first().innerText()))
        break
      }
      case 'count': {
        console.log('COUNT', arg, await locatorFor(arg).count())
        break
      }
      case 'attr': {
        const name = rest[rest.length - 1]
        const sel = rest.slice(0, -1).join(' ')
        console.log('ATTR', name, JSON.stringify(await locatorFor(sel).first().getAttribute(name)))
        break
      }
      case 'screenshot': {
        const path = rest[0] || `/tmp/chromaconscious-${Date.now()}.png`
        await page.screenshot({ path, fullPage: rest[1] === 'full' })
        console.log('OK screenshot', path)
        break
      }
      case 'console': {
        console.log('ERRORS', JSON.stringify(consoleErrors))
        break
      }
      case 'quit':
        await browser.close()
        process.exit(0)
        break
      default:
        console.log('ERR unknown command:', cmd)
    }
  } catch (err) {
    console.log('ERR', cmd, err.message.split('\n')[0])
  }
}

// Serialize: stdin delivers all heredoc lines in a burst, so chain them
// instead of firing `run()` concurrently off each `line` event.
let queue = Promise.resolve()
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  queue = queue.then(() => run(line))
})
rl.on('close', () => {
  queue.then(async () => {
    await browser.close()
    process.exit(0)
  })
})
