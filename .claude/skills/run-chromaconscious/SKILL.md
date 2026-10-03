---
name: run-chromaconscious
description: Build, run, and drive ChromaConscious (a React/Vite color-theme generator). Use when asked to start ChromaConscious, run its dev server, take a screenshot of its UI, or click through the theme-building flow (presets, riff, pin colors).
---

ChromaConscious is a Vite + React 19 SPA (no backend) that builds a UI color theme from a seed color, image, or preset. Drive it via the REPL driver at `.claude/skills/run-chromaconscious/driver.mjs` — a small Playwright wrapper (the system `google-chrome`, no `chromium-cli` in this container) that reads one command per line from stdin.

All paths below are relative to the repo root (`chromaconscious/`).

## Prerequisites

`google-chrome` must be installed (used via Playwright's `channel: 'chrome'`, so no separate browser download):

```bash
which google-chrome   # /usr/bin/google-chrome
```

## Setup

```bash
npm install
```

## Run (agent path)

1. Start the dev server in the background on the port the project's own e2e config expects (`playwright.config.ts` baseURL), and wait for it to actually serve. If `curl -sf http://localhost:5199` already answers, someone else's server is live — reuse it and skip this step rather than killing it:

```bash
lsof -ti:5199 -sTCP:LISTEN | xargs -r kill 2>/dev/null   # free the port if a stale server is running
nohup npm run dev -- --port 5199 > /tmp/chromaconscious-dev.log 2>&1 &
disown
timeout 30 bash -c 'until curl -sf http://localhost:5199 >/dev/null; do sleep 1; done'
```

2. Pipe commands to the driver, one per line:

```bash
node .claude/skills/run-chromaconscious/driver.mjs <<'EOF'
nav /
wait-for text=Start with anything
screenshot /tmp/shots/01-hero.png
click role=button:Coastal starter
wait-for .role-board
screenshot /tmp/shots/02-theme.png full
click .ctl-row .ctl[title*="walk the palette"]
wait-for .ctl-row .ctl[title*="back one riff"]
screenshot /tmp/shots/03-riff.png full
click .rb-slot[data-role="danger"] .rb-body
wait-for .rp-asg
screenshot /tmp/shots/04-assign.png
console --errors
quit
EOF
```

Screenshots land wherever you point `screenshot` (make the directory first — the driver doesn't create one). `console --errors` prints every collected `console.error`/`pageerror` since launch as a JSON array — check it's `[]` before declaring success.

3. Stop the server: `lsof -ti:5199 -sTCP:LISTEN | xargs -r kill`

### Driver commands

| command | what it does |
|---|---|
| `nav <path-or-url>` | Goes to `path` under `http://localhost:5199` (or `$CHROMACONSCIOUS_URL`), or an absolute URL. `nav /` for the hero. |
| `wait-for <selector>` | Waits (10s timeout) for the first match. |
| `click <selector>` | Clicks the first match. |
| `fill <selector> <value...>` | Fills the first match. |
| `press <key>` | `page.keyboard.press`, e.g. `press Enter`. |
| `select <selector> <value>` | Picks an `<option>` by value — the frame's mockup picker is a `<select>`. |
| `hover <selector>` | Hovers the first match (chart tooltips, locate mode). |
| `sleep <ms>` | Waits. Needed before screenshotting anything debounced or transitioned. |
| `text <selector>` | Prints `TEXT "…"` — the first match's `innerText`. |
| `count <selector>` | Prints `COUNT <selector> <n>` — how many match. |
| `attr <selector> <name>` | Prints `ATTR <name> "…"` — e.g. `attr button.archive disabled`. |
| `screenshot <path> [full]` | PNG to `path`; add `full` for `fullPage`. |
| `console` | Prints `ERRORS [...]` — accumulated console errors/pageerrors as JSON. |
| `quit` | Closes the browser and exits. |

`text` / `count` / `attr` are how you prove a control is *real*. A screenshot
shows that something rendered; only reading state back across a click shows
that the click changed anything.

**Screenshots taken on the line after an interaction lie.** Locate mode is
debounced 150ms and `transition-colors` runs longer again, so a capture that
follows a `hover`/`click` immediately shows the state *before* it landed. Put
`sleep 700` between them. This has now burned two separate investigations.

### Choosing which mockup a frame renders

The frame controls live on the **stage, not the sidebar**: each frame (`.artboard`) has a label row (`.frame-card`) above it — pane letter (`role=button:edit frame A`), a `<select class="frame-mockup">`, the light/dark toggle (`role=button:switch frame A to dark`), and a right-justified `.board-btn` that is `compare` (title `compare two frames`) or, once split, `close A`/`close B`. The mockup scrolls inside `.frame`, never the page — so raw `page.mouse` clicks on anything below the frame's fold need a `scrollIntoViewIfNeeded()` first. The option values are
the ids in `src/mockups.tsx`: `app`, `analytics`, `marketing`, `brand`.

```
click role=button:Coastal starter
wait-for .role-board
select .frame-mockup analytics
wait-for .preview-root
```

Selectors support a small prefix language matching what the project's own `e2e/*.spec.ts` files use:
- `text=Coastal starter` → `page.getByText(...)`
- `role=button:Coastal starter` → `page.getByRole('button', { name: 'Coastal starter' })`
- `placeholder=or type` → `page.getByPlaceholder(/or type/)`
- anything else → raw CSS selector, e.g. `.preview-root`, `.rb-slot[data-role="primary"]`

### Sidebar selectors

The sidebar is `.sidebar-shell`, a stack of `.sec` bands (`.sec-label` names each one, `.sec-act` holds its tools). The palette lives on a **board of seats**, not a list:

| what | selector |
|---|---|
| a seat | `.rb-slot[data-role="primary"]` (also `accent`/`neutral`/`danger`/`success`/`warning`) |
| its color + provenance | `.rb-hex`, `.rb-tag` — literal text `yours`, `kept`, or `derived` |
| teach me this role | `.rb-name` → tooltip `.rp-tip` (`.rp-tip-name`, `.rp-tip-gloss`, `.rp-tip-job`) |
| change what fills it | `.rb-body` → popover `.rp-asg` (`.rp-asg-q`, `.rp-opt`, `.rp-opt-hint`, `.rp-free`) |
| lock a seat (riff may not move it) | `.rb-lock`, `data-locked="true\|false"` — on **every** seat |
| keep a derived color | `.rb-keep` — the same button on a `derived` seat |
| lock a chart swatch | `.tray-set .series-lock`, `data-locked` (absent on invented fills) |
| chart series | `.tray-top`, `.tray-name`, `.tray-cap` ("N of 5"), `.tray-set` |
| colors not in play | `.bench-bar` (collapsed by default) → `.bench-drawer`, `.benched`, `.bench-empty` |
| section tools | `.sec-act .mini[title*="…"]` — see the gotcha below |
| contrast level | `.ctr-slider` (`role=slider:contrast`, 0 / 0.5 / 1 = standard / medium / high); readout `.ctr-ratio` (`7:1`, the WCAG check) then `.ctr-lc` (`Lc 75`, focusable; its `role=tooltip` explains APCA) |
| the rest | `.dial-slider` (readout `.dial-value`), `.status-chip`, `.export-row`, `.report-drawer`, `.toast`, `.stage`, `.artboard`, `.frame`, `.preview-root` |

## Run (human path)

```bash
npm run dev   # → http://localhost:5173 (default port), Ctrl-C to stop
```

## Test

```bash
npx vitest run   # unit tests (engine/, components/)
npm run e2e      # Playwright e2e — spins up its own dev server on :5199
```

## Gotchas

- **The driver must resolve `@playwright/test` from the repo's `node_modules`.** Node's ESM resolver walks up from the *script's own* directory, not `cwd` — since `driver.mjs` lives under `chromaconscious/.claude/skills/run-chromaconscious/`, it finds `chromaconscious/node_modules` automatically. Don't copy the driver out to `/tmp` and run it there; it'll throw `ERR_MODULE_NOT_FOUND`.
- **A single preset click is enough to prove the app works.** Clicking a preset (e.g. `role=button:Coastal starter`) replaces the entire hero with a live dashboard mockup styled from the generated theme, a six-seat role board with a chart tray and a bench under it, and a contrast report ("all 40 checks pass"). If that mockup doesn't render, something's actually broken — it's not a slow-load flake.
- **Every glyph is a lucide icon now, so the section tools have no text to match.** `⚄ riff`, `↻ start over` and friends are gone; the tools in `.sec-act` are icon-only `.mini` buttons, and the only stable handle is their `title`: `.ctl-row .ctl[title*="walk the palette"]` (riff), `.ctl-row .ctl[title*="back one riff"]`, `[title="start over"]`, `[title*="lock the theme"]` / `[title*="unlock"]` (mono lock), `[title*="clear your placements"]` (reset), `[title*="compare two frames"]` / `[title*="close frame B"]`. Don't reach for `role=button:…` here — a button with no text takes its accessible name from `title`, but the riff button grows a seed count ("1", "2") the moment you use it and the name changes under you.
- **`riff` walks the whole palette; a lock is the only thing that stops it.** The riff button only exists once a theme exists (click a preset or `Add` a color first). Every hop moves every seat — including colors you supplied — except the ones carrying `.rb-lock[data-locked="true"]`. It goes disabled with `title="nothing to riff — every seat is locked"` only when all six seats *and* every chart color of yours are locked.
- **Locking freezes the color you can see, not the one you typed.** Lock a seat three hops along and it holds at the walked hex; unlock and the walk resumes to exactly where it would have been. Your input is never lost — it stays in the seat's body tooltip as `… — yours, from #xxxxxx`. The seat chip shows the *seed*, so below fidelity 1 it never equals the string you typed; read `sourceHex` out of that tooltip instead of assuming they match. On a `derived` seat the same control is also `.rb-keep`, which materializes the derived color as a candidate first so there is something to hang the lock on.
- **Riff is a hop count, not an opaque seed.** Cost is linear in it, and `back one riff` (`n-1`) is exact — hop 0 is bit-identical to the un-riffed theme.
