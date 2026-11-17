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
   For Figma: `curl -s -o dark.json "$BASE/export?theme=t_…&format=figma&mode=dark"`, one file per mode (`light`, `dark`, `light-medium`, `dark-medium`, `light-high`, `dark-high`). Without `mode=` you get an index of the six URLs. Import each into Figma's Local variables; on the free plan, each file is its own collection.

Every call returns a **new** id; nothing changes in place. To go back, use an older id, or `/back?theme=…`.

## Rules that matter

- **Use `curl -s`, not a summarizing web fetch.** Exports must arrive byte-exact.
- **A theme can travel whole as `state=`.** Anywhere you'd pass `theme=t_…`, you can pass `state=<payload>` instead: the payload after `#s=` in a ChromaConscious share link or export header. It needs no key and nothing stored. A `state=` theme riffed more than 40 hops gets a 422: the API won't replay that deep from a link. Build deep themes with `/generate` and `/riff` instead; their `theme=t_…` ids have no limit, and the link still opens in the app. If a person hands you a link like `…/chromaconscious#s=AgEDAR01VwDmOUYAqNrcPA`, read it with `$BASE/theme?state=AgEDAR01VwDmOUYAqNrcPA`.
- **Continue existing work.** If the project already has a ChromaConscious export, its first line reads `/* ChromaConscious t_… · …#s=… */` (older files have `…#t_…`, or the legacy `/* themesmith t_… */` header; read any). Continue from it with `/generate?state=<the s= payload>`, or `/generate?from=t_…` for an older file, instead of starting over.
- **Creating needs a key; reading doesn't.** `/generate`, `/riff` and `/back` need `Authorization: Bearer $CHROMACONSCIOUS_API_KEY`. A key kept in the legacy `$THEMESMITH_API_KEY` variable still works; only the variable name changed. `/theme`, `/export`, `/state` and `/presets` are open, by `theme=` or `state=`.
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

## Applying the colors

The theme gives you good colors. Where you spend them decides whether the page works. Color is a signal: each color should tell the reader what something *is* or how much it needs them.

**Write a color plan first.** Before any CSS, put a short comment at the top of your stylesheet that answers three questions:

1. What does each brand color mean on this page?
2. What needs the reader's attention most?
3. What are the actions, from most to least important?

Then build to the plan.

1. **Give each brand color one meaning, and use it wherever that meaning appears.** The theme has two brand colors: `--primary` and `--accent-strong` (with `--accent` as its soft tint). Decide what each one stands for here. For example, primary is "act here, and where you are", and accent is "what you earn". Every instance of that meaning gets that color, and nothing else does. A color that repeats with a single meaning makes a screen feel consistent and easy to scan. There is no quota; the rule is one meaning per color.
2. **Rank attention, then match the strength.** List what is on the screen by how much it needs the reader *now*. Give each item treatment in proportion:
   - **Fine or normal:** no status color. At most a quiet word.
   - **Worth knowing:** a small icon or word in the status color.
   - **Needs action soon** (a deadline, a price change, a pending step): a tinted container (`--warning-subtle`, `--destructive-subtle` and similar) with an icon, a clear heading and its own action. Place it high on the screen.
   - **Broken or urgent:** a solid status fill, sparingly.

   The top-ranked item should be the one the eye finds second, after the page's main subject.
3. **Style actions by importance.** In each region, the main action is a solid `--primary` button. Secondary actions are `--secondary` or outlined. Minor actions ("See all", "Later", "Details") are `--link` text or quiet buttons. Anything tappable must look tappable, and nothing that isn't tappable should look like a button.
4. **Status colors mean status, nothing else.** `--warning` means caution, even if your brand is amber. If a brand color sits near a status hue (look at the summary's seats), don't use the brand color anywhere it could be read as a status, and always put an icon or word next to status colors.
5. **Neutrals do the structure.** Separate regions with the surface ladder (`--background` → `--card` → `--muted`), spacing and `--border` hairlines. To mark a selected block without spending a hue, invert it: `--foreground` as its background.
6. **Data follows meaning.** A meter's fill uses the color of what it measures, on a `--muted` track, with the value printed beside it. It turns `--warning` or `--destructive`, with a label, only when a threshold is crossed. Use `--chart-1…5` only when categories need telling apart.
7. **Mix tints; don't invent colors.** `color-mix(in oklab, var(--accent-strong) 14%, var(--card))`. Every color should trace back to a token.
8. **Audit against your plan.** Every colored element should map to a line in your plan. Remove anything that doesn't, and add color anywhere the plan's meaning appears without it.

**Follow the guide for what you are building** on top of the rules above. This project is an app screen, so its guide follows.

## App screens and dashboards

People open an app to check something and act on it. They come back often, so color has to work as a reliable code: the same color means the same thing on every screen, and the eye learns where to look.

- **Lead with the subject, then what needs attention.** The top of the screen holds what the screen is about (the balance, the status, today's number) at the largest size, in `--foreground` or on a single `--primary` block. The highest-ranked attention item comes next, not buried below the routine content.
- **Routine content stays quiet.** Lists, history and settings use neutral text and surfaces. Icons in lists are `--muted-foreground` on `--muted`, unless the icon itself carries the item's meaning in your plan, such as "credit" in your accent.
- **Brand color is a thread, not a splash.** The accent appears wherever its meaning does: the earnings figure, the matching icon in history, the chart series for that quantity. A reader should be able to scan for the accent and find every instance of its meaning.
- **Navigation:** the active tab or item uses `--primary` (icon and label, or a `--secondary` pill behind them). Inactive items use `--muted-foreground`, and nothing else in the bar has color.
- **Trends and deltas:** up or down is a judgment only when the domain says so. "12% above forecast" for solar output is good news: give it `--success` text with an arrow. A neutral change gets `--muted-foreground`. Never use color without the sign or arrow beside it.
- **Density:** prefer rows separated by dividers over a card for every item. Use cards to group, not to wrap each line.
