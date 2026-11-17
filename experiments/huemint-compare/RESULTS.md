# ChromaConscious vs Huemint — round 1 (2026-11-16)

**Setup.** Huemint's `bootstrap-basic` template (slots: page bg, card, text, primary, secondary, 3rd accent; matrix copied from huemint.com/bootstrap-basic). Card locked to `#ffffff` the way the site does. The brand is locked in slot 3 for 8 brands: 1f6feb e63946 2a9d8f f4a261 6a4c93 606c38 ff5c1f 0f172a.
- Huemint: transformer (temperature 1.2, 50 results) and diffusion (5 results) per brand, plus one unseeded run each. That was 18 requests in total, made one at a time, on 2026-11-16.
- ChromaConscious: the brand is locked, fidelity 0.5, riff hops 0–49. Slot mapping: background, card, foreground, primary, accent-strong, chart-2.

Files:
- `raw/` holds the API responses.
- `cc.json` holds the engine dump.
- `metrics.json` and `summary.txt` hold the numbers.
- `blind-sheet.html` and `blind-key.json` hold the blind sheet (8 tiles per engine per brand, shuffled).
- `scripts/`: the scripts expect `/tmp/huemint-probe` paths. Rebuild `cc.bundle.mjs` from `cc-entry.ts` with esbuild.

## Key numbers (medians over 400 palettes per engine)

| | Huemint transformer | CC riff | CC hop 0 |
|---|---|---|---|
| ΔL between primary, secondary and 3rd (stddev) | 0.092 | 0.040 | 0.044 |
| Chroma stddev across the 3 colours | 0.048 | 0.017 | 0.016 |
| Min ΔE_ok between the 3 colours, deutan | 12.4 | 6.1 | 6.0 |
| Share with min deutan ΔE < 10 | 0.36 | 0.79 | 1.00 |
| abs(primary→secondary hue offset) | 38° | 118° | 60° (fixed) |
| Offset 0–45° (analogous) | 57% | 0% | 0% |
| Offset 135–180° | 3% | 38% | 0% |
| Page bg L / C | 0.91 / 0.033 | 0.97 / 0.020 | 0.98 / 0.010 |
| Share with ≥1 near-achromatic accent (C < .04) | 23% | 0% | 0% |
| Primary-on-white contrast, brand f4a261 | 2.06 (verbatim) | 4.34 (darkened to #ac5a16) | |

Per pair (`pairs.py`): Huemint separates its colours with about 0.13–0.17 of lightness. CC uses about 0.04–0.10, so CC's separation rests on hue, and hue is what collapses for a deutan viewer.

## Gaps for further analysis
1. **Lightness contrast between colour roles.** CC's role window holds primary and accent near L 0.45–0.68. Huemint pairs dark with light colours.
2. **Chroma mixing.** The judge's `chromaCoherence` rewards an even chroma level. Huemint mixes vivid colours with muted ones and grays (a dark navy or charcoal "secondary" is common).
3. **Hue relations.** CC's cookbook puts the accent at +60°, and the riff walks it toward complementary. Huemint prefers analogous colours with a minority at 75–135°, and almost never goes complementary.
4. **Page/card layering.** Huemint's page sits about ΔE76 10 below a white card, tinted. CC's background and card are both near-white.
5. **Things in CC's favour:** contrast guarantees (Huemint ships a 2:1 orange button), status colours, dark mode, and determinism.
