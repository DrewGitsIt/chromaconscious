# Colorblind view — spec (draft 1)

Status: 2026-10-01. Not started.

## Decisions

| | |
|---|---|
| Scope | a **view-only filter**. It never changes a color, a token or an export. |
| Types | protan, deutan, tritan. No achromatopsia (too rare to earn a slot). |
| Strength | a slider, partial … full, like WoW's |
| Links | vision travels in the theme link, so what you're shown is never hidden |
| Engine changes for colorblind safety | not planned (see [Not planned](#not-planned)) |

## Goal

themesmith exists because picking a palette is hard when you're colorblind. This feature works the other way round. It shows a person with typical color vision what their theme looks like to someone with each of the three core types of colorblindness, while they're picking it, so a collision shows up as two identical swatches on screen and not as a number in a report.

The three types (common published estimates):

| type | cone affected | full form (dichromacy) | partial form (anomalous trichromacy) |
|---|---|---|---|
| protan | L (long, "red") | protanopia, ~1% of men | protanomaly, ~1% of men |
| deutan | M (medium, "green") | deuteranopia, ~1% of men | deuteranomaly, ~5% of men, the most common form |
| tritan | S (short, "blue") | tritanopia, rare (~0.01%) | tritanomaly, rare |

Red-green (protan + deutan) covers ~8% of men and ~0.5% of women. Most of those people have the **partial** form, so the view needs a strength control, not just three on/off filters.

## What games do, and what we take from it

**World of Warcraft ships two separate features, and the distinction is the important part:**

- `colorblindsimulator` (a console variable, since patch 4.3): protanopia, protanomaly, deuteranopia, deuteranomaly, tritanopia. It shows a typically sighted developer what the game looks like to a colorblind player. **This is what we're building.**
- The Accessibility menu's filter (patch 6.1): protanopia / deuteranopia / tritanopia plus an **Adjust Strength** slider, with a `daltonize` CVar alongside it. This is *correction*: it shifts colors for a colorblind player so the game reads better to them.
- The separate "UI Colorblind Mode" adds words where color carries meaning (e.g. "Epic" in tooltips). A design lesson rather than a filter.

**Unity has no built-in mode.** The common approaches are a post-processing pass or a full-screen render feature that multiplies each pixel in linear RGB by a 3×3 matrix (Machado 2009, with a severity value s from 0 to 1). Some packages use a Channel Mixer preset instead; those presets are the old Coblis "ColorMatrix" numbers and are inaccurate (see below).

**The pipeline you described is RGB → LMS → deficiency → daltonization.** Simulation is the first half of it: linear RGB → LMS → project out what the missing cone would have told you → back to RGB. Daltonization adds a second half: take the error between the original and the simulation, then push it into channels the viewer can still see. For showing sighted people what colorblind people see, **we stop after the deficiency step**. Daltonization isn't the reverse of simulation; it's a correction applied on top of it, and themesmith doesn't need it: the filter is view-only.

## Algorithms

Following the DaltonLens review of open-source simulations, which compared them against each other and against reader feedback:

| type | full strength | partial strength |
|---|---|---|
| protan, deutan | **Viénot 1999**, adapted for sRGB: one 3×3 matrix in linear RGB | blend the result with the original in linear RGB: `(1 − s)·I + s·M` is still one matrix |
| tritan | **Brettel 1997**, adapted for sRGB: two 3×3 matrices, picking one per pixel by which side of a plane the color falls on | same blend, applied to both matrices |

- **Machado 2009** is the more principled model for the partial forms. I'm not choosing it for v1 because the reviewer ranked it below Viénot and Brettel at full strength, and the blend keeps one code path. It's a contained swap later if needed (its matrices are published per 0.1 of severity).
- **Not used:** Coblis "ColorMatrix", the Fidaner 2005 daltonize code and the many ports of it. They use CRT-era matrices and skip sRGB decoding, and DaltonLens says they shouldn't be used.
- **Every step happens in linear RGB:** decode sRGB, apply the matrix, encode again.
- **Constants:** from DaltonLens-Python 0.1.5 (public domain, sRGB-adapted Viénot and Brettel), ported into one engine file. Not the C libDaltonLens: its constants are an older precompute that disagrees by up to 4/255.

## Where it shows up

### The frame

Vision becomes a per-frame view setting, like light/dark:

- **Control:** an eye icon in the frame's label row (`FrameCard`), next to the light/dark toggle. It opens a small menu:
  - typical · protan · deutan · tritan
  - a **strength** slider (partial … full, default full)
- **Labeling:** when vision isn't typical, the label row shows it as text, e.g. `deutan · full` or `protan · 60%`. That way a screenshot or a glance can never pass a simulation off as the real palette. The label row is outside `.frame`, so it stays unfiltered, which the existing design already guarantees.
- **Compare is the main flow.** Frame A stays typical and frame B shows deutan, both on the same theme, side by side. That needs nothing new beyond the per-frame setting. "Copy A → B" copies vision the way it already copies mode.
- **Keyboard:** `v` cycles the active frame through typical → protan → deutan → tritan. Add it to `SHORTCUTS` so the tooltip and flyout pick it up.
- **Links:** opening `/themesmith#t_…&vision=deutan` (optionally `&strength=60`, a percent; default 100) opens the theme in **compare**: frame A typical, frame B with that vision. Side by side, so the link shows the simulation next to the real palette instead of quietly replacing it. The app reads the hash as it does today (`isThemeId` on the part before the first `&`). Nothing about it touches the theme id or the API; an agent can append it to the summary's `open` link by hand, and docs.md says so.
- **Embed (drewkidwell.com):** included as well. It's one control and costs nothing.
- **Not filtered:** the sidebar, the board swatches and the stage chrome. They're the tool, not the user's UI, and filtering them would make the controls themselves hard to read. (A "filter the board too" option could come later if people want to compare raw swatches.)

### What the filter covers

Everything rendered inside `.frame`: tokens, SVG charts, shadows, gradients, `color-mix()` results, and dropped photos. Simulating the pixels, not the token values, is what makes this honest. A UI is more than its tokens.

## Rendering

**One SVG `<filter>` per type, defined once in a hidden `<svg>` in App and applied with CSS:**

```css
.frame[data-vision="deutan"] { filter: url(#ts-vision-deutan); }
```

- **Protan and deutan:** one `<feColorMatrix type="matrix">`. SVG filter primitives run in **linearRGB by default** (`color-interpolation-filters`), so the matrix applies in exactly the space Viénot is defined in. The browser does the sRGB decode and encode.
- **Tritan (Brettel), four primitives:**
  1. Matrix A.
  2. Matrix B.
  3. A third `feColorMatrix` that writes the separating-plane test into alpha, as a steep ramp around 0.
  4. `feComposite`s that keep A where the mask is set and B where it isn't, then restore the source alpha.
- **Strength:** rewrite the matrix `values` attribute when the slider moves. The filter `id` stays the same, so the CSS doesn't change.
- **The same math also runs in JS,** as pure functions in `src/engine/cvd.ts`:
  - `simulate(rgbLinear, type, strength)` and an `Oklch` convenience wrapper.
  - The SVG matrix strings are generated from the same constants, so the filter and the numbers can't drift apart.
  - The JS is the reference the filter is tested against.

### Things to handle

- **Portals escape the filter.** Marketing's dropdown renders through Base UI's `Portal` into `<body>`, so with a simulation on it would open in true color. Pass each mockup a `container` inside the frame (Base UI's `Portal` accepts one). Audit Dialog and Select the same way.
- **`filter` creates a containing block.** It's also a stacking context. Any `position: fixed` inside the frame becomes fixed to the frame. No mockup uses `fixed` today; keep it that way, or note it in the mockup guidelines.
- **Locate mode:** composes fine. Locate substitutes token values, and the filter applies to whatever results.
- **8-bit intermediates:** measured. Chrome stores filter intermediates at 8 bits in the primitive's color space. Single-matrix filters (protan, deutan) are unaffected; tritan's chain lost up to 7/255 near black in linear RGB, so only its matrix steps run in linearRGB and the rest in sRGB. All three now match `cvd.ts` within 1/255 (`e2e/vision-filter.spec.ts`).
- **Performance:** a filter on a scrolling frame repaints the frame. Measure with the Analytics mockup (the heaviest); expect it to be fine at UI sizes.

## Build

- `src/engine/cvd.ts`: constants and pure simulate functions (exported, but nothing in the engine calls them).
- The filter defs, generated from `cvd.ts`.
- The per-frame `vision` + `strength` setting, the label-row control and its text label.
- The `v` shortcut.
- The link parameters.
- The portal fix.

**No engine output changes, so golden hashes are untouched.**

## Not planned

**The engine optimizing for colorblind viewers.** That would mean pairwise repair and the chart fill using the worst distance across all three simulations. It would push user-picked colors further from where they typed them, in ways the user can't see the reason for, and it adds a second notion of "too close" to explain. The view lets a person see a collision and decide for themselves.

**Possible later, if wanted:** a report-only line (`vision  deutan chart-2↔chart-4 …`) that names colliding pairs per type without moving anything. It's cheap given `cvd.ts`, but it's a second feature and isn't part of this one. The chart series already collide under deutan in every preset (see the August chart-collision note), so it would fire immediately.

## Testing

- **Unit:**
  - `cvd.ts` against reference vectors from DaltonLens-Python (same algorithms, sRGB-adapted).
  - Strength 0 is the identity.
  - Grays are unchanged in all three types.
- **Filter vs JS (Playwright):**
  - Render a grid of ~200 swatches covering hues, lightnesses and chroma, plus a dark gradient, in a frame for each type.
  - Screenshot it and compare each pixel to `cvd.ts`.
  - The pass bar is within a couple of 8-bit levels per channel.
  - This test is also how the 8-bit question gets settled.
- **A check by a deutan viewer (the owner).** Not "does it look unchanged" but *where* it changes:
  - Show a grid of pairs: each color next to its deutan simulation, at full strength.
  - Mark the pairs that look different. Then drag strength down and note where the most pairs look identical.
  - The model is an average observer on a standard sRGB screen, so some pairs will differ. Which ones (by hue, by lightness) is the useful result; it says where the simulation over- or under-shoots for a real deutan, and whether partial strength fits better than full.

## Sources

- [Blizzard Support — Using Color Blind Mode](https://support.blizzard.com/en/help/article/31224)
- [Wowpedia — CVar colorblindsimulator](https://wowpedia.fandom.com/wiki/CVar_colorblindsimulator)
- [WoW patch 6.1 colorblind support](http://worldofwarcraft.blizzard.com/en-us/news/17964863/new-colorblind-support-in-patch-61)
- [DaltonLens — Review of open-source color blindness simulations](https://daltonlens.org/opensource-cvd-simulation/)
- [Hue4U — Machado matrices in a Unity URP shader](https://arxiv.org/html/2509.06776v2)
- [SOHNE/Colorblindness — Unity URP/HDRP channel-mixer profiles](https://github.com/SOHNE/Colorblindness)
- [Unity PPv2 LMS daltonization gist](https://gist.github.com/simonwittber/acfac14329312ecbae7e28f6ba9a1c5c)
