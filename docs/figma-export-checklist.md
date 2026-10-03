# Figma export: the 10-minute manual check

This checks the Figma variables export (`format=figma`, and the Export dialog's Figma option) against a real Figma account. A free Starter account is enough. The unit tests in `src/figmaExport.test.ts` already parse the files the way Figma's import docs describe. This check covers what they can't: what Figma actually does with the files.

Each step says what it proves:

- **Import only:** Figma accepted the files. It says nothing about whether the colours are right.
- **Correctness:** a wrong exporter would fail this step.

## 0. Get the files (1 min)

Use the golden fixture: the "Coastal starter" preset at default settings. The expected values below come from it.

- Without a server: the files are already in the repo at `src/engine/__golden__/figma/`. That folder has `light.json`, `dark.json`, `light-high.json`, `dark-high.json` and `README.txt`. They are byte-for-byte what the zip holds; a test enforces it.
- Or the real zip: run `npm run dev:cf`, generate the preset, then download it. The zip should hold `README.txt` plus six `.json` files.

  ```sh
  curl -s -H "Authorization: Bearer $KEY" "http://localhost:8787/api/chromaconscious/v1/generate?preset=coastal-starter"
  curl -s -o cc.zip "http://localhost:8787/api/chromaconscious/v1/export?theme=t_…&format=figma"
  unzip -l cc.zip
  ```

## 1. Import light (1 min). Proves: import only

1. In a new Figma design file, open **Local variables** (the right panel, with nothing selected).
2. Create a collection named `CC light`.
3. Drag `light.json` onto it.

Pass: there are no errors, and one mode appears. Note its name: we expect `light`, but the mode name Figma picks is unverified.

If Starter refuses the import entirely, stop and note it: the README's free-plan instructions would be wrong.

## 2. Count the variables (1 min). Proves: correctness (nothing was dropped)

Figma silently skips any token it doesn't like, so the count is the check.

- Expect **117** variables:
  - a `color` group of **45**: 44 theme tokens plus `scrim`
  - a `ramp` group with six sub-groups (`primary`, `accent`, `neutral`, `danger`, `success`, `warning`), **12** each
- Expect **no** `elevation-*` variables. Shadows aren't variables; they live in `$extensions`.

Fewer than 117 means a token was dropped. Find which one is missing; that name or type is what Figma rejected.

## 3. Spot-check three hexes and the scrim (2 min). Proves: correctness (the colour encoding)

Click each variable's swatch and read the hex in the colour picker.

| collection | variable | expect | why this one |
|---|---|---|---|
| CC light | `color/primary` | `#DB2D1C` | a saturated colour; a channel-order or rounding bug shows here |
| CC light | `color/foreground` | `#222821` | near-black; an encoding error near 0 is easy to see |
| CC dark (step 4) | `ramp/neutral/9` | `#828880` | **mid grey: the sRGB-vs-linear test.** Linear components would show `#393F37`; double-encoding would show `#BDC1BC`. Only `#828880` is right. |
| CC light | `color/scrim` | `#161D14` at **32%** opacity | the one variable with alpha; 100% would mean the alpha was lost |

Hexes match ignoring case. An off-by-one in a single channel (for example `#DB2D1D`) is a rounding bug; report it.

## 4. Import dark as a second collection (1 min). Proves: import only

The free plan allows one mode per collection, so each file gets its own collection.

1. Create a collection named `CC dark`.
2. Drag in `dark.json`.
3. Expect **117** variables again.
4. Do the `ramp/neutral/9` check from step 3.

On a paid plan, also try the documented route: drag `light.json` and `dark.json` into one collection together. You should get two modes.

## 5. Bind a rectangle and swap (2 min). Proves: import only (the variables are usable)

1. Draw a rectangle. In **Fill**, open the swatch, choose the variables tab, and pick `CC light › color/primary`. The fill shows `#DB2D1C` and is marked as bound.
2. Swap it:
   - Free plan: rebind the fill to `CC dark › color/primary`. Expect `#CE412E`.
   - Paid plan, with one collection and two modes: select the frame. In the right panel's **Layer** section, switch the mode from `light` to `dark`. The rectangle should change with no rebinding.
3. Optional, to check the contrast levels: import `light-high.json` as `CC light high`. Bind its `color/primary` and expect `#830600`, darker than standard.

This proves a designer can actually use the variables. It doesn't prove the values are right; steps 3 and 6 do that.

## 6. "Export modes" diff (2 min). Proves: correctness (every variable, not three)

This is the strongest check. It compares every value Figma stored against the file we gave it.

1. Right-click `CC light` and choose **Export modes**. (On a single mode, the menu item is **Export mode**.) Save the file as `figma-light.json`.
2. Run this from the repo root. It compares each variable's 8-bit colour and alpha. It reads `components` the way Figma does and falls back to `hex` if Figma wrote that instead.

```sh
node -e '
const fs = require("fs")
const flat = (o, p = [], out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("$")) continue
    if (v && "$value" in v) out[[...p, k].join("/")] = v.$value
    else flat(v, [...p, k], out)
  }
  return out
}
const rgb = (v) => typeof v === "string" ? v.slice(0, 7).toLowerCase()
  : v.components ? "#" + v.components.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")
  : String(v.hex).toLowerCase()
const alpha = (v) => typeof v === "object" && v.alpha != null ? Math.round(v.alpha * 1000) / 1000 : 1
const [ours, theirs] = process.argv.slice(1).map((f) => flat(JSON.parse(fs.readFileSync(f, "utf8"))))
let bad = 0
for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
  const a = ours[k], b = theirs[k]
  if (!a || !b) { bad++; console.log("MISSING", k, a ? "in Figma" : "in ours"); continue }
  if (rgb(a) !== rgb(b) || alpha(a) !== alpha(b)) { bad++; console.log("DIFF", k, rgb(a), alpha(a), "vs", rgb(b), alpha(b)) }
}
console.log(bad ? `${bad} problems` : `all ${Object.keys(ours).length} variables match`)
' src/engine/__golden__/figma/light.json ~/Downloads/figma-light.json
```

Pass: `all 117 variables match`.

- `MISSING … in Figma` means Figma dropped a token.
- `DIFF` means Figma stored a different colour. If every `DIFF` points the same way (Figma's values lighter, say), suspect the colour space.

If you have time, repeat for `CC dark` against `dark.json`.

Also note the shape of Figma's export: does it write `hex`, use upper or lower case, add `$extensions.com.figma`? None of that affects correctness, but it tells us whether a future re-import of Figma's own export is lossless.

## What to report back

- the mode name Figma gave each imported file (step 1)
- the variable counts (steps 2 and 4)
- the four spot-check values (step 3)
- the diff's last line, for light and for dark (step 6)
- your plan: Starter or paid

If something fails, say which step and paste the `DIFF` or `MISSING` lines.
