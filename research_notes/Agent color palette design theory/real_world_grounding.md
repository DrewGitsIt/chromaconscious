# Grounding agent color palettes in real-world sources (nature, materials, art, film, interiors) — datasets, methods, licensing

Scope note: researched 2026-10-06. About 30 searches and fetches. Where a source is a secondary or marketing page, it is flagged. Licensing is reported as found; "not verified" means I did not see the LICENSE file myself.

## 1. Natural light and scenes: physics, coherence, and evidence that nature-derived palettes are preferred

### Takeaway
The light physics is well documented. Rayleigh scattering makes daytime and distant things blue. Ozone (Chappuis) absorption makes blue hour blue. Fall color comes from three pigment families. Aerial perspective lowers contrast and chroma and pulls distant colors toward the air's color. The best evidence that nature makes palettes pleasing is a 2025/26 iScience study: the hue pairs people prefer match the hue pairs that occur often in natural landscapes. I found no study showing that palettes extracted from nature photos are rated more harmonious than other palettes.

### Cited Findings
- **Blue hour.** The blue of the blue hour comes mainly from Chappuis absorption by ozone, which removes yellow, orange and red light along the long twilight path. It does not come from Rayleigh scattering alone, and the scattering-only explanation is called a common misconception. Blue hour usually falls around nautical twilight. — [Wikipedia: Blue hour](https://en.wikipedia.org/wiki/Blue_hour); [Wikipedia: Chappuis absorption](https://en.wikipedia.org/wiki/Chappuis_absorption)
- Hulburt (1953) showed that blue-hour color is largely caused by Chappuis absorption, unlike daytime blue, which comes from Rayleigh scattering. — [Wikipedia: Chappuis absorption](https://en.wikipedia.org/wiki/Chappuis_absorption)
- Lee Jr. et al. (Applied Optics, 2011): zenith skylight is often distinctly blue in clear civil twilight, largely because of ozone's Chappuis bands. Ozone depletion over Antarctica could make twilight there less blue. — [PubMed 22016241](https://pubmed.ncbi.nlm.nih.gov/22016241/)
- Fosbury et al. (ESO Messenger 143, 2011): the after-sunset sky is "far bluer than can ever be achieved by Rayleigh scattering alone." — [ESO Messenger](https://www.eso.org/sci/publications/messenger/archive/no.143-mar11/messenger-no143-27-31.pdf)
- An amateur spectroscopy run from 1 hour before sunset to 15 minutes after measured the western sky's CCT rising from about 6,000 K to 14,000 K, with Chappuis absorption centred near 600 nm. Treat this as a single amateur observation. — [Spectropol](https://spectropol.pl/the-visible-signature-of-ozone-at-twilight/)
- **Aerial (atmospheric) perspective.** With distance, contrast falls, colors desaturate and shift toward the background color. That color is usually bluish, but can be reddish near sunrise or sunset. Scattered air light lifts shadows and darkens highlights toward the air color. Leonardo named the effect, and it appears in Pompeian frescoes from about 30 BCE. — [Wikipedia: Aerial perspective](https://en.wikipedia.org/wiki/Aerial_perspective)
- **Autumn foliage.** Three pigment families drive it:
  - Chlorophyll breaks down into colorless catabolites.
  - Carotenoids (yellow xanthophylls, orange beta-carotene) are present all summer and are revealed when the green goes.
  - Anthocyanins (red to purple) are made fresh in autumn from trapped sugars. They need sun, so grey autumns are duller. Their hue depends on pH: more acidic tissue is redder, less acidic is more purple.
  - Browns come from pigment mixing or from quinones as cells die.
  — [Wikipedia: Autumn leaf color](https://en.wikipedia.org/wiki/Autumn_leaf_color); [USDA Forest Service](https://www.fs.usda.gov/visit/fall-colors/science-of-fall-colors)
- **Natural hue statistics and preference.** "Harmonious color pairings: Insights from human preference and natural hue statistics" (iScience 2026; arXiv 2508.15777):
  - Participants rated pairs among 13 hues (HSL). The authors built a preference matrix and a "combinability index" per hue.
  - Preferences were strongly hue-dependent, which challenges classical harmony templates.
  - Averaged over hues, near-opposite pairs were preferred.
  - The most liked pairs coincide with the pairs that occur most often in natural landscapes. In those landscapes, widely separated dominant hues are most often about 180° apart.
  — [arXiv 2508.15777](https://arxiv.org/html/2508.15777); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13264017/)
- Partial conflict: Tan et al. found monochromatic and "square" harmonic templates were rated more harmonious than random palettes, but complementary and triad palettes were not. — [arXiv 1804.01225](https://arxiv.org/pdf/1804.01225)
- **Ecological Valence Theory** (Palmer & Schloss, PNAS 2010): color preference equals the average liking of the objects associated with the color. Their WAVE model explained 80% of the variance in color preference. Blues link to sky and clean water; browns to feces and rot. — [Wichita State summary](https://psy311.wichita.edu/unit-06/palmer-schloss-2010/); [eScholarship PDF](https://escholarship.org/content/qt9fr2s1z1/qt9fr2s1z1_noSplash_852a660b6f43f17c2f472fba69568a3c.pdf)
- Color preferences shift with season as seasonal objects become more or less active in the observer's mind (Schloss & Palmer 2017). — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0042698917300627)

### Inferences
- Several mechanisms push a nature-derived palette toward coherence:
  - **Shared illuminant.** Every surface in one scene is lit by the same spectrum (warm low sun, cool skylight, or blue-hour ozone light). This gives every swatch a common hue bias, the "tint" a designer would add to neutrals.
  - **Aerial perspective.** Background or far layers get lower chroma, a lightness pulled toward the sky, and a hue pulled toward the air color. This maps directly onto UI layering: page backgrounds sit low-chroma and air-tinted, foreground accents sit at full chroma.
  - **Natural complementarity.** Sky or water blue against sun-lit warm surfaces gives near-180° pairs, which the iScience data says people prefer.
- EVT suggests that naming the source objects ("clear sky", "moss", "wet slate") primes positive valence. An agent may produce more likeable palettes by choosing positively valenced referents and avoiding referents like "mud" or "bile", even at similar hues.
- These scene facts can be encoded as parametric rules rather than fixed hex values. Examples: "golden hour: hue bias toward ~60–80° (OKLCH), raised chroma in warm highlights, cool-shifted shadows" or "blue hour: CCT very high, dominant hue blue, low lightness." This is my synthesis; the angles are illustrative, not measured.

### Gaps
- I found no peer-reviewed study comparing ratings of nature-photo-extracted palettes against designer-made or random palettes. The common "nature palettes are proven harmonious" claim on design sites is marketing ([example](https://www.higocreative.com/blog/nature-color-palettes)).
- I found no open, licensed dataset of measured spectra or colorimetry for sky, ocean, desert or foliage packaged for palette use. Hyperspectral natural-scene databases exist (e.g., Foster/Nascimento) but were not checked in this pass.
- I found no sourced CCT values for golden hour or overcast skies. Standard references are D65 = 6504 K and D50 for print, but I did not fetch a primary source for daylight-phase CCT ranges.

## 2. Materials and texture: how materials become color, and how UI carries "texture"

### Takeaway
Perception research says material appearance (gloss, translucency) comes from image cues: highlight size, contrast and sharpness, plus saturation and background distortion. It is not read from color alone. Design systems carry "material" into flat UI mostly through tinted neutrals (low-chroma greys that share the brand or seed hue) and lightness-stepped elevation. Material Design 3 and Linear both document this concretely.

### Cited Findings
- **Gloss.** Fleming (Vision Research 2014): glossier surfaces show more salient specular highlights, and the visual system relies on the size, contrast and distinctness of highlights to judge gloss. The paper also proposes that vision learns a generative model of appearance across natural illumination. — [ResearchGate: Visual perception of materials and their properties](https://www.researchgate.net/publication/259109278_Visual_perception_of_materials_and_their_properties)
- Fleming (Current Biology 2012): the brain uses image "invariants" or heuristics rather than estimating physical reflectance, so it sometimes gets the answer wrong. Fleming (Annual Review of Vision Science 2017) is a broader review. Schmidt, Hebart, Schmid & Fleming (PNAS 2025) is titled "Core dimensions of human material perception." — [ResearchGate: Perception of material properties](https://www.researchgate.net/publication/281342534_Perception_of_material_properties)
- **Translucency.** Gigilashvili et al., "Translucency perception: A review" (J. Vision 2021):
  - Translucency is among the most essential appearance attributes, with color, gloss and texture, and is the least studied.
  - Fleming & Bülthoff (2005) showed that low-level cues (object scale, color saturation, specular highlights) drive perceived translucency.
  - Gloss is not essential: without it, objects still look translucent but read like smoke or sponge.
  — [PMC8340651](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8340651/)
- A gloss review aimed at industry covers the gloss of dielectric materials. — [PMC10817271](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10817271/)
- **Material Design 3 (HCT).** One seed color yields five key colors: primary, secondary, tertiary, neutral and neutral-variant. Each becomes a 13-step tonal palette (tones 0–100).
  - In the classic tonal-spot scheme, neutral has chroma ~4 and neutral-variant ~8. These tinted greys are used for surfaces, body text, outlines and dividers.
  - `surfaceTint` (usually primary) expresses elevation.
  - Example role mapping: surface = neutral tone 99 (light) / 10 (dark).
  — [Generating M3 Dynamic Color Scheme (dt.in.th)](https://dt.in.th/M3DynamicColorJS); [Medium: M3 colorScheme explained](https://medium.com/softaai-blogs/material-3-colorscheme-explained-how-dynamic-color-really-works-b73a24d73955) (secondary sources; exact constants live in google/material-color-utilities)
- **Linear.** Linear generates themes from three inputs: base color, accent color and contrast. It derives more than 100 variables in LCH (CIE LCH, not OKLCH) instead of hand-defining 98 per theme. Contrast is a single knob that also produces high-contrast accessibility themes. LCH was chosen partly to handle surface elevations (background, panels, dialogs, modals).
  - A later refresh moved defaults from a cool blue-ish grey to "a warmer gray that still feels crisp, but less saturated."
  — [Linear: How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui); [Linear: A calmer interface](https://linear.app/now/behind-the-latest-design-refresh); [Linear: StyleX post](https://linear.app/now/styling-linear-for-the-future-stylex)
- **Paint industry as a material/interior proxy.** Sherwin-Williams' 2026 Color of the Year, Universal Khaki SW 6150, is described as an earthy neutral between beige and taupe with a subtle green undertone. Benjamin Moore's Silhouette AF-655 is espresso/burnt umber with charcoal notes. Pantone's 2026 pick is Cloud Dancer 11-4201, a soft white and the first white ever chosen. — [Business Wire (Benjamin Moore)](https://www.businesswire.com/news/home/20251016154282/en/Benjamin-Moore-Names-Silhouette-AF-655-as-its-Color-of-the-Year-2026); [Pantone 2026](https://www.pantone.com/color-of-the-year/2026); [TIME](https://time.com/7338176/pantone-color-of-the-year-2026/); [Young House Love](https://www.younghouselove.com/2026-color-of-the-year/)

### Inferences
- In palette terms, a material is roughly four things:
  1. A narrow lightness band.
  2. Low chroma (typically below what UI accents use).
  3. A characteristic undertone hue, the "warm/cool/green undertone" language paint companies use.
  4. A within-material variation range (grain, veining).
- Gloss and translucency are not color properties. In flat UI they are carried by highlight and shadow treatment (elevation shadows, specular-like borders, blur/saturation for "glass").
- An agent-facing material entry could therefore encode: a base OKLCH anchor, an undertone hue, a chroma ceiling, a lightness variation range (texture amplitude) and an "appearance hints" field (matte/satin/gloss; translucent yes/no) that maps to elevation and shadow tokens rather than colors. This fits ChromaConscious's existing separation/elevation work.
- The 2026 color-of-the-year picks are all low-chroma neutrals. This supports a "tinted neutral" grounding layer as the most reusable material-derived data for UI.

### Gaps
- I found no peer-reviewed measurement dataset of CIELAB values for materials (wood species, stones, linen, clay) under a free license. Material appearance databases (e.g., MERL BRDF) exist but were not checked for license here.
- I found no credible studio writing that quantifies grain/noise overlays or subtle gradients in UI (amplitude, opacity). This needs a separate search.
- Paint LRV (light reflectance value) data is published per brand. Aggregator sites list LRV, but none showed an open license (see §4).

## 3. Art, film, and interiors as palette sources

### Takeaway
Freely licensed, structured art and film palette datasets exist:
- Sanzo Wada's *Dictionary of Color Combinations*: MIT JSON with Lab values, plus a CC BY 4.0 extended set.
- MetBrewer (Met Museum artworks): CC0.
- wesanderson: MIT.

Film grading conventions such as teal-orange are documented only in practitioner writing, not datasets. Commercial paint and Pantone data is proprietary or unclear in license.

### Cited Findings
- **Sanzo Wada.** mattdesl/dictionary-of-colour-combinations is a JSON dataset of 348 combinations (2–4 colors) over 159 colors from Wada's book (Seigensha). Each color has a name, the combinations it belongs to, CMYK and its swatch chapter. The data was originally compiled by Dain Blodorn Kim. License: MIT. — [GitHub mattdesl](https://github.com/mattdesl/dictionary-of-colour-combinations)
- One write-up says the dataset carries hex/RGB/CMYK/L\*a\*b\*. It also claims Wada's works entered the Japanese public domain in 2017. That is a blog claim, not a legal opinion. — [Labrodev Substack](https://labrodev.substack.com/p/sanzo-wadas-colors-in-your-code-how)
- colorcombinations.org offers 378 palettes, 210 colors and 69 collections as CSV and a JSON API under CC BY 4.0. 348 of the palettes derive from the MIT mattdesl set. — [colorcombinations.org/data](https://colorcombinations.org/data/)
- **MetBrewer** (Blake R. Mills): R palettes inspired by works at the Metropolitan Museum of Art. License: CC0. — [GitHub BlakeRMills/MetBrewer](https://github.com/BlakeRMills/MetBrewer); [CRAN](https://cran.r-project.org/package=MetBrewer)
- **wesanderson** (Karthik Ram et al.): palettes from Wes Anderson films. License: MIT. — [CRAN wesanderson](https://cran.r-project.org/package=wesanderson)
- **Teal-orange grading.** Shadows and midtones are pushed teal, highlights orange. Skin across ethnicities falls in the orange-amber range on a vectorscope, so a teal surround maximizes figure–ground separation. The look became dominant in early-2000s blockbusters. Sources call it overused and warn of oversaturated skin. — [Pixflow](https://pixflow.net/blog/teal-and-orange-color-grading/); [Beverly Boy](https://beverlyboy.com/filmmaking/what-is-teal-orange-look/); [ColorArchive guide](https://colorarchive.org/guides/film-cinematography-color-guide/) (all practitioner or secondary sources)
- ColorArchive's rationale: shadows go teal because outdoor shadows are lit by blue skylight, and skin is warm. It calls the look "a readability technique … increasingly considered visually exhausted." — [ColorArchive](https://colorarchive.org/guides/film-cinematography-color-guide/)
- **Paint-brand data.** Sherwin-Williams publishes an official PDF/Excel color list with number, name, RGB and hex (e.g., SW0014 Sheraton Sage, hex 8F8666). — [Sherwin-Williams PDF](https://images.sherwin-williams.com/content_images/sw-pdf-sherwin-williams-colorc.pdf)
  - jpederson/colornerd packages 29,875 swatches from Behr, Benjamin Moore, Sherwin-Williams, RAL, PPG and others as JSON/CSV. Its license was not verified, and names remain "property of their respective owners." — [GitHub colornerd](https://github.com/jpederson/colornerd)
  - A NamedColors.jl contributor flagged that the copyright on the SW list needs checking. — [NamedColors.jl issue #9](https://github.com/JuliaGraphics/NamedColors.jl/issues/9)
- **Pantone.** The Color of the Year comes with trademark licensing tie-ins (Motorola, Post-it, Play-Doh). — [Washington Post](https://www.washingtonpost.com/home/2025/12/04/pantone-color-of-the-year-2026/)

### Inferences
- Film palettes are best encoded as grading rules (shadow hue, highlight hue, skin-protection band) rather than fixed swatches. A rule can be applied to any base palette. For accessibility, teal-orange pairs differ mainly along the blue–yellow axis, which deutans and protans retain. This makes the pattern relatively colorblind-robust, but it should be checked with the project's CVD simulation.
- Wada's set is the strongest FOSS "curated harmony" corpus: human-composed, historical, small, and MIT/CC BY. It suits few-shot examples for an agent, with provenance ("Wada #212, 1933").
- Treat paint and Pantone names as trademarks. Ship OKLCH anchors described in generic words ("warm greige, green undertone") with a "similar to SW 6150" note only if legal review allows. Do not redistribute brand lists.

### Gaps
- I found no structured, licensed dataset of art-movement palettes (Bauhaus, Impressionism, Ukiyo-e) beyond MetBrewer's artwork-specific palettes. A museum open-access image set (e.g., Met CC0 images, Rijksmuseum) plus extraction would be the route, but it was not checked.
- I found no academic dataset of film-frame palettes with a clear license. Fan sites and "movies in color" style accounts exist, but their licensing is unclear and they were not checked.
- Farrow & Ball and Benjamin Moore data licensing were not found. Assume proprietary.

## 4. Datasets mapping words, concepts and images to color, with licenses

### Takeaway
A FOSS-usable core exists:
- xkcd survey: CC0.
- Heer & Stone / C3: BSD-3.
- meodai/color-names: MIT, about 32k names.
- ColorBrewer: Apache-2.0.
- Crameri: MIT for current versions.
- MetBrewer: CC0. wesanderson: MIT. Wada: MIT.
- Schloss lab gpt-cca code: MIT.

Concept-association data from Schloss's other repos often has no license file, which means all rights reserved by default. COLOURlovers is CC BY-NC-SA 3.0 (non-commercial, copyleft) and so problematic. Commercial generators (Huemint, Khroma, Colormind, Adobe Color, Coolors) publish no reusable datasets.

### Cited Findings
| Resource | What it is | License | Source |
|---|---|---|---|
| xkcd color survey `rgb.txt` | 949 most common RGB color names from ~222k participants (some counts say 954) | CC0 1.0 for the data (comics are CC BY-NC 2.5) | [CTAN xkcdcolors](https://ctan.org/tex-archive/macros/latex/contrib/xkcdcolors); [Haskell diagrams-contrib](https://diagrams.github.io/haddock/diagrams-contrib/Diagrams-Color-XKCD.html) |
| Heer & Stone (CHI 2012) / StanfordHCI c3 | Probabilistic color-naming model from the xkcd data. Name↔color mapping, "saliency" (how reliably a color is named), name distance. JS client plus JSON model | BSD-3-Clause, per mpetroff/accessible-color-cycles, which redistributes `c3_data.json` (c3's LICENSE not read directly) | [GitHub c3](https://github.com/StanfordHCI/c3); [Stanford color names](http://vis.stanford.edu/color-names/); [mpetroff](https://github.com/mpetroff/accessible-color-cycles) |
| meodai/color-names | ~31,918 curated color names; npm `color-name-list`; companion MIT name API; brand names and slurs excluded | MIT | [GitHub](https://github.com/meodai/color-names); [LICENSE](https://github.com/meodai/color-names/blob/main/LICENSE) |
| Lindner, Li, Bonnier & Süsstrunk, "Large-Scale Multi-Lingual Color Thesaurus" (CIC 2012) | >9,000 color names in 10 languages, located in CIELAB from Google Image Search statistics; browsable at colorthesaurus.com | Paper open access on EPFL Infoscience; **data license not found** | [IS&T library](https://library.imaging.org/cic/articles/20/1/art00006); [EPFL Infoscience](https://infoscience.epfl.ch/record/181682) |
| Lindner & Süsstrunk, "What is the color of chocolate?" (CGIV 2012); "Automatic color palette creation from words" (2013) | Color values for semantic expressions ("Ferrari red") from image search | Not found | [ResearchGate](https://www.researchgate.net/publication/263610354_What_is_the_Color_of_Chocolate_-_Extracting_Color_Values_of_Semantic_Expressions) |
| Havasi, Speer & Holmgren, "Automated Color Selection Using Semantic Knowledge" (AAAI Fall Symp. 2010) | ConceptNet-based word→color associations, interpolated for unseen words, validated against xkcd | Paper only; ConceptNet is a separate resource | [dblp](https://dblp.org/pid/05/6168.html); [Setlur & Stone 2016](https://infovis.fh-potsdam.de/readings/Setlur2016.pdf) |
| Lin, Fortuna, Kulkarni, Stone & Heer, "Semantically-Resonant Colors" (EuroVis 2013) | Image-search color histograms (5×5×5 bins, black/white backgrounds removed) → value-color affinity → optimal palette assignment. Semantically resonant colors sped up chart reading | Paper | [UW IDL](https://idl.uw.edu/papers/semantically-resonant-colors); [PDF](https://idl.cs.washington.edu/files/2013-SemanticColor-EuroVis.pdf) |
| Setlur & Stone (TVCG 2016) | n-gram linguistic approach to term→basic-color association | Paper | [PDF](https://infovis.fh-potsdam.de/readings/Setlur2016.pdf) |
| Schloss lab (UW–Madison) | Color-concept associations on the UW-58/UW-71 color sets; Rathore et al. 2020 image-statistics estimation; semantic discriminability; PNAS 2026 "Color–concept associations reveal a new conceptual space" | **gpt-cca: MIT.** semantic_spaces_public, ColorConceptAssociations, semantic-discriminability: **no license seen** (default all rights reserved; contact lab). The Schoenlein & Schloss 2022 article is CC BY-NC-ND 4.0 (paper only) | [GitHub SchlossVRL](https://github.com/SchlossVRL?language=jupyter+notebook); [semantic-discriminability](https://github.com/SchlossVRL/semantic-discriminability); [PNAS](https://www.pnas.org/doi/abs/10.1073/pnas.2526862123?af=R); [Rathore et al.](https://arxiv.org/pdf/1908.00220) |
| Mukherjee et al., "LLMs estimate fine-grained human color–concept associations" (Cognitive Science 2026; arXiv 2406.17781) | GPT-4 ratings over UW-71 correlate with human ratings, comparable to image-based state of the art; accuracy tracks how *specific* a concept's color distribution is | Code MIT (gpt-cca); arXiv source CC BY 4.0 | [arXiv](https://arxiv.org/abs/2406.17781); [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/cogs.70219) |
| Jahanian et al., "Colors—Messengers of Concepts" (ACM TOCHI 2017) | LDA-dual color-word topics from 2,654 magazine covers (71 titles, 12 genres); crowd-validated; palette recommendation prototypes | Paper; data license not found | [arXiv 1505.06532](https://arxiv.org/pdf/1505.06532); [ACM](https://dl.acm.org/doi/abs/10.1145/3009924) |
| O'Donovan, Agarwala & Hertzmann, "Color Compatibility From Large Datasets" (SIGGRAPH 2011) | Kuler: 104,426 five-color themes, 327,381 ratings. COLOURlovers: 383,938 themes. MTurk: 10,743 themes × 40 ratings. LASSO model with 334 features; model weights public | Paper and weights on author site; **underlying theme data inherits Adobe/COLOURlovers terms** | [Paper PDF](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf); [GitHub issue noting weights.csv](https://github.com/solomonBoltin/beautiful/issues/21) |
| COLOURlovers API | Millions of community palettes | **CC BY-NC-SA 3.0**; attribution required; per-palette licenses since 2011 | [API docs](https://www.colourlovers.com/api); [FAQ](https://www.colourlovers.com/faq) |
| ColorBrewer | Cartographic sequential/diverging/qualitative schemes | Apache-2.0; attribution text required; "ColorBrewer" name restricted | [axismaps LICENSE](https://github.com/axismaps/colorbrewer/blob/master/export/LICENSE.txt); [Brewer updates](http://www.personal.psu.edu/cab38/ColorBrewer/ColorBrewer_updates.html) |
| Crameri Scientific colour maps | Perceptually uniform, CVD-friendly colormaps | **MIT** (current; v3.0.0 on Zenodo was CC BY 4.0); cite DOI 10.5281/zenodo.1243862 and Crameri et al. 2020 Nat. Commun. | [Zenodo](https://zenodo.org/records/1243863); [User guide v8.0.1](https://www.fabiocrameri.ch/ws/media-library/ce2eb6eee7c345f999e61c02e2733962/readme_scientificcolourmaps.pdf) |
| MetBrewer / wesanderson / Wada | See §3 | CC0 / MIT / MIT (+ CC BY 4.0 extended) | §3 links |
| Huemint | Trained on ~1.2M scraped graphic-design images (in CIE Lab); three generators: non-ML, transformer, diffusion | No dataset released (none found) | [Medium Khroma/AI tools article](https://medium.com/demagsign/how-khroma-uses-machine-learning-to-create-endless-color-palettes-c00fff9247ed); [MakeUseOf](https://www.makeuseof.com/best-ai-online-color-palette-generators/) (secondary) |
| Khroma | Per-user neural net trained on 50 colors the user picks, plus learned human-made palettes | Proprietary | [Medium](https://medium.com/demagsign/how-khroma-uses-machine-learning-to-create-endless-color-palettes-c00fff9247ed) |
| Colormind | Deep learning trained on popular UIs, photos, film and art (said to be a GAN); REST API; lock colors to steer | Proprietary API; no dataset | [Hackdesign / MakeUseOf summaries](https://www.makeuseof.com/best-ai-online-color-palette-generators/) (secondary; GAN detail unverified) |

- Kuler/COLOURlovers analysis: users strongly prefer bright warm colors and cyans. Fully saturated colors are popular at every hue. Users gravitate only to the most basic hue templates (i, V, I). — [O'Donovan et al.](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)

### Inferences
- Recommended FOSS-safe grounding stack:
  - **Names:** xkcd (CC0) plus meodai (MIT). Use c3 (BSD) for "nameability" and saliency scoring, which helps a colorblind user because colors with distinct names are easier to talk about.
  - **Curated harmony exemplars:** Wada (MIT), MetBrewer (CC0), wesanderson (MIT).
  - **Data-viz ramps:** ColorBrewer (Apache-2.0, needs attribution) and Crameri (MIT).
  - **Learned harmony scoring:** O'Donovan's LASSO weights. Check whether the weights file carries a license before shipping.
- COLOURlovers and Kuler raw data should not be redistributed in a FOSS commercial-compatible project. NC-SA conflicts with MIT/Apache.
- The Mukherjee et al. finding means an LLM agent already holds decent color-concept priors for concepts with a peaked color distribution (e.g., "lemon", "sky"). For diffuse or abstract concepts ("trust", "calm") the agent needs explicit grounding data, which is where a curated scene/material library adds the most value.

### Gaps
- Adobe Color and Coolors terms of service and data availability were not checked. Assume no redistributable dataset.
- The C3 LICENSE file was not read directly; BSD-3 is reported via a downstream repo.
- No license was found for the Lindner thesaurus data or for Jahanian's magazine-cover topics.
- I could not get Pearson correlation figures for GPT-4 vs. human associations from the abstract; the full paper is needed.

## 5. Methods to extract a UI-suitable palette from an image or concept

### Takeaway
The canonical image-to-palette methods are:
- Weighted k-means on Lab histogram bins (Chang et al. 2015).
- Convex-hull / RGBXY decomposition (Tan et al. 2018).
- Celebi/Wu quantization plus a scoring step that picks a seed (Material Color Utilities).

Concept-to-palette methods mine image-search histograms (Lin et al. 2013), co-occurrence or topic models (Jahanian), or LLM priors. A UI palette then needs a separate step: pick one or a few seeds, then generate low-chroma neutrals and contrast-checked tonal ramps, as M3 and Linear do.

### Cited Findings
- **Chang, Fried, Liu, DiVerdi & Finkelstein** (SIGGRAPH 2015, ACM TOG 34(4):139). Three parts: a palette-extraction algorithm, a GUI, and an RBF-weighted color transfer. Untrained users matched expert results in a user study. Later work describes the extraction as a "modified K-means." — [Princeton project page](https://gfx.cs.princeton.edu/pubs/chang_2015_ppr/index.php); [Springer follow-up](https://link.springer.com/article/10.1007/s11390-025-5290-6)
- Conflict on color space: Tan et al. 2018 describe Chang's k-means as running in RGB. A related Adobe patent describes Lab binning (b×b×b, e.g., b=16) with per-bin mean and count, and centroids seeded from dominant and distinct colors. The project page does not specify. — [Tan et al. arXiv 1804.01225](https://arxiv.org/pdf/1804.01225); [USPTO patent](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11010926)
- **Tan, Echevarria & Gingold**: efficient palette decomposition via RGBXY-space convex geometry. They prefer full decomposition over Chang-style edit transfer. — [ACM TOG 2018](https://dl.acm.org/doi/10.1145/3272127.3275054)
- **Material Color Utilities pipeline**: image pixels → `QuantizerCelebi` (128 colors; Wu + WSMeans) → `Score` ranks candidates → top color seeds a scheme (TonalSpot, Neutral, Vibrant, Expressive, Fidelity, Content, Monochrome, Rainbow, FruitSalad). Each variant sets chroma differently: TonalSpot is low-chroma pastel; Fidelity keeps the seed's chroma; Vibrant uses max primary chroma. — [dt.in.th](https://dt.in.th/M3DynamicColorJS); [lib.rs mcu-material-color](https://lib.rs/crates/mcu-material-color); [tinct](https://github.com/lonerOrz/tinct)
- **Lin et al. 2013** (concept to color): 5×5×5 histogram of image-search results, with black/white backgrounds removed and the histogram smoothed. Affinity is balanced against discriminability, then values are assigned to colors optimally. — [UW IDL](https://idl.uw.edu/papers/semantically-resonant-colors)
- **Rathore et al. 2020**: estimate color-concept associations from image statistics against human ratings on the UW-58 colors (54 participants, 12 fruit concepts). — [arXiv 1908.00220](https://arxiv.org/pdf/1908.00220); [GitHub data](https://github.com/Raginii/Color-Concept-Associations-using-Google-Images)
- **Colormind image mode** aims for aesthetically compatible colors rather than the most frequent pixels. — [MakeUseOf](https://www.makeuseof.com/best-ai-online-color-palette-generators/) (secondary)

### Inferences
Suggested ChromaConscious pipeline (synthesis, not sourced as a single method):
1. **Quantize** in OKLab: weighted k-means on binned pixels, with saliency or center weighting to separate subject from backdrop.
2. **Split by area and chroma.** High-area, low-chroma clusters become candidate neutrals and background. Low-area, high-chroma clusters become accent candidates. This mirrors the aerial-perspective structure in §1.
3. **Preserve lightness order.** Record each cluster's L rank so derived UI ramps keep the scene's light→dark structure. Chang et al.'s monotonic luminance mapping is the precedent; that detail comes from memory of the paper and is unverified here.
4. **Reduce chroma for surfaces.** Set the neutral chroma ceiling to roughly M3's ~4–8 (HCT units), with the source scene's hue as the tint.
5. **Run the contrast solver last.** Adjust only L, never hue, so provenance survives. Then run a CVD check and a c3 name-distance check between accents.

### Gaps
- I could not verify Chang et al.'s exact extraction details (Lab vs RGB, black seed, bin weights). The 30 MB preprint was not fetched.
- I found no published evaluation of image-extracted palettes specifically as UI themes.

## 6. Encoding grounded palettes as text an agent can reason with

### Takeaway
No standard schema exists. The strongest precedents are Linear's 3-parameter LCH theme JSON (base, accent, contrast), Material's seed + tonal-palette + role model, and the Wada/MetBrewer pattern of named palettes with provenance. A text-only agent benefits most from named scenes or materials that carry OKLCH anchors, structural rules (lightness and chroma relationships), mood and valence descriptors, and provenance plus license.

### Cited Findings
- Linear's import format: `{"base":[L,C,H],"accent":[L,C,H],"contrast":N}` in CIE LCH, optionally with a sidebar theme. Community themes (Catppuccin, Dracula) use this format. — [marcus-skills Linear design doc](https://github.com/marcus/marcus-skills/blob/main/skills/linear-design-patterns/references/linear-design-system.md) (secondary); [Linear part II](https://linear.app/now/how-we-redesigned-the-linear-ui)
- M3 encodes themes as a seed plus scheme variant plus contrast level, expanded to roles. — [dt.in.th](https://dt.in.th/M3DynamicColorJS)
- Wada data references colors by ID from palettes, with names and chapters. That is a normalized color-table plus palette-table schema. — [mattdesl](https://github.com/mattdesl/dictionary-of-colour-combinations)
- LLMs already estimate color-concept associations comparably to image-based methods, with accuracy depending on concept specificity. — [arXiv 2406.17781](https://arxiv.org/abs/2406.17781)
- EVT: liking for a color tracks the valence of its associated objects. — [Palmer & Schloss 2010](https://escholarship.org/content/qt9fr2s1z1/qt9fr2s1z1_noSplash_852a660b6f43f17c2f472fba69568a3c.pdf)

### Inferences
Proposed entry shape (illustrative only; values are placeholders, not measurements):

```yaml
id: scene/golden-hour-meadow
kind: scene            # scene | material | artwork | film-grade | interior
illuminant: {label: "low warm sun", cct_hint: "warm", shadow_hue_bias: "cool/skylight"}
anchors:               # OKLCH, each with a role hint and area share
  - {oklch: [0.93, 0.03, 85], role: surface, area: 0.45, name: "hay haze"}
  - {oklch: [0.62, 0.12, 130], role: secondary, area: 0.25, name: "lit grass"}
  - {oklch: [0.72, 0.15, 60], role: accent, area: 0.05, name: "low sun"}
  - {oklch: [0.35, 0.04, 250], role: text, area: 0.10, name: "cool shadow"}
structure:             # rules the agent may re-apply after contrast fixes
  lightness_order: [surface, accent, secondary, text]
  chroma_ceiling_surface: 0.03
  shared_hue_bias: 70   # tint neutrals toward this hue
  depth: "far layers lower chroma, hue toward sky (aerial perspective)"
mood: [warm, calm, nostalgic]; valence_referents: ["sunlit field", "straw"]
cvd_notes: "accent vs secondary separate mainly by L under deutan"
provenance: {source: "...", license: "CC0"}
```

- Keep structure as rules, not just hex values. A contrast solver can then move L while the agent preserves "shared hue bias" and "surface chroma ceiling." That is what keeps a sunset feeling like a sunset after accessibility fixes.
- Include `valence_referents` (positive object words) from EVT. Agents can also use them as natural-language handles.
- Store `area` shares. Dominant vs accent is the key UI translation and is lost in flat 5-swatch palettes like Kuler and COLOURlovers.
- Make `license` mandatory per entry so the library stays FOSS-clean, and reject COLOURlovers- or brand-derived entries.

### Gaps
- I found no published schema or evaluation of "scene descriptors" as LLM grounding for palette generation. This would be novel work for ChromaConscious and should be validated with user ratings, ideally including CVD participants.
