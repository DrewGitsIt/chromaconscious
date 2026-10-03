---
name: chromaconscious
description: Generate, riff, lock and export UI color themes (light + dark, contrast-checked, shadcn/Tailwind tokens) from any colors via the ChromaConscious API. Use when a project needs a color theme, palette, or design tokens.
---

# ChromaConscious

ChromaConscious turns a few colors into a complete UI theme: six role seats (primary, accent, neutral, danger, success, warning), five chart colors, and ~47 tokens per mode, all checked for contrast in light and dark.

Base URL: `https://drewkidwell.com/api/chromaconscious/v1` (the legacy `/api/themesmith/v1` base still works too)

## The loop

1. **Generate** from colors (bare hex, no `#`; `role:hex` pins a seat). **Your colors may be adjusted to fit their roles. Add `taste=1` to keep them as typed**, which is usually what a user with brand colors wants:
   `curl -s -H "Authorization: Bearer $CHROMACONSCIOUS_API_KEY" "$BASE/generate?colors=primary:1d3557,e63946,a8dadc&taste=1"`
2. **Read the summary.** Line 1 is `theme t_…`: the id of this exact theme. Keep the latest id. The summary also shows every seat, what the engine derived, and any contrast failures. The `adjusted` lines name every color of yours that moved, why, and the parameter that stops it; `adjusted —` means none did.
3. **Riff** to explore. Add `lock=primary` (any role, or `chart-N`) to freeze a seat where it stands. Locks persist; you don't need to repeat them.
   `curl -s -H "Authorization: Bearer $CHROMACONSCIOUS_API_KEY" "$BASE/riff?theme=t_…&lock=primary"`
4. **Export** when it's right. No key is needed:
   `curl -s "$BASE/export?theme=t_…&format=css"` (or `tailwind`, `json`)

Every call returns a **new** id; nothing changes in place. To go back, use an older id, or `/back?theme=…`.

## Rules that matter

- **Use `curl -s`, not a summarizing web fetch.** Exports must arrive byte-exact.
- **Continue existing work.** If the project already has a ChromaConscious export, its first line reads `/* ChromaConscious t_… */` (older files have the legacy `/* themesmith t_… */` header; read either). Continue from that id with `/generate?from=t_…` instead of starting over.
- **Creating needs a key; reading doesn't.** `/generate`, `/riff` and `/back` need `Authorization: Bearer $CHROMACONSCIOUS_API_KEY`. A key kept in the legacy `$THEMESMITH_API_KEY` variable still works; only the variable name changed. `/theme`, `/export`, `/state` and `/presets` are open.
- **`taste`** runs from 0 to 1 (default 0.5). Below 1, a color outside its role's range (too dark, too muted…) is pulled toward it, and colors too close to a neighbor are pushed apart. At 1 your colors stay as typed; if two end up too close, the `spacing` line says so instead of fixing it.
- **`contrast`** is `standard` (default), `medium` or `high` (or 0–1). It raises every contrast target, Material 3 style: at `high` every text pair clears Lc 88 · 10:1. Use it when the user asks for accessible, high-contrast or AAA. It doesn't change which color sits where, but fills and text move further from your colors to meet it. A failure marked `unreachable` means that color can't get there; suggest a different one.
- **What `taste=1` doesn't stop:** riff moves unlocked colors (lock what must hold), and chart colors keep a lightness floor and ceiling so a series stays visible.
- **Exact brand colors everywhere?** `taste=1` plus `lock=` keeps the *seat* exact. The exported variables are derived from the seats and solved for contrast in each mode, so `--primary`, `--accent-strong` and the rest can differ from the seat's hex in light mode as well as dark. Tell the user this if they asked for exact colors everywhere.
- **Riff moves every unlocked seat, your colors included.** Lock whatever must hold before you riff.
- **Chart colors are a series stepped from the accent** (`chart-1` is the accent). They change when the accent does. To set them yourself, pass `chart:hex` (in `colors`, or in `add` to keep the rest).
- **Show a person the result** with the summary's `open` link. It opens the exact theme in the ChromaConscious app. To show how it reads to someone colorblind, append `&vision=deutan` (or `protan`, `tritan`): it opens next to a simulation of itself.

## Using the export

The variables follow shadcn/ui naming, with both modes in one file (`:root` is light, `.dark` is dark).

- `--primary` is the brand color. `--accent` is a **subtle hover/selected tint**; the bold accent color is `--accent-strong`.
- Status: `--destructive`, `--success`, `--warning`, each with `-foreground`. Their `-subtle` and `-subtle-foreground` pairs are for alert and badge backgrounds.
- Data: `--chart-1`…`--chart-5`. Depth: `--elevation-1`…`--elevation-3` (box-shadows) and `--scrim`.
- Surfaces and text: `--background`, `--card`, `--popover`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--link`, `--sidebar-*`.
- **Colors only.** Bring your own radius, spacing and type. There are no hover tokens; derive them, e.g. `color-mix(in oklab, var(--primary) 88%, var(--foreground))`.

Full parameters, responses and errors: https://drewkidwell.com/chromaconscious/docs.md
