# Round 3: component skills · Opus 5.5 · baseline vs frontend-design vs taste-skill vs impeccable · 3 runs each

Same fixed-content brief and theme as round 2 (`t_gbjq4hmqx64r`). Every arm loads the ChromaConscious skill; each non-baseline arm also has one design skill in `skills/`. The skill sources are in `vendor/SOURCES.txt`; impeccable's `scripts/` were left out because its launcher downloads a binary, so it ran on its documented "launcher unavailable" fallback. Every arm got the same screenshot tool and the same rules. The key is in `../r3-key.json`, the blind page is `blind.html` and its letters are in `../r3-blind-letters.json`.

## Process notes

- **Looking at their own work:** 11 of 12 runs screenshotted their page with our tool (all except impeccable-3). Two taste-skill runs also used its own inspector.
- **Rule breach:** taste-skill's `draw.mjs` wrote `~/.taste-skill/history.json` despite the "keep files here" rule. The file was moved to `taste-skill-home-history.json` here, and the home directory is clean.
- **Coupling:** that history file is shared, and draw.mjs uses it to avoid repeating a direction. The three taste runs were therefore steered away from each other (two "open-plane" shells, one "icon-rail"), so they weren't independent.
- No page loads external resources.

## Metrics

| arm | colored % | dark % | colored regions |
|---|---|---|---|
| baseline | 16.9 | 12.9 | 6.7 |
| frontend-design | 18.5 | 16.3 | 6.7 |
| impeccable | 25.1 (15 / 31 / 30) | 22.2 | 4.7 |
| taste-skill | **4.6** | 3.1 | 4.7 |

The contrast column is omitted: as in round 1, the 4–6 "failures" per Opus page come from pseudo-element and translucent backgrounds.

## Non-blind observations

- **Layout barely moved.** All 12 builds share the same skeleton: header, greeting, credit hero, alert card, use and output, activity list, tab bar. None of the skills broke the stack of cards.
- **frontend-design looks almost the same as baseline.** It adds a bigger sun motif and split cents.
- **Impeccable 2 and 3 are the most structurally different.** A full-bleed navy band holds the greeting and the credit, and the alert overlaps the band in run 3.
- **Taste-skill put the credit in a peach (amber-tint) card.** That's the treatment the user disliked in round 2. It also used plainer activity rows and output-vs-forecast bars.

## User's blind verdict (2026-11-01)

| Pick | Builds |
|---|---|
| Favorites | A **baseline-1**, C **baseline-2**, G **impeccable-1** |
| Interesting | B **impeccable-3** (full-bleed band, "distracting"), J **impeccable-2** (same idea, "fine") |
| Worst | E, I, L: **all three taste-skill**, "info-flavored colors on primary cards" |
| Unremarked | D, H, K (all frontend-design), F (baseline-3) |

The user's verdict: "these don't look very different from base Opus runs … all these rounded, generic cards everywhere."

- **No skill beat baseline.** Baseline has now led all three rounds. frontend-design looked the same as baseline. Impeccable was the only skill that changed structure, and the results were mixed. Taste-skill came last.
- **The recurring failure is ChromaConscious's.** In all three rounds, the most-disliked builds used `--accent`, the brand tint (#ffead3), or a mix of accent-strong, as the credit card's background. That tint is **ΔE_ok 3.7** from `--warning-subtle` (#faf8e9), so the brand card reads as a warning. The engine emits a brand tint almost identical to its warning tint.
