# The Science of Pleasing Color Palettes: Color Harmony and Color Aesthetics (empirical evidence and rules you can compute)

Scope note: Most harmony studies cited below used small samples (often 9 to 40 observers) from universities in the UK, US or EU. These are WEIRD (Western, educated, industrialized, rich, democratic) populations, and observers with color-vision deficiency (CVD) were screened out. Exceptions are flagged where they occur: Ou et al. 2018 (12 regions), O'Donovan et al. 2011 (MTurk, 50% Indian), Palmer & Schloss (US vs Japan), Taylor et al. (Himba), Forni et al. 2025/26 (France, Japan, EU).

---

## 1. Do the classical theories hold up? (Itten, Munsell, Moon–Spencer, Chevreul, Albers, hue-wheel templates)

### Takeaway
None of the classical theories came from aesthetic measurements. When they were tested later, the hue-wheel geometry (complementary, triadic, Matsuda/Kuler templates) mostly failed to predict ratings. The better-supported parts are Chevreul's "harmony of analogous colors", Munsell/Ostwald's "same hue, vary lightness", and the "natural order" of hue lightness. Chevreul's "harmony of contrast" survives only in a narrower form: people like a figure color that contrasts with its ground, even when they do not rate the pair as harmonious.

### Cited Findings
- Palmer, Schloss & Sammartino (Annual Review of Psychology 2013): "none of these theories [Chevreul, Itten, Munsell, Ostwald, Goethe, Moon & Spencer] were formulated on the basis of aesthetic measurements, although some have since been tested empirically." They summarize the theories as follows. Chevreul has two harmonies, analogous and contrast. Itten holds that colors are harmonious if they mix to neutral gray as paints. Munsell and Ostwald hold that harmony comes from orderly relations, e.g. constant hue and saturation with varying lightness — [Palmer, Schloss & Sammartino 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- Granger (1955) reported that harmony increases with hue contrast. Later studies found that both harmony and pair preference *decrease* with hue contrast (Ou et al. 2004; Ou & Luo 2006; Schloss & Palmer 2011; Szabó et al. 2010). Granger's result does match *figural* preference, which does increase with hue contrast — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- The literature is confused because researchers mixed up three different judgments: (a) pair preference, (b) pair harmony ("go together"), and (c) figural preference (liking a figure color on a colored ground). The terms "preference" and "harmony" have been used interchangeably since Chevreul — [Schloss & Palmer 2011, Atten. Percept. Psychophys. 73:551–571](https://pmc.ncbi.nlm.nih.gov/articles/PMC3037488/)
- Hue templates were tested on large data in O'Donovan, Agarwala & Hertzmann (SIGGRAPH 2011). The datasets were 104,426 Kuler themes with 327,381 ratings from 22,376 users, 383,938 COLOURlovers themes, and 10,743 themes rated 40× each on MTurk. They found "little evidence that people gravitate to templates naturally, or that matching a template produces higher scores." Themes close to templates actually scored slightly *lower* on Kuler and COLOURlovers, which the authors attribute to inexperienced users. No single template showed a positive relationship between adherence and rating. Matsuda's extra templates do not show up in user-made themes at all. Earlier support for complementary and triadic templates (Ou & Luo 2006; Szabó et al. 2010) came from only 17 and 9 participants — [O'Donovan et al. 2011 PDF](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- Wei et al. (International Journal of Design, 2014; juice packaging; 20 Leeds observers) tested the conventional principles one by one. Hue similarity was "perhaps the most consistent effect across the findings" and was supported. The complementary-hue principle was not supported: complementary pairs looked *disharmonious*. Equal chroma, equal lightness, complementary lightness, and the high-lightness and ΔL principles were not supported in that product context. The authors conclude "only two conventional colour harmony principles are tenable" (similar hue; similar hue plus similar chroma) — [Wei et al., IJDesign](http://www.ijdesign.org/index.php/ijdesign/article/view/1130/612)
- **Contrary finding:** Forni, Darmon & Benzaquen (arXiv 2508.15777, 2025; published in iScience 2026) had 346 respondents (France, Japan/OIST, Europe) pick the most and least harmonious pairs among 13 hues shown as 8×8 checkerboards. Saturation and lightness were fixed at HSL S=0.8, L=0.5. Preferences were "highly hue dependent, challenging the assumption of universal harmony rules". When averaged over hues, people preferred pairs that were *almost opposite* on the wheel. This matched hue statistics from 12,000 natural landscape images, where dominant hues are often ~180° apart — [arXiv](https://arxiv.org/abs/2508.15777); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13264017/)
- The "natural order of hues" (yellow is the lightest hue, violet/ultramarine the darkest) dates to Rood (1879) and Goethe, and Munsell built it into his color tree (yellow high, purple-blue low). I found no controlled experiment that directly tests natural vs. reversed lightness orderings in palettes. See §3 for indirect evidence — [Harlan, "The Color Wheel and the Natural Order of Colors"](https://noteaccess.com/Texts/Harlan/HaCW.htm)

### Inferences
- The Forni result conflicts with the hue-similarity consensus. Fixing HSL L=0.5 does not fix *perceived* lightness: at HSL L=0.5, yellow is far lighter than blue. Their "complementary" pairs therefore probably also differed a lot in lightness, which other studies show raises preference. Treat this as a confound to check, not a refutation.
- An agent should not use hue-wheel templates as a scoring function. At most, use them to propose candidates, then score the candidates with models that include lightness and chroma.
- Itten's mix-to-gray criterion has no empirical support that I found. Albers' work (Interaction of Color) is about simultaneous contrast and relativity, not a harmony rule. It is relevant to context effects (§4) but has not been tested as a predictive theory.

### Gaps
- No direct empirical test of Albers or Itten as harmony predictors was found.
- I could not get the full text of Szabó, Bodrogi & Schanda 2010 (Color Res. Appl. 35:34–49, CIECAM02-based, 2- and 3-color). Its equations are not reproduced here.

---

## 2. Quantitative harmony models (Ou & Luo, Szabó, Schloss & Palmer, O'Donovan, ML 2015–2026)

### Takeaway
The Ou & Luo (2006) two-color model is the most concrete equation you can compute. It works in CIELAB and is additive: harmony = chromatic-difference term + lightness term + hue term. Its rules are: small chromatic difference, high summed lightness, some lightness difference, and light yellows good / dark yellows bad. Multi-color palettes can be scored by averaging all pairs (Ou 2011). Data-driven models (O'Donovan 2011, Colorgorical 2017) agree on these points: lightness features dominate, hue variety should be moderate (2–3 hue families), and a light-to-dark gradient scores well.

### Cited Findings
**Ou & Luo 2006 (Color Res. Appl. 31:191–204).** 1,431 pairs built from 54 CIELAB colors, shown on a CRT on mid-gray, rated on a 10-category scale. Observers were from Leeds and Ishihara-screened. O'Donovan reports n≈17. Equations (as restated in a later patent; the paper's fitted Eq. 4 is HLsum = 0.28 + 0.54·tanh(−3.88 + 0.029·Lsum)) — [Ou & Luo 2006, Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.20208); [ResearchGate PDF](https://www.researchgate.net/profile/Ming-Luo-13/publication/229906278_A_color_harmony_model_for_two-color_combinations/links/5c0c957192851c39ebde1ea2/A-color-harmony-model-for-two-color-combinations.pdf); [US patent 9134179 restating the model](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9134179)
```
CH  = HC + HL + HH
HC  = 0.04 + 0.53·tanh(0.8 − 0.045·ΔC),   ΔC = sqrt( (ΔH*ab)² + (ΔC*ab/1.46)² )
HL  = HLsum + HΔL
HLsum = 0.28 + 0.54·tanh(−3.88 + 0.029·Lsum),   Lsum = L*1 + L*2
HΔL = 0.14 + 0.15·tanh(−2 + 0.2·ΔL),   ΔL = |L*1 − L*2|
HH  = HSY1 + HSY2;  HSY = EC·(HS + EY)
EC  = 0.5 + 0.5·tanh(−2 + 0.5·C*ab)
HS  = −0.08 − 0.14·sin(hab + 50°) − 0.07·sin(2·hab + 90°)
EY  = ((0.22·L* − 12.8)/10) · exp{ (90° − hab)/10 − exp[(90° − hab)/10] }
```
- A variant for non-adjacent colors appears in the patent: HC,N = 0.2 + 0.65·tanh(1.7 − 0.045·ΔCN), ΔCN = sqrt(ΔH² + (ΔC/1.30)²) — [US patent 9134179](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9134179)
- **Additivity (Ou et al. 2011).** A 3-color combination is scored as the mean of its three pair scores. Correlation with observers was r=0.71 for 6,545 color wheels, 0.93 for 111 interior images, and 0.88 for 90 more wheels — [Ou et al. 2011, "Additivity of colour harmony"](https://onlinelibrary.wiley.com/doi/10.1002/col.20624)
- **Universal model (Ou et al. 2018, Color Res. Appl. 43:736–748).** Built from psychophysical data in **12 regions** (author affiliations include Taiwan, Thailand, Spain, Hungary, Japan, UK). The harmony model reached an average r=0.72. "Colour emotion was found to be relatively more culture‑independent than [colour harmony]." PCA looked at hue similarity, chroma similarity and lightness principles. I could not retrieve the full equations — [Ou et al. 2018](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.22243)
- **Szabó, Bodrogi & Schanda 2010** is a CIECAM02-based 2- and 3-color model with n≈9 per O'Donovan. Citing papers credit it with the principles of hue similarity, equal chroma, small chroma difference or large chroma sum, equal lightness, complementary lightness, and high lightness — [Wei et al. IJDesign summary](http://www.ijdesign.org/index.php/ijdesign/article/view/1130/612); [Szabó et al. 2010 listing](https://www.researchgate.net/publication/227668859_Experimental_Modeling_of_Colour_Harmony)
- **Schloss & Palmer 2011.** Figure-on-ground pairs, 992 pairs, Berkeley undergraduates. Pair preference and harmony both rise with hue similarity. Pair preference also rises with **lightness contrast**, but harmony does not. Harmony is higher for lighter pairs and for pairs similar in saturation. Pair preference and harmony correlate r=+0.79. Observers agree more on harmony (mean between-observer r=+0.51) than on preference (r=+0.36). More than 80% of the variance in pair preference is explained by harmony + the two single-color preferences + figure–ground lightness difference (multiple R=0.89). Single-color preferences alone explain only 21.7% — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf); [Schloss & Palmer 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3037488/)
- **Figural preference.** It correlates r=0.87 with preference for the same color on neutral ground. After that is partialled out, it rises with hue contrast and lightness contrast against the ground. A plausible mechanism is simultaneous contrast increasing perceived saturation — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- **O'Donovan et al. 2011.** LASSO model on 334 features across RGB, CIELAB, HSV and CHSV. On MTurk it cut MAE 32% vs. a mean baseline (0.267→0.179 on a 1–5 scale) and MSE 53%. It was weaker on Kuler (MAE 0.572→0.521) and COLOURlovers (0.703→0.664). Its most important features:
  - **lightness.** MTurk's top feature was *mean lightness* (bright themes preferred). On Kuler, *max lightness* mattered: dark themes are fine if at least one color is bright. The min–max lightness range was weighted highly. All models heavily penalized a high *standard deviation* of lightness. Together these favor "high contrast with low standard deviation, that is, a gradient", and many top-rated MTurk themes are simple light-to-dark gradients.
  - **hue.** Positive weight on mean pairwise hue co-occurrence probability (popular hue pairs, warm hues and cyans). Negative weight on the min of pairwise hue probability, which flags themes where all colors are the same: "a set of good colors should be reasonably popular, but not too similar."
  - **hue entropy.** Penalized on MTurk and COLOURlovers (too many hues). Designers on Kuler/COLOURlovers prefer entropy equivalent to ~2–3 hues. MTurk gives no penalty for monochromatic themes.
  - **Kuler-specific.** Standard deviation in CIELAB b* is the most positive feature (bimodal blue/yellow sets), and a large b* range is penalized, which keeps saturation in check.
  - **optimization.** Changing colors (CMA-ES, ΔE≤35 in CIELAB) produced themes MTurk users preferred over the originals for the worst, best and random sets alike.
  - **source.** [O'Donovan et al. 2011](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- **Colorgorical (Gramazio, Laidlaw & Schloss, IEEE TVCG 2017).** Builds categorical palettes by sampling CIELAB with a weighted sum of CIEDE2000 perceptual distance, name difference, name uniqueness (XKCD names) and Schloss–Palmer *pair preference*. Pair preference favors similar hue, different lightness, and cool hues. Its palettes were as discriminable as benchmark designer palettes (ColorBrewer, Tableau) and at least as preferred. Open source — [Colorgorical TVCG](https://dl.acm.org/doi/10.1109/TVCG.2016.2598918); [Schloss Lab](https://schlosslab.discovery.wisc.edu/colorgorical-an-interactive-color-palette-generating-tool/)
- **Newer ML work (2015–2026).** A 2025 "Unified Color Harmony Model" (Xu et al., Color Res. Appl.) uses SeqGAN to generate combinations. Clothing-matching work (2025) found Ou's model less effective for two-color clothing combinations than Huang's model (Liu & Ou 2017). Critics note that the classic models rest on few participants and only 2–3 colors. I did not retrieve details or accuracy figures for these — [Xu et al. 2025](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.22977); [Clothing ML/DL 2025](https://link.springer.com/article/10.1186/s40691-025-00433-y)

### Inferences (derived from the equations above; my arithmetic, not stated by the authors)
- **HΔL (lightness difference)** has its midpoint at ΔL*=10 and saturates by about ΔL*≈20. Beyond that, extra lightness difference adds almost no harmony. It does not penalize it either, so the large ΔL needed for text contrast is "free" under this model.
- **HLsum (summed lightness)** has its midpoint at Lsum≈134, i.e. a mean L*≈67, and rises steeply between about 100 and 170. Light palettes score as more harmonious, which matches Schloss & Palmer and O'Donovan's mean-lightness feature. This penalizes dark themes. A dark UI theme needs at least one high-L* element, per the Kuler max-lightness result.
- **HC (chromatic difference)** crosses zero at ΔC≈17.8 CIELAB units, with chroma differences discounted by ÷1.46 relative to hue differences. Harmony falls as two colors diverge in hue/chroma, so keep accents near the base hue, or keep their chroma low.
- **EC** is a gate: the hue terms only matter above about C*≈4–8. Near-neutrals (tinted grays) are hue-neutral under this model.
- **EY** is a yellow bonus/penalty peaking near hab≈90° (CIELAB yellow). Its sign flips at L*≈58: light yellows add harmony and dark yellows (olive) subtract. This is a quantitative "natural order" term and matches the cross-cultural dislike of dark yellow (§3).
- **Recommended agent scorer.** For an N-color palette, take the mean Ou CH over all pairs (Ou 2011 additivity). Add O'Donovan-style terms: reward a monotonic L* range, penalize L* standard deviation that isn't gradient-like, and penalize more than ~3 hue clusters. The Ou model is in CIELAB under CRT/D65 conditions. Converting from OKLCH requires going to CIELAB first, and the coefficients are not validated in Oklab.

### Gaps
- I could not retrieve the full equations or coefficients for Ou et al. 2018 (universal model) or Szabó 2010. Nor could I find out whether either beats Ou 2006 on UI-like stimuli.
- No harmony model found was validated on full UI themes (backgrounds + text + accents) as opposed to patches, wheels or interiors.
- I found no peer-reviewed ML aesthetic palette model from 2020–2026 with published accuracy and open weights. I could not verify the "A Study on Color Theme Generation Using CNNs" (ACM 2024) details.

---

## 3. Lightness contrast, chroma restraint, hue similarity, and "natural" hue–lightness orderings

### Takeaway
The evidence is consistent on four points. Hue similarity raises harmony. Lightness contrast raises *preference*, even if not "harmony". Overall lightness raises harmony. Similar chroma helps. Hue–lightness interactions are real: dark yellow (olive) is disliked across several cultures, and the preferred figure–ground arrangement is a lighter, yellower figure on a darker, bluer ground. Both point to a "natural order" (light yellows, dark blues). No study I found directly tests natural vs. reversed orderings across a whole palette.

### Cited Findings
- **Best-supported pattern.** People prefer "different shades of the same basic color (e.g., vivid blue on light blue) rather than different colors of similar shades (e.g., vivid blue on vivid red)" — [Schloss & Palmer 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3037488/); [Palmer Lab](https://palmerlab.berkeley.edu/pub.html)
- **Figure–ground orientation.** In a sensitive forced-choice task, people strongly prefer pairs with **yellower, lighter figures on bluer, darker grounds** (Schloss & Palmer 2011, *Perception*). The preference held at figure areas of 40%, 50% and 60% — [Schloss & Palmer, Perception 2011](https://doi.org/10.1068/p6992); [Palmer Lab color triplets](https://palmerlab.berkeley.edu/color1.html)
- **Single-color hue × lightness interactions.** Yellow peaks in preference at high lightness, red/green at medium, blue/purple at low lightness (Guilford & Smith). Dark orange (brown) and dark yellow (olive) are strongly disliked — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- **Dark yellow (olive) dislike** is reported for Chinese, British (Ou et al. 2004), Japanese (Yokosawa et al. 2012) and American observers. Proposed reason: ecological associations with rot and waste — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- **Ou & Luo 2006 summary.** Harmonious pairs are similar in hue, differ in lightness, have high summed lightness, and include light yellow — [Schloss & Palmer 2011 citing Ou & Luo](https://pmc.ncbi.nlm.nih.gov/articles/PMC3037488/)
- **Single-color preference.** Western average preference peaks at saturated blue and is lowest around dark yellow/yellow-green. Ecological valence theory: WAVE (weighted affective valence of objects of that color) explained ~80% of variance in the 32-chromatic-color data. Cone-contrast models explained 37%, and an NCS-like appearance model 60% — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf). The ~80% figure is the widely reported PNAS 2010 result; the review text lines for that exact number weren't extracted, so verify in [Palmer & Schloss PNAS 2010](https://www.pnas.org/doi/10.1073/pnas.0906172107)
- **Data-driven lightness.** A lightness spread with a gradient-like (low standard deviation) arrangement scores best. Mean or max lightness is a top predictor. A large CIELAB b* range is penalized, which works as a saturation limit — [O'Donovan et al. 2011](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- **Chroma.** Equal or similar chroma favors harmony (Ou & Luo; Szabó; Schloss & Palmer). Wei et al. found chroma effects weak in packaging: "small chroma difference or large chroma sum" correlations ranged from −0.28 to 0.32 — [Wei et al.](http://www.ijdesign.org/index.php/ijdesign/article/view/1130/612)
- **Context can null lightness effects.** In packaging, lightness attributes correlated only −0.14 to 0.08 with harmony, liking and quality. Chromatic difference ΔC correlated negatively with harmony (R ≤ −0.43), matching Ou & Luo — [Wei et al.](http://www.ijdesign.org/index.php/ijdesign/article/view/1130/612)
- **Architecture/façades (2026).** The most harmonious, preferred and liked arrangements were based on *value (lightness) contrast*. The emphasized element should occupy a small share of area, 0.2–0.4 — [Buildings 2026, "Evaluation of Color Contrast Arrangements"](https://www.mdpi.com/2075-5309/16/14/2906)

### Inferences
- A numerical recipe consistent with all of the above:
  1. Choose 1–2 hue families, or 2–3 at most for designer-type taste.
  2. Assign lightness so yellows/oranges sit high and blues/violets sit low. Never put a yellow hue (OKLCH h≈90–110°, CIELAB hab≈80–100°) at low L. That is the olive trap.
  3. Make surfaces a monotonic light→dark ramp.
  4. Keep chroma similar within a role tier.
  5. Treat accent color as the figure: it may contrast in hue with its ground. Figural preference rewards hue contrast even though pair "harmony" does not.
- The natural order matches the physical gamut. In sRGB/P3, max-chroma yellows only exist at high L and max-chroma blues at low L, so following the natural order also maximizes available chroma.

### Gaps
- I found no controlled study of whole-palette "natural vs. reversed hue–lightness order" ratings. The evidence is indirect: pair figure–ground studies, olive dislike, and the Ou EY term.

---

## 4. Individual differences, culture, context (product vs. art), and number of colors

### Takeaway
Group averages are reliable but individuals vary widely. Users on Kuler barely agree pairwise (52%), but they cluster into about 10 taste groups (81% agreement within a group). Training in art lowers preference for harmony. Harmony is less culture-independent than color emotion. Object context changes which lightness is preferred more than which hue. Designers prefer 2–3 hue families. Lay raters accept monochromatic palettes and penalize many hues.

### Cited Findings
- **Agreement among users.** Pairwise user agreement on Kuler (597 users with ≥50 ratings) was only 52%, barely above chance. With 10 clusters, within-cluster agreement was 81%. A mixture-of-experts model cut MAE ~30% given a few user ratings — [O'Donovan et al. 2011](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- **Demographics (MTurk).** Raters were 504 Indian, 351 American, 146 other; 593 female, 410 male. Indians rated more consistently (MAE 0.54 vs 0.58), and error fell with age. Models trained on separate demographic groups gave little improvement: "personal preferences outweigh demographic preferences" — [O'Donovan et al. 2011](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- **Preference for harmony as a trait.** Palmer & Griscom found individual correlations between preference and harmony ranging from −0.73 to +0.97 for music. The trait is consistent across domains (color pairs vs. music r=+0.60), and art or music training lowers preference for harmony in that domain — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- **Cultures differ.**
  - Japanese WAVEs predicted Japanese preference r=0.66 vs American r=0.55. American WAVEs predicted American preference r=0.89 vs Japanese r=0.74.
  - The Himba (rural Namibia) strongly preferred saturated colors regardless of hue.
  - Preference for whitish colors is stronger in Japan, Korea and Taiwan.
  - Blue was ranked among the least preferred in Kuwait (1968).
  - Source: [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- **Harmony is more culture-dependent than color emotion** (12-region data) — [Ou et al. 2018](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.22243)
- **Object context.** Hue preferences for walls, couches, shirts and so on were broadly similar to context-free patches. Preferred lightness varied widely by object for practical reasons, e.g. lighter walls make rooms look bigger — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf)
- **Semantic context.** Fruit–hue match drove packaging harmony — [Wei et al.](http://www.ijdesign.org/index.php/ijdesign/article/view/1130/612). Theme names changed MTurk ratings significantly for only 10 of 216 themes (mean absolute shift 0.20 on a 1–5 scale) — [O'Donovan et al. 2011](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- **Purpose of the rating.** Designers rate "usefulness". Kuler and COLOURlovers penalize monochromatic themes, and their optimal hue entropy corresponds to ~2–3 hues. MTurk lay raters judge pure visual appeal, don't penalize monochrome, and rate lower as hue count rises — [O'Donovan et al. 2011](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- **Number of colors.** Ou 2011 pair-averaging works for 3-color sets and interiors (r up to 0.93). O'Donovan's 5-color themes are the main evidence for ≥5 colors — [Ou 2011](https://onlinelibrary.wiley.com/doi/10.1002/col.20624)

### Inferences
- Taste varies a lot between people. ChromaConscious should therefore expose a small number of taste clusters or a single "harmony ↔ contrast/excitement" control rather than claim one optimum. That control maps onto Palmer & Griscom's preference-for-harmony trait.
- UI themes are "product" context. That points to designer-style norms (a few hue families, useful contrast) more than lay visual appeal.

### Gaps
- Most harmony data is from UK, US, Chinese/Taiwanese or Indian online samples. I found no harmony studies from sub-Saharan Africa (apart from Himba single-color preference), Latin America or the Middle East.
- No study found compares harmony judgments for UI themes against art or interiors directly.

---

## 5. Perceptual color spaces (OKLCH, CAM16/HCT) for ramps; tinted neutrals; accent proportions (60-30-10)

### Takeaway
The harmony models are fitted in CIELAB (Ou, O'Donovan, Colorgorical) or CIECAM02 (Szabó). Oklab/OKLCH fixes CIELAB's worst flaw, blue hue non-linearity, which makes it better for generating constant-hue ramps. HCT uses CAM16 hue/chroma with CIELAB L* as "tone", so a tone difference maps directly to WCAG contrast. Tinted neutrals: I found no direct harmony evidence, though the Ou model's chroma gate suggests very-low-chroma grays are hue-neutral. 60-30-10 is folk wisdom with no traceable origin or direct test.

### Cited Findings
- **Oklab's purpose.** It was designed so that L, C and h are perceived as orthogonal and hue is predicted well. CIELAB predicts blue hues poorly: a blue→white gradient in CIELAB turns purple. Oklab combines an IPT-like structure with CIECAM16 lightness and saturation estimates. Ottosson's view is that CAM16-UCS is uniform but numerically poorly behaved and blends badly — [Ottosson, "A perceptual color space for image processing"](https://bottosson.github.io/posts/oklab/); [Smashing interview 2024](https://www.smashingmagazine.com/2024/10/interview-bjorn-ottosson-creator-oklab-color-space/)
- **Independent review.** Raph Levien: IPT, ICtCp and Oklab are "quite good, and a huge improvement over CIELAB" for hue linearity (fit to Ebner–Fairchild data). CIELAB's linear segment near black helps ramp uniformity under veiling glare — [Levien, Oklab critique](https://raphlinus.github.io/color/2021/01/18/oklab-critique.html)
- **CSS.** CSS Color 4 adopts OKLCH and recommends it for gradient and color-mix interpolation — [Oklab, Wikipedia](https://en.wikipedia.org/wiki/Oklab_color_space)
- **HCT (Material 3).** Hue and chroma come from CAM16; tone is CIELAB L*. Material's glossary: a tone difference of 40 guarantees WCAG contrast ≥3.0, and 50 guarantees ≥4.5. CAM16 still has some purple shift in blues, and Google's implementation is limited to sRGB/8-bit — [Material 3 glossary](https://m3.material.io/foundations/glossary); [ColorAide HCT](https://facelessuser.github.io/coloraide/colors/hct/); [material-color-utilities](https://github.com/material-foundation/material-color-utilities/)
- **60-30-10.** No documented origin and no direct test. Practitioners call it a starting point, and one called it an "old wives' tale". A 2025 VR interior study (n=63) found area proportion was the dominant driver of dominance and arousal, while color drove hedonic valence. It does not validate 60/30/10 specifically — [Apartment Therapy](https://www.apartmenttherapy.com/interior-design-rule-60-30-10-explained-37504313); [Gulf News](https://gulfnews.com/amp/friday/home/60-30-10-the-one-simple-rule-for-your-perfect-home-colour-palette-1.1646387851196); [Buildings 2025 VR study](https://doi.org/10.3390/buildings15244525)
- **Accent area.** The façade study recommends the emphasized element at 20–40% of area — [Buildings 2026](https://www.mdpi.com/2075-5309/16/14/2906). The yellow-figure-on-blue-ground preference was stable across 40–60% figure areas — [Palmer Lab](https://palmerlab.berkeley.edu/color1.html)

### Inferences
- Generate ramps in OKLCH (or HCT) so hue stays constant and blues don't drift purple. Convert to CIELAB to score with Ou/O'Donovan-style terms, and to sRGB luminance to check WCAG/APCA. Do not apply Ou coefficients directly to Oklab L/C; the scales differ (Oklab L is 0–1, and chroma ≈0–0.37 in sRGB).
- Tinted neutrals: by the Ou EC gate, a gray at C*≲4 contributes almost no hue effect. Tinting toward the brand hue at very low chroma should cost nothing and may slightly reduce ΔH vs. accents, through hue similarity. This is an inference; no direct study found.
- Treat "one dominant, one supporting, a small accent" as a reasonable prior with no exact ratio. The figural-preference finding supports small, hue-contrasting accents on a large harmonious ground.

### Gaps
- I found no empirical study of tinted vs. pure-gray neutrals in UI aesthetics.
- I found no harmony model refitted in Oklab or CAM16-UCS.

---

## 6. Where pleasing palettes conflict or align with WCAG/APCA contrast and colorblind safety

### Takeaway
Mostly they align. The strongest preference drivers are hue similarity plus lightness contrast, a lighter palette overall, and a lightness gradient. These are exactly the properties that survive CVD and satisfy luminance-contrast rules. The conflict is in *categorical* colors (charts, status). These need hue separation, which harmony penalizes, and red/green hue separation is lost for deutans. Colorgorical shows that discriminability and preference can be traded off without loss vs. designer palettes.

### Cited Findings
- **Lightness contrast and preference.** Pair preference rises with lightness contrast, and figural preference rises with lightness contrast and hue contrast — [Palmer et al. 2013](https://palmerlab.berkeley.edu/pdf/PalmerSchlossSammartino(2013)AR.pdf). The Ou HΔL term rewards lightness difference up to ~ΔL*20 and never penalizes more — [Ou & Luo 2006 via patent](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9134179)
- **Lightness spread.** Top-rated themes have a wide lightness range with gradient structure — [O'Donovan et al. 2011](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- **Tone and contrast.** Tone (L*) difference maps onto WCAG contrast: ΔT 40 → ≥3:1, ΔT 50 → ≥4.5:1 — [Material glossary](https://m3.material.io/foundations/glossary)
- **Categorical palettes.** Colorgorical palettes balancing CIEDE2000 distance, name difference and pair preference were as discriminable as designer benchmarks and at least as preferred — [Gramazio et al. 2017](https://dl.acm.org/doi/10.1109/TVCG.2016.2598918)
- **CVD observers' harmony judgments.** Norway and Taiwan samples rated food-color pairs. CVD observers rated harmony slightly lower, but food type and nationality mattered more. Lundekvam & Green: harmony judgments "were not significantly different" between groups — [IS&T Electronic Imaging](https://library.imaging.org/ei/articles/31/14/art00014); [Eschbach 2021 review](https://onlinelibrary.wiley.com/doi/full/10.1111/cote.12494)
- **CVD single-color preference.** Red–green dichromats prefer yellow most, rather than least, and blue much less than trichromats do. Protanopes are more affected than deuteranopes — [Álvaro et al., PNAS 2015](https://www.pnas.org/doi/full/10.1073/pnas.1502104112)
- **Harmony models exclude CVD.** Ou & Luo and Palmer's group screened out CVD observers, so existing harmony models reflect trichromat judgments only — [Ou & Luo 2006 PDF](https://www.researchgate.net/profile/Ming-Luo-13/publication/229906278_A_color_harmony_model_for_two-color_combinations/links/5c0c957192851c39ebde1ea2/A-color-harmony-model-for-two-color-combinations.pdf); [Schloss & Palmer 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3037488/)

### Inferences
- **Aligned.** A theme built as "1–2 hue families with a wide L* ramp, surfaces light→dark, natural hue order" is pleasing by the evidence, passes contrast by construction (choose ΔL*/ΔT ≥ 50 for body text), and is deutan-safe because the information is in lightness.
- **Conflict 1: harmony vs. categorical discrimination.** Harmony (Ou HC, Schloss hue similarity) penalizes hue spread, but charts and status colors need it. Resolution: separate categorical colors mainly by lightness and blue–yellow (b*) differences, which deutans keep. Hold hue spread to the minimum that clears a CVD-simulated ΔE threshold. The Kuler finding that b* standard deviation (blue/yellow bimodality) is the most positive feature is helpful here: blue–yellow contrast is both liked and deutan-robust.
- **Conflict 2: dark themes.** Harmony models reward high summed lightness, and dark themes are rated lower (O'Donovan, HLsum). Mitigation: include at least one high-L* element (Kuler max-lightness feature), keep the yellow/light accents light, and avoid dark yellows and browns as surfaces.
- **Conflict 3: complementary accents.** Classic complementary schemes are rated disharmonious as *pairs*, but a hue-contrasting *figure* (e.g. a CTA button) is preferred on its ground. Use hue contrast only for small figural elements, never for large adjacent areas.
- **Scoring under deutan simulation.** Computing Ou CH on deutan-simulated colors (e.g. Machado/Viénot) would estimate harmony "as Drew sees it". The evidence suggests CVD harmony judgments are close to trichromat ones, so the trichromat score is a reasonable default. This is unvalidated.

### Gaps
- I found no study of how WCAG 2 or APCA thresholds interact with rated palette harmony in real UIs.
- I found no harmony model fitted on CVD observers. The CVD harmony evidence is small (two lab studies, food contexts).
- APCA-specific evidence relating Lc values to aesthetic ratings was not found.
