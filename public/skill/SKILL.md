---
name: chromaconscious
description: Generate, riff, lock and export UI color themes (light + dark, contrast-checked, shadcn/Tailwind tokens) from any colors via the ChromaConscious API. Use when a project needs a color theme, palette, or design tokens.
---

# ChromaConscious

ChromaConscious turns a few colors into a complete UI theme: six role seats (primary, accent, neutral, danger, success, warning), five chart colors, and ~47 tokens per mode, all checked for contrast in light and dark.

Base URL: `https://drewkidwell.com/api/chromaconscious/v1` (the legacy `/api/themesmith/v1` base still works too)

## The loop

1. **Generate** from colors (bare hex, no `#`; `role:hex` pins a seat). **Your colors may be adjusted to fit their roles. Add `taste=1` to keep them as typed**, which is usually what a user with brand colors wants:
   `curl -s "$BASE/generate?colors=primary:1d3557,e63946,a8dadc&taste=1"`
2. **Read the summary.** Line 1 is `theme t_…`: the id of this exact theme. Keep the latest id. The summary also shows every seat, what the engine derived, and any contrast failures. The `adjusted` lines name every color of yours that moved, why, and the parameter that stops it; `adjusted —` means none did.
3. **Riff** to explore. Add `lock=primary` (any role, or `chart-N`) to freeze a seat where it stands. Locks persist; you don't need to repeat them.
   `curl -s "$BASE/riff?theme=t_…&lock=primary"`
4. **Export** when it's right:
   `curl -s "$BASE/export?theme=t_…&format=css"` (or `tailwind`, `json`)
   For Figma: `curl -s -o dark.json "$BASE/export?theme=t_…&format=figma&mode=dark"`, one file per mode (`light`, `dark`, `light-medium`, `dark-medium`, `light-high`, `dark-high`). Without `mode=` you get an index of the six URLs. Import each into Figma's Local variables; on the free plan, each file is its own collection.

Every call returns a **new** id; nothing changes in place. To go back, use an older id, or `/back?theme=…`.

## Rules that matter

- **Use `curl -s`, not a summarizing web fetch.** Exports must arrive byte-exact.
- **A theme can travel whole as `state=`.** Anywhere you'd pass `theme=t_…`, you can pass `state=<payload>` instead: the payload after `#s=` in a ChromaConscious share link or export header. It needs nothing stored. A `state=` theme riffed more than 40 hops gets a 422: the API won't replay that deep from a link. Build deep themes with `/generate` and `/riff` instead; their `theme=t_…` ids have no limit, and the link still opens in the app. If a person hands you a link like `…/chromaconscious#s=AgEDAR01VwDmOUYAqNrcPA`, read it with `$BASE/theme?state=AgEDAR01VwDmOUYAqNrcPA`.
- **Continue existing work.** If the project already has a ChromaConscious export, its first line reads `/* ChromaConscious t_… · …#s=… */` (older files have `…#t_…`, or the legacy `/* themesmith t_… */` header; read any). Continue from it with `/generate?state=<the s= payload>`, or `/generate?from=t_…` for an older file, instead of starting over.
- **No key is needed** for any call. If `/generate` or `/riff` answers with `#s=…`/`state=…` links instead of a `t_…` one, the theme store was unavailable: carry on with `state=` as you would an id.
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
- **Ramps** (`format=figma` only, `ramp/<role>/<1–12>`): steps 1–8 are surfaces and lines from the page outward (neutral: 1 `background`, 2 `card`, 3 `muted`, 6 `border`, 7 `input`), 9 is the seat's solid and 10 its hover, 11–12 are text (`muted-foreground`, `foreground`). Steps 9–10 aren't on the surface ladder, so never map 1–12 in order.
- **Colors only.** Bring your own radius, spacing and type. There are no hover tokens; derive them, e.g. `color-mix(in oklab, var(--primary) 88%, var(--foreground))`.

## Mapping to your own tokens

A seat is a fill color, like a light-mode button. Roles have lightness ranges, and the engine derives dark mode itself. So seed each seat with the color you'd fill a light-mode button or badge with, not a finished dark-mode token or a text tint. Each seat does one job; translate a project's tokens by job, not by name:

- **primary**: the brand color, what people click, the loudest voice. Becomes `--primary`.
- **accent**: the quiet second voice: where you are, what's selected, what's linked. Becomes `--accent` (tint), `--accent-strong`, `--ring`, `--link`, `--chart-1`.
- **neutral**: surfaces, lines and text; most of the pixels. Becomes the surfaces, `--border`, `--input` and the text colors.
- **danger**: destructive actions and errors, the only color allowed to alarm.
- **success**: confirmations and healthy states.
- **warning**: cautions that aren't failures: expiring, degraded, needs a look.
- **chart**: data series, kept apart from each other and from the page.

When a project has a job no seat names, use the seat whose job is closest (an `info` color informs without alarming: accent), and tell the user which you chose.

Full parameters, responses and errors: https://drewkidwell.com/chromaconscious/docs.md
