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
| `add` | list | | Append colors instead of replacing them. |
| `taste` | 0–1 | | `0` adjusts your colors freely to fit their roles. `1` keeps them verbatim and may miss contrast targets. Default `0.5`. |
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
- **`contrast`** counts the text pairings that pass, per mode. Any failures are listed below it.
- **`spacing`** lists pairs of seats the engine couldn't push far enough apart to tell apart.
- **`judge`** scores the palette's harmony from 0 to 1.
- **`open`** is a link that opens this exact theme in the app.

### `GET /riff`: walk the palette

Every unlocked seat takes a small step through color space; locked seats hold still.

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
