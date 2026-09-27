# Themesmith remote API — spec (draft 2)

Status: draft for review, 2026-09-25. Nothing built.

## Decisions so far

| | |
|---|---|
| Host | drewkidwell.com on Cloudflare (Workers + KV) |
| Audience | the owner's agents first; public later, including site visitors playing with it |
| Agent access | a skill, loaded just in time: a SKILL.md that points to hosted docs, with calls made by `curl`. MCP later, if ever, as a thin wrapper. |
| Old links | re-solved on the current engine, silently |
| Vocabulary | the UI's words: `taste`, `riff`, `lock`, `separation`, `mono` |
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

- `generateTheme` is a pure function of `{candidates, fidelity, seed, monoBase, separation}`. It takes no clock and no randomness: `random.ts` hashes keyed draws, and riff is a step count.
- The verbs in `board.ts` map `candidates[] → candidates[]`.
- A warm call takes about 2 ms at riff 0; see [Performance](#performance).

So a theme is a small value, about 1 KB of state, and the API treats it like a git commit:

- **A theme ID** (`t_k3v9x2…`) names one immutable snapshot of the state: colors, placements, taste, riff count, mono, separation and **locks**.
  - The ID is a hash of the canonical state (below), so the same state always gets the same ID and storing it twice is harmless.
  - KV maps ID → state.
- **Every call that changes something creates a new snapshot** and returns its ID. The input snapshot never changes, so going back is just reusing the old ID.
- **No tenancy is needed for themes.** Two callers riffing the same `t_x` each get their own result. The same input gives the same output, so their results are the same `t_y`, and neither can change anything the other holds.
- **Locks live in the snapshot**, not with the caller. A lock set a week ago is still set on any theme descended from that one. A fresh `/generate` without `from=` starts with no locks.
- **Locks survive engine changes.** A locked color is stored as its exact OKLCH value (`lockedColor`). When an old ID is re-solved on a newer engine, locked seeds stay exactly the same. Unlocked seeds, and the ramps and derived shades around locked ones, may shift.

### Finding your theme again

The real problem across sessions is remembering *which* ID you were on. There are two answers:

1. **Exports carry their own ID.** Every export starts with a header naming the theme:

   ```css
   /* themesmith t_k3v9x2 · https://drewkidwell.com/themesmith#t_k3v9x2 */
   ```

   The skill tells the agent: *if the project already has a themesmith export, read the ID from its header and continue with `from=`.* The file in the repo is its own pointer back to the theme.
2. **Named themes** *(later, key-only)*. `name=site-palette` is a movable pointer to the latest ID. This is the only per-user, changeable state in the design, so it's the only thing that needs authentication. Anonymous callers only ever deal in snapshot IDs.

**Retention.**
- Snapshots written with the owner's key are kept forever.
- Anonymous snapshots expire 90 days after they were last read. KV's TTL is refreshed on each read.

## Endpoints

Base: `https://drewkidwell.com/api/themesmith/v1`. Everything an agent needs is a GET that can be typed as a `curl` one-liner. Image upload is the only POST.

```
GET  /generate?colors=primary:1d3557,e63946,a8dadc&taste=0.5&separation=layered&mono=1d3557
GET  /generate?preset=coastal-starter
POST /generate                        image body (or GET ?image=<url>): colors are extracted, then as above
GET  /generate?from=t_x&taste=0.8     tweak: parameters you leave out keep their values in t_x
GET  /riff?theme=t_x&lock=primary,chart-2&hops=1
GET  /back?theme=t_x&hops=1
GET  /theme?theme=t_x                 re-read the summary (with &include=… for more detail)
GET  /export?theme=t_x&format=css|tailwind|json&mode=both|light|dark
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
- **`mode`** is not theme state. Every theme contains light and dark, and `mode` only chooses what `/export` and `/preview` show.
- **`mono`** takes the hex of the color whose hue rules the theme, or `off`.
- **`format`** on `/export`:
  - `css` gives CSS variables
  - `tailwind` gives the Tailwind v4 `@theme` CSS
  - `json` gives DTCG tokens

  Every format includes the ID header. JSON carries it as `$extensions.themesmith.id`.

`/back` is the UI's "back one riff": the parent snapshot's state with the riff count one lower. An agent holding the old ID can use that ID directly.

Placement verbs the UI has but the parameters above don't cover are handled in phase 2. They are bench, derive, keep and adjust-by-picker. `derive=accent` and `bench=a8dadc` on `/generate?from=` cover them without adding endpoints.

### Response: a text summary by default

Agents read text better than nested JSON, and a human can read it in a terminal. The default response is a compact plain-text summary. `Accept: application/json`, or `?as=json`, returns the same content structured. The values below are illustrative.

```
theme t_k3v9x2   (from t_8b2mq1 · riff 3 · taste 0.50 · separation layered)

seats
  primary   #e03a47  yours    from #e63946   locked
  accent    #2f8f9d  derived
  neutral   #1d3557  yours
  danger    #d64545  derived
  success   #2e9e6b  derived
  warning   #d99a2b  derived
chart       #457b9d yours · #a8dadc yours · #8a6fd1 derived · #c77d3a derived · #5aa05a derived
bench       #f1faee  — lost neutral to #1d3557 by 0.04

contrast  light 43/44 · dark 44/44
  fail  light  muted-foreground on muted  4.1 (needs 4.5)
spacing   ok
judge     0.71

open     https://drewkidwell.com/themesmith#t_k3v9x2
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
      "lockedColor": "oklch(0.6312 0.2011 25.14)", "benched": false, "origin": "invented" }
  ],
  "fidelity": 0.5, "seed": 3, "monoBase": null, "separation": "layered",
  "parent": "t_8b2mq1"     // provenance only; not part of the hash
}
```

- **Canonical form.** Keys are sorted, defaults are dropped and numbers are fixed to 4 decimal places.
  - `id = "t_" + base32(sha256(canonical))[:12]`.
- **No engine version in the ID.** Old IDs re-solve on the current engine, as decided.
- **`lockedColor` is stored as `oklch()` text.** Hex would round it, and a lock is supposed to be exact.

## Architecture

```
@themesmith/core (pure TS, no DOM)
  engine/   board.ts          as today
  ops.ts    NEW   applyOp(state, op) → state — the ONE verb set; App.tsx dispatches it too
  state.ts  NEW   schema, canonicalize, id
  query.ts  NEW   parse the query string → ops (colors/role:hex/lock/…), with friendly errors
  summary.ts NEW  the text summary and its JSON twin
        ▲                        ▲
   React UI                 Worker (/api/themesmith/v1/*) ── KV (snapshots)
                                  ├─ Browser Rendering (preview png)
                                  └─ WASM image decode (extract)
```

**The first step is a refactor.** The riff, start-over and mono logic currently live in `App.tsx` handlers. They move into `ops.ts`, and App dispatches ops. That shared verb set is what keeps the API an exact remote version of the UI rather than a second implementation.

## Agent access: the skill

A skill hosted on the site, e.g. `drewkidwell.com/themesmith/skill/SKILL.md`, which anyone can install:

```markdown
---
name: themesmith
description: Generate, riff, lock and export UI color themes (light+dark, contrast-checked) via the themesmith API.
---
Loop: /generate → read the summary → /riff (lock what you like) → /export.
Every call returns a new theme id; keep the latest. If the project already has a
themesmith export, read `t_…` from its header and continue with `from=`.
Use `curl -s`, not a summarising web fetch — exports must be byte-exact.
Full parameters and examples: https://drewkidwell.com/themesmith/docs.md
```

- Only the `description` line sits in the agent's context until it's needed. The docs are read only when an agent needs a parameter.
- `docs.md` is written for agents: every parameter, and one worked example per verb, with curl command and response.
- **MCP** is optional, later: the same handlers exposed as tools (`generate`, `riff`, `export`, `preview`). Add it only if an agent client can't run shell commands.

## Human ↔ agent handoff

- **Agent to person.** The summary's `open` link loads the UI with `#t_…`. The UI reads it into frame A on load.
- **Person to agent.** A "copy for agent" item next to Export. It stores the frame as a snapshot and copies the ID and link.
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

Measured 2026-09-25 on a Ryzen 7 9800X3D, in Node, on a bundled build of the engine. Cloudflare's servers are probably 1.5–2× slower per core.

| riff hops | 0 | 10 | 50 | 200 | 500 |
|---|---|---|---|---|---|
| warm (ms) | 2.0 | 2.6 | 4.9 | 13.7 | 29.0 |
| first call in a new isolate (ms) | 8–12 | 10–14 | 14–19 | 24–29 | 44–51 |

Candidate count (2–32), mono lock and separation barely change the cost: 1.7–2.9 ms warm.

**Verdict: this doesn't fit a 10 ms CPU limit reliably today.** Getting under about 5 ms needs three changes, all in phase 1:

1. **A faster text-contrast solver.**
   - It's about 80% of every build (`engine/contrast.ts:28`). The solver works through hex strings, and the WCAG check re-parses both hexes on every call.
   - A version that works on numbers only, with 20 steps instead of 40, produced **byte-identical CSS in 540/540 configurations** and cut a warm build from 1.9 to 0.6 ms.
   - The UI benefits from this too.
2. **Warm-up builds at module load.**
   - A first call is slow mostly because the JIT hasn't warmed up. With the faster solver, one warm-up build brings the first request to 1.7 ms; five bring it to 1.15 ms.
   - Check Cloudflare's docs to confirm that start-up CPU isn't charged to the per-request limit.
3. **Resumable riffs.**
   - `walkPalette` replays every hop from 0, so riff cost grows by about 0.055 ms per hop.
   - The walk's state at hop *n* is small: the current colors plus the heading each subject is moving in. Store it in KV next to the snapshot, under the theme ID but not part of the hash. `/riff?theme=t_x` can then resume from t_x and walk one hop.
   - Changing a lock changes which subjects move, so the path changes. That riff replays from 0, as the UI does today.
   - Cap `hops` per request at **50**, not 500.

Other results from the same review concern the UI, not the API. They're phase-1 candidates because they touch the same code:

- **Assign popover.** It rebuilds the whole theme for every option: 10 ms at riff 0, 65–273 ms at riff 200. Its preview text depends only on the casting, which doesn't vary with riff (594/594 identical), so it can run `assignRoles` alone at about 0.02 ms. It also drops `separation`.
- **`useThemeResult`.** It depends on the whole frame (`App.tsx:156`), so switching mockups or modes rebuilds the theme for no reason.
- **Image extraction.** It blocks the main thread for 27–50 ms (86–182 ms at 4× CPU slowdown). Move it to a Web Worker, or downscale to 64–96 px.
- **Bundle.** 237 KB gzipped, in one chunk. The Material quantizer (87 KB), the non-default mockups and culori's full build can all be loaded lazily or trimmed.

## Phases

1. **Core extraction.**
   - Build `ops.ts` and `state.ts`, and move the App handlers onto `applyOp`.
   - Golden tests: the same state gives byte-identical CSS, and each UI verb matches `applyOp`.
   - The faster solver, resumable riff state, and a warm-up hook. The golden tests guard the solver's byte-identical output.
   - No visible change in the UI.
2. **Worker v1.**
   - `/generate` (colors and presets), `/riff`, `/back`, `/theme`, `/export` with the ID header, KV snapshots, and the owner's API key.
   - The `#t_…` handoff in the UI.
   - The skill plus `docs.md`.
3. **Remaining placement verbs** (`derive`, `bench`, `add`, `unlock`) and `include=`.
4. **Eyes and images.** `preview.html`, `preview.png`, then image extraction.
5. **Public.** Anonymous access with rate limits and TTLs, the site playground, named themes, and optional MCP.

## Open questions

1. **Cloudflare plan.** The owner is handling it. The performance numbers are in: the free plan's CPU limit becomes workable only after the phase-1 engine changes, and its KV write cap still rules out public use.
2. **The site's own UX** (the secondary problem): the playground page, the docs page, and maybe a gallery of recent public themes. This should be its own draft.
3. **Theme gallery.** If there is a gallery, anonymous snapshots stop being private. The site should say that up front.
