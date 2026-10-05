# ChromaConscious remote API — spec (draft 3)

> Renamed from themesmith to ChromaConscious on 2026-10-03. The legacy names keep working: the `/api/themesmith/v1` base, `/themesmith*` app paths (301), the `THEMESMITH_API_KEYS` secret (fallback) and the `$extensions.themesmith` key. See src/api/handler.ts.

Status: 2026-09-26. Phase 1 and the core of phase 2 are built on the `phase1/core` branch (worktree `../themesmith-phase1`); not merged, not deployed. See [Phases](#phases).

## Decisions so far

| | |
|---|---|
| Host | drewkidwell.com on Cloudflare (Workers + KV) |
| Audience | the owner's agents first; public later, including site visitors playing with it |
| Agent access | a skill, loaded just in time: a SKILL.md that points to hosted docs, with calls made by `curl`. MCP later, if ever, as a thin wrapper. |
| Old links | re-solved on the current engine, silently |
| Vocabulary | the UI's words: `taste`, `riff`, `lock`, `separation`, `contrast`, `mono` |
| Plan/pricing | owner's call, pending (see [Cloudflare budget](#cloudflare-budget)) |

## Goal

Agents drive the same engine a person drives in the UI, and they use the same verbs to do it:

- start from colors, an image or a preset
- see the board
- place colors, lock, riff and back up
- look at the result
- export it
- hand a person a link that opens the exact theme in the UI, and pick up a theme a person started there

## The model: themes are immutable snapshots

The engine and the board verbs are **pure and deterministic**:

- `generateTheme` is a pure function of `{candidates, fidelity, seed, monoBase, separation, contrast}`. It takes no clock and no randomness: `random.ts` hashes keyed draws, and riff is a step count.
- The verbs in `board.ts` map `candidates[] → candidates[]`.
- A warm call takes about 2 ms at riff 0; see [Performance](#performance).

So a theme is a small value, about 1 KB of state, and the API treats it like a git commit:

- **A theme ID** (`t_k3v9x2…`) names one immutable snapshot of the state: colors, placements, taste, riff count, mono, separation, contrast level and **locks**.
  - The ID is a hash of the canonical state (below), so the same state always gets the same ID and storing it twice is harmless.
  - KV maps ID → state.
- **A theme can also travel whole** (decided 2026-10-05). `state=<payload>` is accepted wherever `theme=<id>` is (and `/generate` takes it like `from=`); the app opens `#s=<payload>`. The payload is the canonical state packed by `src/api/stateLink.ts`: a version byte, then hexes as 3 bytes, enums and flags as bits, varints, and exact float64s for locks and off-grid settings, base64url. Version 2 (2026-10-05) adds a colour's own taste ("derive safely" at taste 1) as a 3-bit code in the colour's extension byte, one byte per override; version 1 links still decode. It is lossless (the decoded canonical text is byte-identical, so the ID matches; unit-tested over every golden fixture), needs no key and no KV, and never expires. A 5-color preset link is 74 characters with origin; 12 hexes is 126; riffed with 2 locks is 138. It was chosen over base64url JSON (2–3× longer) and deflate-raw JSON (about 2× longer: short palettes give deflate nothing to find). A newer format version is refused with a message; old links re-solve on newer engines, like old IDs.
- **Every call that changes something creates a new snapshot** and returns its ID. The input snapshot never changes, so going back is just reusing the old ID.
- **No tenancy is needed for themes.** Two callers riffing the same `t_x` each get their own result. The same input gives the same output, so their results are the same `t_y`, and neither can change anything the other holds.
- **Locks live in the snapshot**, not with the caller. A lock set a week ago is still set on any theme descended from that one. A fresh `/generate` without `from=` starts with no locks.
- **Locks survive engine changes.** A locked color is stored as its exact OKLCH value (`lockedColor`). When an old ID is re-solved on a newer engine, locked seeds stay exactly the same. Unlocked seeds, and the ramps and derived shades around locked ones, may shift.

### Finding your theme again

The real problem across sessions is remembering *which* ID you were on. There are two answers:

1. **Exports carry their own ID.** Every export starts with a header naming the theme:

   ```css
   /* ChromaConscious t_k3v9x2 · https://drewkidwell.com/chromaconscious#s=AgEDAR01VwDmOUYAqNrcPA */
   ```

   The link carries the theme whole (`#s=`), so it opens even when the ID was never stored, and the header is the same whether the export was asked for by `theme=` or `state=`. The skill tells the agent: *if the project already has a ChromaConscious export, continue from its header with `state=` (or `from=` with the ID).* The file in the repo is its own pointer back to the theme.
2. **Named themes** *(later, key-only)*. `name=site-palette` is a movable pointer to the latest ID. This is the only per-user, changeable state in the design, so it's the only thing that needs authentication. Anonymous callers only ever deal in snapshot IDs.

**Retention.**
- Snapshots written with the owner's key are kept forever.
- Anonymous snapshots expire 90 days after they were last read. KV's TTL is refreshed on each read.

## Endpoints

Base: `https://drewkidwell.com/api/chromaconscious/v1`. Everything an agent needs is a GET that can be typed as a `curl` one-liner. Image upload is the only POST.

```
GET  /generate?colors=primary:1d3557,e63946,a8dadc&taste=0.5&separation=layered&mono=1d3557
GET  /generate?preset=coastal-starter
POST /generate                        image body (or GET ?image=<url>): colors are extracted, then as above
GET  /generate?from=t_x&taste=0.8     tweak: parameters you leave out keep their values in t_x
GET  /riff?theme=t_x&lock=primary,chart-2&hops=1
GET  /back?theme=t_x&hops=1
GET  /theme?theme=t_x                 re-read the summary (with &include=… for more detail)
GET  /export?theme=t_x&format=css|tailwind|json&mode=both|light|dark
GET  /export?theme=t_x&format=figma[&mode=light|dark|light-medium|dark-medium|light-high|dark-high]
     …and every read above takes state=<payload> in place of theme=t_x (see "A theme can also travel whole")
GET  /preview?theme=t_x&mockup=app|analytics|marketing|brand&mode=light|dark&as=png|html
GET  /presets
```

### Parameters

- **`colors`** is a comma list of bare hex values: no `#`, which a URL would read as a fragment. Any CSS color works if URL-encoded.
  - `role:hex` places a color in a seat. It's the API form of dragging a color onto a seat (`placeInRole`).
  - `chart:hex` puts a color in the series tray.
  - Order matters: as in the UI, earlier colors have first claim on seats.
- **`colors` combined with `from=`** replaces the theme's **unlocked** colors. Locked colors carry over. `add=` appends to the list instead of replacing it.
- **`taste`** runs from `0` to `1`. It's the UI dial and maps to the engine's `fidelity`. `0` lets the engine adjust colors freely. `1` keeps your colors verbatim, and may miss contrast targets; the summary shows which.
- **`lock`** and **`unlock`** take roles and chart slots (`primary,chart-2`). A lock **persists**, and later riffs keep it without repeating it.
  - A lock freezes the color *where it currently stands*. That can be several riff hops from what you typed.
  - Locking a seat the engine derived first keeps that color as yours (`keepRole`), as in the UI.
  - `lock` and `unlock` are accepted on `/riff` and `/generate?from=`.
- **`contrast`** is `standard` (the default), `medium`, `high`, or a number from `0` to `1` (0, 0.5 and 1 are the named levels; targets interpolate between). It is exported theme state, like `separation`: it raises every solved contrast target (text steps, links, text on fills, the primary's pop, focus ring, and floors for `border`/`input`) and leaves casting and taste's budgets alone. The table lives in `public/docs.md` and `engine/contrastLevel.ts`. Unlike `vision` on an `open` link, which is view-only, it changes the colours you ship.
- **`mode`** is not theme state. Every theme contains light and dark, and `mode` only chooses what `/export` and `/preview` show. As built, `/export` honours it for `json` only; CSS and Tailwind always carry both modes (`:root` and `.dark`), which is what a stylesheet wants.
- **`mono`** takes the hex of the color whose hue rules the theme, or `off`.
- **`format`** on `/export`:
  - `css` gives CSS variables
  - `tailwind` gives the Tailwind v4 `@theme` CSS
  - `json` gives DTCG tokens
  - `figma` serves Figma's native DTCG variable import, one file per mode × contrast level (`light.json`, `dark.json`, `light-medium.json`, `dark-medium.json`, `light-high.json`, `dark-high.json`), all three levels whatever the theme's own `contrast`. `mode=` returns that one file as JSON. **Without `mode=` it returns a JSON index** (`{ theme, note, files: [{ mode, filename, url }] }`), not a zip: the zip does not fit the Workers Free plan's 10 ms CPU (see the measurement below; Drew is on Free, decided 2026-10-05). The app's Export dialog builds the zip, with a `README.txt`, client-side via `src/figmaExport.ts`; every file in it is byte-for-byte the API's file for that mode (unit-tested per mode). The format rules, from Figma's import docs:
    - Colours are objects, `{colorSpace: "srgb", components, alpha, hex}`, with sRGB-encoded (not linear) components from 0 to 1. Nested groups become `/` names (`color/primary`, `ramp/primary/9`).
    - Figma makes a variable only for a token present in every file with the same `$type`, and silently drops the rest. `themeFigmaModes` (`engine/css.ts`) throws if the files differ, and if a name would collide after the `/` rename.
    - No aliases: role tokens are often not an exact ramp step. Shadows have no variable type, so they ride in `$extensions.chromaconscious.shadows`; the scrim is an RGBA colour variable.
    - CPU (Node on this machine, `process.cpuUsage`, median over 60 requests across four themes): **~8.5 ms** for the zip, of which ~6.5 ms is the three theme builds (one per contrast level), ~1 ms serializing and ~2 ms deflating; ~2.5 ms for a single `&mode=` file, which builds one level. The first zip in an isolate costs ~25 ms after warm-up (~35 ms without). Scaled by the 1.5–2× noted under Performance the zip would be ~13–17 ms on Cloudflare, over the Free plan's 10 ms, so the API no longer builds it. Single files with `state=` input (no KV read, and no stored walk checkpoint, so the riff walk replays), `process.cpuUsage`, walk trails cleared before each request, median of 9: a preset 2.2–4.0 ms per mode; riffed 10 hops with 2 locks 2.5–5.0 ms; riffed 50 hops 4.7–8.9 ms, the closest to budget, because the replay grows with the hop count (a `theme=` read restores the stored checkpoint instead). The index is ~0.1 ms. Not yet measured on Cloudflare.

  Every format includes the ID header. JSON carries it as `$extensions.chromaconscious.id`.

`/back` is the UI's "back one riff": the parent snapshot's state with the riff count one lower. An agent holding the old ID can use that ID directly.

Placement verbs the UI has but the parameters above don't cover are handled in phase 2. They are bench, derive, keep and adjust-by-picker. `derive=accent` and `bench=a8dadc` on `/generate?from=` cover them without adding endpoints.

### Response: a text summary by default

Agents read text better than nested JSON, and a human can read it in a terminal. The default response is a compact plain-text summary. `Accept: application/json`, or `?as=json`, returns the same content structured. The values below are illustrative.

```
theme t_k3v9x2   (from t_8b2mq1 · riff 3 · taste 0.50 · separation layered · contrast standard)

seats
  primary   #e03a47  yours    from #e63946   locked
  accent    #2f8f9d  derived
  neutral   #1d3557  yours
  danger    #d64545  derived
  success   #2e9e6b  derived
  warning   #d99a2b  derived
chart       #457b9d yours · #a8dadc yours · #8a6fd1 derived · #c77d3a derived · #5aa05a derived
bench       #f1faee  — lost neutral to #1d3557 by 0.04

contrast  light 19/20 · dark 20/20   (text ≥ Lc 62 · 4.5:1)
  fail  light  muted-foreground on muted  4.1 (needs 4.5)
spacing   ok
judge     0.71

open     https://drewkidwell.com/chromaconscious#t_k3v9x2
preview  …/preview?theme=t_k3v9x2&mockup=app&mode=light&as=png
```

- **Sources.** Seats come from `readBoard`, the bench's "why" from `whyLines`, and contrast from each mode's `report`. The spacing line reports the repair residuals: pairs of colors the engine couldn't push far enough apart.
- **`include=`** adds the heavier parts: `tokens`, `ramps`, `report` (the full contrast table) and `casting`.
- **Errors** are plain text with the parameter that caused them and a fix, e.g. `unknown role "primry" in colors — roles are primary, accent, neutral, danger, success, warning, chart`. The status is 422.

## State and canonical form

```jsonc
{
  "v": 1,
  "candidates": [
    { "color": "#e63946", "pin": "primary", "locked": true,
      "lockedColor": [0.6312398, 0.2011204, 25.1400131], "benched": true, "origin": "invented" }
  ],
  "fidelity": 0.5, "seed": 3, "monoBase": null, "separation": "layered", "contrast": 0.5,
  "parent": "t_8b2mq1"     // provenance only; not part of the hash
}
```

- **Canonical form.** Fixed key order, defaults and false flags dropped. **Nothing is rounded**: a lock names an exact colour and taste 0.8 must stay 0.8, and JSON numbers round-trip exactly. (Draft 2 proposed 4-decimal rounding; that would have moved locked colours.)
  - `id = "t_" + base32(sha256(canonical))[:12]` — 60 bits.
  - New state keys are added as defaults-dropped optionals so old ids still hash the same: `contrast` is omitted at `0` (standard), which is every theme stored before it existed. Unit-enforced against a recorded id.
  - Stored beside it in KV, outside the hash: `parent`, and the riff walk checkpoint (below).
- **No engine version in the ID.** Old IDs re-solve on the current engine, as decided.
- **`lockedColor` is stored as an `[l, c, h]` number array.** Hex would round it, and `oklch()` text would need a parse round-trip that isn't exact at chroma 0.

## Architecture

```
@chromaconscious/core (pure TS, no DOM)
  engine/   board.ts          as today
  ops.ts    NEW   applyOp(state, op) → state — the ONE verb set; App.tsx dispatches it too
  state.ts  NEW   schema, canonicalize, id
  query.ts  NEW   parse the query string → ops (colors/role:hex/lock/…), with friendly errors
  summary.ts NEW  the text summary and its JSON twin
        ▲                        ▲
   React UI                 Worker (/api/chromaconscious/v1/*) ── KV (snapshots)
                                  ├─ Browser Rendering (preview png)
                                  └─ WASM image decode (extract)
```

**The first step is a refactor.** The riff, start-over and mono logic currently live in `App.tsx` handlers. They move into `ops.ts`, and App dispatches ops. That shared verb set is what keeps the API an exact remote version of the UI rather than a second implementation.

## Agent access: the skill

A skill hosted on the site, e.g. `drewkidwell.com/chromaconscious/skill/SKILL.md`, which anyone can install:

```markdown
---
name: chromaconscious
description: Generate, riff, lock and export UI color themes (light+dark, contrast-checked) via the ChromaConscious API.
---
Loop: /generate → read the summary → /riff (lock what you like) → /export.
Every call returns a new theme id; keep the latest. If the project already has a
ChromaConscious export, read `t_…` from its header and continue with `from=`.
Use `curl -s`, not a summarising web fetch — exports must be byte-exact.
Full parameters and examples: https://drewkidwell.com/chromaconscious/docs.md
```

- Only the `description` line sits in the agent's context until it's needed. The docs are read only when an agent needs a parameter.
- `docs.md` is written for agents: every parameter, and one worked example per verb, with curl command and response.
- **MCP** is optional, later: the same handlers exposed as tools (`generate`, `riff`, `export`, `preview`). Add it only if an agent client can't run shell commands.

## Human ↔ agent handoff

- **Agent to person.** The summary's `open` link loads the UI with `#t_…` (or `#s=…` for a theme read by `state=`). The UI reads it into frame A on load; `#s=` needs no network.
- **Person to agent.** The Export dialog's "API / agent link" copies calls that carry the frame as `state=`: nothing is stored, and reading needs no key.
- Compare mode in the UI is simply two IDs to the API.

## Cloudflare budget

- **CPU per request.** The engine alone measured 4–9 ms. A request also parses, reads and writes KV, and formats a summary, and the first run after a quiet period is slower. On a plan with a 10 ms CPU limit, some requests would fail with error 1102. Either the plan needs a higher CPU limit, or the engine needs to get reliably under ~5 ms. [Performance](#performance) has the measurements and the fixes that get there.
- **KV writes.** Every `/generate` and `/riff` writes one snapshot. A daily write cap in the low thousands can't carry public use. Mitigation: skip the write when the ID already exists, which also makes repeated riffs over the same path free.
- **Costly endpoints:** `preview.png` (Browser Rendering) and image extraction. Cache them on `id + mockup + mode`, and rate-limit them separately.
- **Public abuse controls:**
  - Cloudflare rate-limiting rules per IP on anonymous calls, with PNG and extraction stricter.
  - A cap on hops per request (50), candidates (32) and query length.
  - Turnstile on the site's playground UI.

## Performance

Measured on a Ryzen 7 9800X3D, in Node, on the minified Worker bundle (190 KB, 50 KB gzipped). Cloudflare's servers are probably 1.5–2× slower per core. "Fresh isolate" = a new process whose first request is timed, with Node's own lazy Web API start-up (~16 ms for `Request` and WebCrypto, which a Worker has natively) paid beforehand.

**Before** (2026-09-25 review): a warm build took 1.9 ms; a first call in a fresh isolate 8–12 ms; riff cost grew ~0.055 ms per hop, so every rebuild of a theme 200 hops out cost ~14 ms and a 500-hop one ~29 ms.

**After** (phase 1, 2026-09-26), all with byte-identical output:

| | before | after |
|---|---|---|
| warm build, riff 0 | 1.94 ms | 0.91 ms |
| riff one step at hop ~200 (same process) | ~15 ms | 0.87 ms |
| fresh isolate, first `/generate` (whole request) | — | 2.3–2.9 ms |
| fresh isolate, first `/riff` with a lock | — | 3.0–4.4 ms |
| fresh isolate, riff hop 150 → 151 from a stored theme | 28–29 ms | 2.8–3.0 ms |
| assign popover at riff 200 (UI) | 65–273 ms | seed-0 probes, ~1 ms per option |

What did it:

1. **String-free contrast solver** (`engine/contrast.ts`). It bisected lightness 40 times per text colour, and each step built a hex string through culori, then re-parsed it and the unchanging background for APCA and again for WCAG. It now reads the background once and works on packed 8-bit channels with lookup tables, through a transcription of culori's conversion chain that keeps its constants and operation order. `toHex`/`toGamut` use the same path.
2. **Resumable riff walk** (`engine/walk.ts`). Each hop's end state (colours plus headings) is kept in a trail keyed by the walk's inputs; forward is one hop, back is a lookup. For the API, the stop a theme was built at is stored beside its snapshot and restored on load, so any isolate resumes instead of replaying.
3. **Warm-up at module load** (`api/worker.ts`). Runs the whole request path (parse, ops, build, summary, exports) for six presets, locking a different seat each time: ~57 ms of start-up CPU. Still to confirm: that Cloudflare doesn't charge start-up CPU to the first request.

Remaining costs over 5 ms: a trail miss at depth (changing taste or a lock at hop 40 replays those 40 hops, ~7 ms), and hops-per-request is capped at **50** so one request can't walk far. Not done yet from the review: image extraction off the main thread, and bundle splitting.

## Phases

1. **Core extraction — done** (branch `phase1/core`).
   - `ops.ts`: every UI edit is an `Op` run by `applyOp`; App dispatches them.
   - Faster solver, resumable walk with storable checkpoints, seed-0 popover probes, theme memo keyed on its inputs.
   - Regression nets: golden hashes of every engine surface over 4,254 configurations; 40 UI flows checked by pixels and by exact DOM (theme variables, seat hexes); the full e2e suite. All identical to the pre-change baseline.
2. **Worker v1 — core done**, rest open.
   - Done: `src/api/` — `/generate` (colors, preset, `from=`), `/riff`, `/back`, `/theme`, `/export` with the ID header, `/presets`; placements `derive`, `bench`, `add`, `lock`/`unlock` (seats and `chart-N`), `mono`; KV-shaped snapshots with walk checkpoints; text and JSON summaries. 12 API tests, including one that the API and the UI verbs reach identical CSS.
   - Open: the Cloudflare project itself (wrangler config, KV binding, route), the owner's API key, the `#t_…` handoff in the UI, the skill and `docs.md`.
3. **`include=`** (tokens, ramps, full report) on `/theme`.
4. **Eyes and images.** `preview.html`, `preview.png`, then image extraction.
5. **Public.** Anonymous access with rate limits and TTLs, the site playground, named themes, and optional MCP.

## Open questions

1. **Cloudflare plan.** The owner is handling it. The performance numbers are in: the free plan's CPU limit becomes workable only after the phase-1 engine changes, and its KV write cap still rules out public use.
2. **The site's own UX** (the secondary problem): the playground page, the docs page, and maybe a gallery of recent public themes. This should be its own draft.
3. **Theme gallery.** If there is a gallery, anonymous snapshots stop being private. The site should say that up front.
