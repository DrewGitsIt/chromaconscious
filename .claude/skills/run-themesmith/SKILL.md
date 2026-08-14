---
name: run-themesmith
description: Build, run, and drive themesmith (a React/Vite color-theme generator). Use when asked to start themesmith, run its dev server, take a screenshot of its UI, or click through the theme-forging flow (presets, riff, pin colors).
---

themesmith is a Vite + React 19 SPA (no backend) that forges a UI color theme from a seed color, image, or preset. Drive it via the REPL driver at `.claude/skills/run-themesmith/driver.mjs` — a small Playwright wrapper (the system `google-chrome`, no `chromium-cli` in this container) that reads one command per line from stdin.

All paths below are relative to the repo root (`themesmith/`).

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
nohup npm run dev -- --port 5199 > /tmp/themesmith-dev.log 2>&1 &
disown
timeout 30 bash -c 'until curl -sf http://localhost:5199 >/dev/null; do sleep 1; done'
```

2. Pipe commands to the driver, one per line:

```bash
node .claude/skills/run-themesmith/driver.mjs <<'EOF'
nav /
wait-for text=Start with anything
screenshot /tmp/shots/01-hero.png
click role=button:Coastal starter
wait-for .role-board
screenshot /tmp/shots/02-theme.png full
click .sec-act .mini[title*="re-roll"]
wait-for .sec-act .mini[title*="back one riff"]
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
| `nav <path-or-url>` | Goes to `path` under `http://localhost:5199` (or `$THEMESMITH_URL`), or an absolute URL. `nav /` for the hero. |
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

Each frame card carries a `<select class="frame-mockup">`. The option values are
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
| keep a derived color | `.rb-keep` (the pin — only on `derived` seats) |
| chart series | `.tray-top`, `.tray-name`, `.tray-cap` ("N of 5"), `.tray-set` |
| colors not in play | `.bench-bar` (collapsed by default) → `.bench-drawer`, `.benched`, `.bench-empty` |
| section tools | `.sec-act .mini[title*="…"]` — see the gotcha below |
| the rest | `.dial-slider`, `.status-chip`, `.export-row`, `.report-drawer`, `.toast`, `.stage`, `.preview-root` |

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

- **The driver must resolve `@playwright/test` from the repo's `node_modules`.** Node's ESM resolver walks up from the *script's own* directory, not `cwd` — since `driver.mjs` lives under `themesmith/.claude/skills/run-themesmith/`, it finds `themesmith/node_modules` automatically. Don't copy the driver out to `/tmp` and run it there; it'll throw `ERR_MODULE_NOT_FOUND`.
- **A single preset click is enough to prove the app works.** Clicking a preset (e.g. `role=button:Coastal starter`) replaces the entire hero with a live dashboard mockup styled from the generated theme, a six-seat role board with a chart tray and a bench under it, and a contrast report ("all 40 checks pass"). If that mockup doesn't render, something's actually broken — it's not a slow-load flake.
- **Every glyph is a lucide icon now, so the section tools have no text to match.** `⚄ riff`, `↻ start over` and friends are gone; the tools in `.sec-act` are icon-only `.mini` buttons, and the only stable handle is their `title`: `.sec-act .mini[title*="re-roll"]` (riff), `[title*="back one riff"]`, `[title="start over"]`, `[title*="lock the theme"]` / `[title*="unlock"]` (mono lock), `[title*="clear your placements"]` (reset), `[title*="compare two frames"]` / `[title*="close frame B"]`. Don't reach for `role=button:…` here — a button with no text takes its accessible name from `title`, but the riff button grows a seed count ("1", "2") the moment you use it and the name changes under you.
- **`riff` needs the theme forged first, and something left to derive.** The riff button only exists once a theme exists (click a preset or `Add` a color first), and it re-rolls *only* the seats tagged `derived`. Supply enough colors to fill all six seats and the five chart slots and it goes disabled with `title="nothing to riff — every seat is yours"` — that's correct behavior, not a broken click. Pin a derived seat with `.rb-keep` and it flips to `kept`, same hex, riff-proof from then on.
