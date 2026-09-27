---
name: themesmith
description: Generate, riff, lock and export UI color themes (light + dark, contrast-checked, shadcn/Tailwind tokens) from any colors via the themesmith API. Use when a project needs a color theme, palette, or design tokens.
---

# themesmith

themesmith turns a few colors into a complete UI theme: six role seats (primary, accent, neutral, danger, success, warning), five chart colors, and ~44 tokens per mode, all checked for contrast in light and dark.

Base URL: `https://drewkidwell.com/api/themesmith/v1`

## The loop

1. **Generate** from colors (bare hex, no `#`; `role:hex` pins a seat):
   `curl -s -H "Authorization: Bearer $THEMESMITH_API_KEY" "$BASE/generate?colors=primary:1d3557,e63946,a8dadc"`
2. **Read the summary.** Line 1 is `theme t_…`: the id of this exact theme. Keep the latest id. The summary also shows every seat, what the engine derived, and any contrast failures.
3. **Riff** to explore. Add `lock=primary` (any role, or `chart-N`) to freeze a seat where it stands. Locks persist; you don't need to repeat them.
   `curl -s -H "Authorization: Bearer $THEMESMITH_API_KEY" "$BASE/riff?theme=t_…&lock=primary"`
4. **Export** when it's right. No key is needed:
   `curl -s "$BASE/export?theme=t_…&format=css"` (or `tailwind`, `json`)

Every call returns a **new** id; nothing changes in place. To go back, use an older id, or `/back?theme=…`.

## Rules that matter

- **Use `curl -s`, not a summarizing web fetch.** Exports must arrive byte-exact.
- **Continue existing work.** If the project already has a themesmith export, its first line reads `/* themesmith t_… */`. Continue from that id with `/generate?from=t_…` instead of starting over.
- **Creating needs a key; reading doesn't.** `/generate`, `/riff` and `/back` need `Authorization: Bearer $THEMESMITH_API_KEY`. `/theme`, `/export`, `/state` and `/presets` are open.
- **`taste`** runs from 0 to 1. At 0 the engine adjusts your colors freely to fit their roles. At 1 it keeps them verbatim, and may miss contrast targets; the summary says which.
- **Show a person the result** with the summary's `open` link. It opens the exact theme in the themesmith app.

Full parameters, responses and errors: https://drewkidwell.com/themesmith/docs.md
