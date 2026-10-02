# themesmith API

themesmith forges a complete UI color theme from any colors you give it:
- six role seats: primary, accent, neutral, danger, success, warning
- five chart colors
- about 44 shadcn-style tokens for light mode and again for dark
- a contrast check on every text pairing

The API drives the same engine, with the same verbs, as the app at https://drewkidwell.com/themesmith/.

- **Base URL:** `https://drewkidwell.com/api/themesmith/v1`
- **Agent skill:** https://drewkidwell.com/themesmith/skill/SKILL.md

## Concepts

- **Themes are immutable snapshots.** Every call that changes something returns a new theme id (`t_` followed by 12 characters). The theme you started from is never modified. To undo, use the older id.
- **The id is a hash of the theme's state.** The same inputs always give the same id, so repeating a call is harmless.
- **A lock freezes a seat where it currently stands.** That can be several riffs away from the color you typed. A lock persists into every theme descended from the one it was set on, until you `unlock` it. The lock is the only thing riff cannot move.
- **Colors are addressed by role, chart slot (`chart-1`…`chart-5`) or hex, never by position.** A position shifts when a color is removed; a role does not.
- **Light and dark are both always present.** `mode` only selects which one an export shows.
- **Your colors may be adjusted; `taste=1` keeps them as typed.** Below 1, a color outside its role's range is pulled toward it, and a color too close to a neighbor is pushed apart. The summary's `adjusted` lines say which colors moved, why, and how to stop it. See [Adjustments](#adjustments).
- **Chart colors are a series stepped from the accent.** `chart-1` is the accent, and derived chart colors move with it. Supply `chart:hex` colors to set them yourself.

## Authentication

`/generate`, `/riff` and `/back` create themes, so they need a key:

```
Authorization: Bearer <key>
```

Reading an existing theme (`/theme`, `/export`, `/state`, `/presets`) needs no key.

| status | meaning |
|---|---|
| 401 | No key was sent. |
| 403 | The key is not valid. |

## Endpoints

### `GET /generate`: create a theme

| param | type | | description |
|---|---|---|---|
| `colors` | list | | Comma-separated colors. Bare hex (`1d3557`) or any URL-encoded CSS color. `role:hex` places a color in a seat (`primary:1d3557`), and `chart:hex` puts it in the chart series. Order matters: earlier colors get first claim on seats. With `from`, these replace the theme's **unlocked** colors, and locked colors carry over. |
| `preset` | string | | Start from a preset (`coastal-starter`). See `/presets`. |
| `from` | theme id | | Start from an existing theme and change only what you pass. |
| `add` | list | | Append colors instead of replacing them. With `from`, this is how to change one thing and keep the rest. `chart:hex` colors fill the chart slots after `chart-1`. |
| `taste` | 0–1 | | How freely the engine may adjust your colors. `0` adjusts freely to fit their roles; `1` keeps them as typed. Default `0.5`. See [Adjustments](#adjustments). |
| `separation` | enum | | `flat`, `layered` (default) or `lifted`: how strongly surfaces separate from each other. |
| `mono` | hex \| `off` | | Mono lock. That color's hue rules every seat. |
| `lock` / `unlock` | list | | Roles or `chart-N`. Locking a seat the engine derived keeps it as your color first. |
| `bench` | list | | Colors (by role or hex) to take out of play. |
| `derive` | list | | Roles to hand back to the engine. The current holder is benched. |
| `as` | `json` | | Return the summary as JSON instead of text. |

At least one of `colors`, `preset` or `from` is required.

**Order of operations:** colors first, then settings, then placements, then locks.

```
curl -s -H "Authorization: Bearer $KEY" \
  "https://drewkidwell.com/api/themesmith/v1/generate?colors=primary:1d3557,e63946,a8dadc&taste=0.6"
```

```
theme t_levvog6reokv   (riff 0 · taste 0.60 · separation layered)

seats
  primary   #294266  yours    from #1d3557
  accent    #996da8  derived
  neutral   #b1d8d9  yours    from #a8dadc
  danger    #e63946  yours
  success   #158561  derived
  warning   #cdac00  derived
chart       #996da8 derived · #af648d derived · #b86655 derived · #a57726 derived · #758a3a derived
bench       —
adjusted    primary   #1d3557 → #294266  too dark and too muted for primary (lightness 0.328, range 0.45–0.68; chroma 0.068, range 0.07–0.23) · taste=1 keeps it as typed
adjusted    neutral   #a8dadc → #b1d8d9  too vivid for neutral (chroma 0.052, range 0–0.025) · taste=1 keeps it as typed

contrast  light 20/20 · dark 20/20
spacing   ok
judge     0.85

open     https://drewkidwell.com/themesmith#t_levvog6reokv
export   https://drewkidwell.com/api/themesmith/v1/export?theme=t_levvog6reokv&format=css
```

**Reading the summary:**
- **Seats**
  - `yours` is a color you supplied.
  - `kept` is one the engine derived and you claimed as yours.
  - `derived` is one the engine invented.
  - `from` shows the color you typed, when the seat moved off it (because of taste, spacing repair or riff).
- **`bench`** lists colors that didn't win a seat, and why.
- **`adjusted`** lists each color you supplied that the theme doesn't hold as typed: what you typed, what it holds, why it moved, and the fix. `—` means nothing moved.
- **`contrast`** counts the text pairings that pass, per mode. Any failures are listed below it.
- **`spacing`** lists pairs of seats the engine couldn't push far enough apart to tell apart.
- **`judge`** scores the palette's harmony from 0 to 1.
- **`open`** is a link that opens this exact theme in the app.

### Adjustments

Every color you supply goes through these steps, in order. The `adjusted` line names the one that moved it.

| step | what happens | stopped by |
|---|---|---|
| Role range | A color outside its role's range moves part of the way into it, by `1 − taste`. Ranges in OKLCH: primary, accent, danger and success are lightness 0.45–0.68 and chroma 0.07–0.23; warning is lightness 0.6–0.8; neutral is chroma up to 0.025. Chart colors are lightness 0.5–0.75 and chroma 0.09–0.2. | `taste=1` |
| Mono lock | With `mono` on, every unlocked seat takes the mono color's hue. | `lock`, or `mono=off` |
| Riff | Each hop moves every unlocked color. | `lock` |
| Spacing | Seats too close to tell apart are pushed apart, by up to `1 − taste` of a small allowance. At `taste=1` nothing moves and the `spacing` line lists the pair instead. | `taste=1` |
| Chart floor | Chart colors stay between lightness 0.45 and 0.8 at any taste, so a series stays visible. | Choose a lighter or darker color |

A color inside its range, with no close neighbor, isn't touched at any taste.

**The exported variables are a separate step.** Every token, `--primary` included, is derived from the seats and solved for contrast in each mode. So even an exact seat can appear as a different hex in the export, in light mode as well as dark.

### `GET /riff`: walk the palette

Every unlocked seat takes a small step through color space, including colors you supplied; locked seats hold still. Derived chart colors follow the accent. One hop is a small move; 3 to 5 hops is a clearly different option.

| param | type | | description |
|---|---|---|---|
| `theme` | theme id | required | The theme to riff from. |
| `hops` | 1–50 | | How many steps to take. Default 1. |
| `lock` / `unlock` | list | | Applied before the riff, so a seat locked here does not move. |
| `as` | `json` | | JSON summary. |

```
curl -s -H "Authorization: Bearer $KEY" \
  "https://drewkidwell.com/api/themesmith/v1/riff?theme=t_levvog6reokv&lock=primary"
```

```
theme t_fxhcneuortx6   (from t_levvog6reokv · riff 1 · taste 0.60 · separation layered)

seats
  primary   #294266  yours    from #1d3557  locked
  accent    #a371a7  derived
  neutral   #a4d9d6  yours    from #a8dadc
  danger    #e03c2d  yours    from #e63946
  success   #2a845c  derived
  warning   #d6a90b  derived
…
adjusted    danger    #e63946 → #e03c2d  riff 1 moved it · lock=danger holds it through riffs
…
```

### `GET /back`: step back through riffs

Same parameters as `/riff`. `hops` steps back that many, stopping at riff 0. Going back to a riff you already took returns the same id as before.

### `GET /theme`: read a theme's summary

`theme` (required) and `as`. No key needed.

### `GET /export`: the theme as code

| param | type | | description |
|---|---|---|---|
| `theme` | theme id | required | |
| `format` | enum | | `css` (default) gives CSS variables under `:root` and `.dark`. `tailwind` gives the same plus a Tailwind v4 `@theme inline` bridge. `json` gives DTCG design tokens. |
| `mode` | enum | | For `json` only: `both` (default), `light` or `dark`. CSS always carries both. |

Every export names its theme, so a file in a repo points back to the theme that made it:

```
/* themesmith t_fxhcneuortx6 · https://drewkidwell.com/themesmith#t_fxhcneuortx6 */
:root {
  --background: #d0fcf8;
  --foreground: #040b0b;
  --card: #cff7f4;
  …
```

In JSON the id is at `$extensions.themesmith.id`.

**The variables** follow shadcn/ui naming. `:root` holds light and `.dark` holds dark.

| variables | use |
|---|---|
| `--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--muted-foreground` | Surfaces and text, each with a `-foreground`. |
| `--primary`, `--secondary` | Buttons and brand. `--primary` is your primary seat. |
| `--accent`, `--accent-foreground` | A **subtle** hover and selected tint, as in shadcn. |
| `--accent-strong`, `--link` | The bold accent color, and link text. |
| `--destructive`, `--success`, `--warning` | Status colors. Each has `-foreground`, plus `-subtle` and `-subtle-foreground` for alert and badge backgrounds. |
| `--border`, `--input`, `--ring` | Lines, field borders, focus rings. |
| `--chart-1` … `--chart-5` | Data series. |
| `--sidebar-*` | A sidebar's own surface, text, primary, accent, border and ring. |
| `--elevation-1` … `--elevation-3`, `--scrim` | Box-shadows for raised surfaces, and the overlay behind dialogs. |

themesmith makes **colors only**. Radius, spacing and type are up to you, and there are no hover tokens: derive them, for example `color-mix(in oklab, var(--primary) 88%, var(--foreground))`.

### `GET /state`: a theme's inputs

Returns the theme's canonical state as JSON (the colors, pins, locks, taste, riff count and so on). The app uses this to open `#t_…` links. No key needed.

```
{"v":1,"candidates":[{"color":"#1d3557","pin":"primary","locked":true,"lockedColor":[0.376791374653954,0.06945781888014638,257.5119625619583]},{"color":"#e63946"},{"color":"#a8dadc"}],"fidelity":0.6,"seed":1}
```

### `GET /presets`

Returns the preset names and their colors, one preset per line.

```
Coastal starter    e63946,f1faee,a8dadc,457b9d,1d3557
Ink & sky          0f172a,38bdf8
…
```

## Errors

Errors come back as plain text that names the parameter and says how to fix it.

| status | when |
|---|---|
| 400 | `theme` is missing or isn't a theme id. |
| 401 / 403 | See [Authentication](#authentication). |
| 404 | No such theme or endpoint. |
| 422 | A parameter is invalid. For example: `unknown role "primry" in colors — roles are primary, accent, neutral, danger, success, warning, chart` |

## Limits

- At most 50 riff steps per request.
- At most 32 colors per theme.
- Themes may be re-solved when the engine improves, so an old id can produce slightly different colors later. Locked seats are stored exactly and don't change.
