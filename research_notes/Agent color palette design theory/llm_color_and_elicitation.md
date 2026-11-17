# LLM color competence, AI palette tools, computable aesthetics, and needs elicitation for eyes-free agents

Scope note: researched 2026-10-06 with ~20 search/fetch calls. Several primary PDFs (ColorBench, ColorGPT full text, a Springer color-word paper) could not be fetched (size limits or paywall redirect), so some findings below rest on abstracts or search-result summaries; those are flagged. Findings about pre-2023 models (BERT/GPT-2/GPT-3 era) are marked [OLDER MODELS] and may not hold for current frontier LLMs.

## (a) What LLMs and multimodal models know, and get wrong, about color

### Takeaway
Text-only LLMs encode a surprisingly human-like map of color names and color-concept associations (correlations with human ratings of r ~ .7, and ~.8 for vision-language models), but that knowledge is coarse. It fits prototypical colors and strongly associated concepts, and degrades on fine-grained, non-prototypical, or abstract/flat-association cases. Vision-language models still fail many color-perception tests. Generated UIs collapse toward a few defaults (blue/indigo/purple) and routinely fail contrast unless constrained. The practical rule for an agent is to trust LLMs for *semantics* (what colors "mean," what hues suit a brief) and not for *measurement* (exact contrast, distinctness, CVD safety). Measurement should go to deterministic tools.

### Cited Findings
**Grounding and perceptual structure (text-only models)**
- [OLDER MODELS] Abdou, Kulmizev, Hershcovich, Frank, Pavlick, Søgaard (CoNLL 2021) measured how well LM embeddings of color names align with perceptual color space (Munsell/CIELAB). They found meaningful alignment. Warmer colors align better than cooler ones on average, and the differences are partly mediated by collocationality and syntactic usage — [ACL Anthology](https://aclanthology.org/2021.conll-1.9/); [arXiv 2109.06129](https://arxiv.org/pdf/2109.06129)
- [OLDER MODELS] The contemporaneous Paik et al. (2021) reached a more negative verdict: text-only LMs do not represent the real-world colors of objects well. The two results are commonly contrasted — [RWS Language Weaver summary](https://www.rws.com/language-weaver/blog/Issue-167-Color-Analysis-in-LMs/)
- Loyola et al. (arXiv 2311.13105) repeated the Abdou setup with abstract/complex color descriptions (e.g., "NYC Taxis"). Alignment was low, in contrast to the strong Munsell-name results. Perceptual structure holds for basic color terms and not for evocative names — [arXiv 2311.13105](https://arxiv.org/html/2311.13105)

**Color-concept associations (most relevant to "what palette suits this brief")**
- Mukherjee, Mohapatra, Rogers & Schloss, *Cognitive Science* 2026, 50(6) e70219. They tested 70 concepts across 14 categories against the 71-color UW-71 set. Mean per-concept Pearson r with human ratings: GPT-4 text-only with hex codes .71 to .73; GPT-4V with color patches .76; GPT-4V with patches plus hex .80 (best, significant for 65 of 70 concepts). Small open models were much weaker: OpenCLIP ~.37, Qwen-3 4B ~.39, Qwen-3-VL 4B ~.50. No model reached human split-half reliability (~.93) — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13286014/)
- In the same paper, alignment was worse for low-"specificity" concepts, meaning concepts whose associations are spread flat across colors (e.g., "bird," "shoes," "near," "greed"), where humans also disagree. Once specificity was controlled, concreteness added nothing. GPT-4V gave "beside" 0 for every color — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13286014/)
- In the same paper, bar-chart palettes optimized from GPT-4V association ratings were interpreted correctly 81% of the time, against 66% for palettes from human ratings in an earlier study. The authors caution that the earlier study ran online during COVID, so the comparison is not apples to apples. They conclude the model estimates are "sufficiently human-like" for visualization design — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13286014/)
- A 2025 *Discover AI* (Springer) paper, "Advancements and limitations of LLMs in replicating human color-word associations," exists on the same theme. Its full text was paywall-redirected and I could not read it — [Springer](https://link.springer.com/article/10.1007/s44163-025-00323-8)

**Vision-language model color perception**
- ColorBench (Liang et al., arXiv 2504.10514, 2025) tests color perception, reasoning, and robustness in VLMs. The authors report substantial limitations and call for better color comprehension in multimodal AI — [arXiv](https://arxiv.org/abs/2504.10514). (I could not fetch the full PDF for specific numbers.)
- "Color Names in Vision-Language Models" (Gomez-Villa et al., arXiv 2509.22524; withdrawn ICLR 2026 submission) ran 957 color samples across 5 VLMs. Accuracy was high on prototypical colors and dropped significantly on non-prototypical colors. 21 common terms recur across models. Some models add lightness modifiers. Models were biased toward English and Chinese, and their naming shifted with the object depicted — [arXiv](https://arxiv.org/abs/2509.22524)
- An "embedded Stroop" benchmark (arXiv 2511.13400) found exact text-color accuracy of only 6.3% over a 59-color vocabulary and 38.4% when mapped to 11 basic families. In 21.6% of cases (the Stroop Hallucination Rate) the model reported the color word written in the image instead of the actual ink color — [arXiv](https://arxiv.org/html/2511.13400)
- ColorFoil (arXiv 2405.11685) probes "color blindness" in V&L models with near-miss color foils — [arXiv](https://arxiv.org/pdf/2405.11685)
- "Seeing Red, Thinking Bad" (arXiv 2608.14286, Aug 2026) found that coloring words green or red shifts VLM sentiment judgments, by up to half a label on a 3-point scale for some models. VLMs absorb color *connotations* in ways that can bias judgments — [Pith review](https://pith.science/paper/2608.14286)

**Typical biases when LLMs make UIs and palettes**
- W4A '25 study of ChatGPT- and Claude-generated banking UIs observed "consistent use of blue color schemes." Accessibility-oriented prompts reduced WCAG violations but "persistent barriers remain" — [ACM DL](https://dl.acm.org/doi/10.1145/3744257.3744266)
- A 2026 systematic review of LLMs for web accessibility (arXiv 2605.13873) found insufficient color contrast was the second most common issue, reported in 16 studies — [arXiv](https://arxiv.org/html/2605.13873) (via search summary)
- The "purple problem": AI-generated sites default to indigo/purple gradients. The widely cited explanation is Tailwind UI's `bg-indigo-500` demo default spread through training data. Adam Wathan's Aug 2025 tweet apologizing for it went viral. This is practitioner commentary, not research, and one source calls the causal story speculative — [Medium (Kai Ni)](https://medium.com/@kai.ni/design-observation-why-do-ai-generated-websites-always-favour-blue-purple-gradients-ea91bf038d4c); [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website); [925studios "AI slop tells"](https://www.925studios.co/blog/ai-slop-design-tells)
- ColorGPT (Xia, Inoue, Qiu, Kikuchi; arXiv 2508.08987, Springer 2026) found its LLM-based palette pipeline slightly favored white. It also found **hex codes are a strong color representation for LLMs, and adding descriptive words further improves accuracy** — [arXiv abstract](https://arxiv.org/abs/2508.08987); [search summary of paper](https://arxiv.org/html/2508.08987)
- Colormind's developer reported that a regression-style LSTM palette model "avoided bright colors," drifting to dull browns and greys because it was "afraid to be wrong." He switched to a GAN to fix this. Mean-seeking models desaturate, and sampling or adversarial models do not — [Colormind blog](http://colormind.io/blog/)

### Inferences
- LLM color knowledge is distributional. It gives the *typical* association, which is why outputs are median-looking (indigo, blue for finance, white backgrounds). An agent that just "picks colors" will converge on these. ChromaConscious can counter this by exposing seeds and walks (riff), and by having the SKILL.md tell agents to name an aesthetic direction and avoid known defaults.
- Pass colors to and from agents as **hex plus a short name/description** (ColorGPT's finding). Response payloads should include human-readable names (e.g., "deep teal, L 38") next to hex, because that representation is what models reason with best.
- Agents should be told explicitly not to estimate contrast, ΔE, or CVD confusability in their heads. The VLM and LLM evidence shows coarse, family-level perception only. The API's built-in contrast solving is the right division of labor.
- Concept-to-color association is the one area where LLMs are close to human level (r ~ .7 to .8) and can carry the "brief to hue family" step. Even there, flat-association concepts ("trustworthy software tool") give weak signals, so the agent should fall back to user choice among options.

### Gaps
- No peer-reviewed benchmark found that measures LLM-*generated UI palettes* for saturation, hue-distribution bias, or contrast failure rates specifically. The "purple" bias evidence is anecdotal or practitioner-level, apart from the W4A blue observation.
- ColorBench numbers (scaling behavior, CVD-test results) not retrieved. The full paper is needed.
- No study found on 2026 frontier text models (Claude 4.x/5.x, GPT-5-class) and color arithmetic, e.g., computing WCAG ratios or OKLCH conversions from hex in-context.

## (b) Prior AI/ML palette-generation systems and how they were evaluated

### Takeaway
Text-to-palette and ML palette systems fall into three families: learned text-to-palette (Text2Colors, Text2Palette, Music2Palette, ColorGPT), data-driven harmony scoring or generation (O'Donovan, Colormind GAN), and **constraint-driven role palettes (Huemint's contrast graph)**. The last is the closest precedent to ChromaConscious's role/contrast model. Academic evaluation is almost always CIEDE2000-based diversity/similarity metrics plus small preference user studies. Commercial tools publish little to no evaluation.

### Cited Findings
- **Text2Colors** (Bahng, Cho et al., ECCV 2018, "Coloring with Words") uses a conditional GAN text-to-palette network trained on the Palette-and-Text (PAT) dataset. It outputs 5 colors. Evaluation used CIEDE2000-based multimodality/diversity metrics and user studies, where people *preferred generated palettes over ground-truth palettes*. The PAT data was noisy because users named palettes arbitrarily — [CVF open access](https://openaccess.thecvf.com/content_ECCV_2018/papers/Hyojin_Bahng_Coloring_with_Words_ECCV_2018_paper.pdf); [ar5iv](https://ar5iv.labs.arxiv.org/html/1804.04128)
- A later patent notes that Text2Colors works for short color-evocative text ("pink sunset") and struggles with semantic/compositional queries ("taking a long sunset walk on the beach"). It is fixed at 5 colors — [USPTO](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12266034)
- **Text2Palette** (2021, J. CAD & CG) builds palettes from internet image search. In its user study, more than half of users judged it better than baselines for 69% (accuracy) and 94% (diversity) of input texts — [SciEngine](https://www.sciengine.com/JCADC/doi/10.3724/SP.J.1089.2021.18559)
- **Music2Palette** (arXiv 2507.04758) uses Text2Colors as a baseline via music-to-text keywords — [arXiv](https://arxiv.org/pdf/2507.04758)
- **ColorGPT** (2025/26) evaluated off-the-shelf LLMs on palette completion and full palette generation. It beat prior methods on suggestion accuracy and color distribution for completion, and improved diversity and similarity for full generation — [arXiv](https://arxiv.org/abs/2508.08987)
- **Colormind** started as an LSTM, which produced dull results, then moved to a modified pix2pix GAN trained on Adobe Color data that fills in partial palettes. Separate models are trained on photos, film, and art. Palette *position* matters: complements at the ends yield in-between shades, and contrasting colors close together yield triadic schemes — [Colormind blog](http://colormind.io/blog/)
- **Huemint** (same developer, per search summary) assigns colors to *roles* (background, text, logo, navbar) from a **contrast graph**. This is an n×n adjacency matrix of target CIE ΔE between elements (100 max, 1 min, 0 meaning "not adjacent"). Modes: random with top-1% filtering, a transformer (Image-GPT-style tokens, top-p 0.8, temp 1.2), and diffusion (Improved DDPM; the output is only ~12 "pixels"). The API takes mode, 2 to 12 colors, temperature 0 to 2.4, the adjacency matrix, and locked hex colors — [Huemint About](https://huemint.com/about/)
- **O'Donovan, Agarwala, Hertzmann, "Color Compatibility From Large Datasets"** (SIGGRAPH 2011). Datasets: Kuler, COLOURLovers (383,938 themes), and MTurk (10,743 themes × 40 raters). They fit a LASSO regression over 334 features in RGB/Lab/HSV/CHSV that predicts a 1 to 5 rating for 5-color themes. Themes far from their 10 nearest neighbors rate lower, so good themes lie on a manifold. Classic **hue templates fit the data poorly**. Model weights are published — [project page](https://www.dgp.toronto.edu/~donovan/color/); [PDF](https://www.dgp.toronto.edu/~donovan/color/colorcomp.pdf)
- A 2024 ACM TAP paper (Color Theme Evaluation through User Preference Modeling) still uses the O'Donovan MTurk ratings as ground truth and evaluates with RMSE/MAE — [ACM](https://dl.acm.org/doi/pdf/10.1145/3665329)
- Industry tools (Khroma, Coolors AI, Adobe Firefly/Color, Figma AI): I found no primary documentation of their methods or any published evaluation in this pass. Review-site claims conflict with developer write-ups. For example, one tutorial claims Colormind trained on Dribbble/Behance, while its own blog says Adobe Color data — [Colormind blog](http://colormind.io/blog/)

### Inferences
- Huemint's contrast-graph input is conceptually the same as ChromaConscious's roles plus contrast solving. It is evidence that "roles and pairwise contrast constraints" is a good agent-facing abstraction, because it is numeric, declarative, and needs no eyes.
- The repeated finding that **typicality predicts liking** (O'Donovan's manifold, GAN vs LSTM) cuts both ways. Typical palettes score well with crowds, yet that same pull produces the generic AI look. A useful knob is "how far from the median" (cf. riff walk distance), with the agent choosing deliberately.
- Text-to-palette models have been evaluated on short evocative prompts. None were evaluated on UI role assignment or accessibility, so there is no prior art to borrow for evaluating "is this a good *app theme*."

### Gaps
- No published user studies for Khroma, Coolors AI, Firefly, or Figma AI palette features were found.
- "Color2Vec"/semantic palette embeddings: not searched within budget. PaletteNet and palette-based recoloring (Chang et al. 2015) were not covered.

## (c) Computational palette quality metrics an agent could call

### Takeaway
Reliability tiers for tool feedback: **(1) Reliable, deterministic, use as hard constraints:** WCAG 2.x contrast ratio (the legal standard), APCA Lc (better perceptual readability, especially dark mode, but not normative), CIEDE2000/OKLab ΔE between roles, and CVD-simulated ΔE using Machado 2009 for protan/deutan (with severity) and Brettel 1997 for tritan. **(2) Moderately reliable, use as soft signals or for ranking:** Heer & Stone name difference and the Colorgorical scores (validated against task response time). **(3) Weak, use only as tie-breakers:** harmony and aesthetic scores (Ou & Luo 2006, O'Donovan 2011). They are built on small samples or crowd ratings of abstract swatches and do not transfer cleanly to UI contexts.

### Cited Findings
**Contrast**
- WCAG 2 vs APCA: Myndex (APCA's author, so not neutral) argues WCAG 2 "far overstates contrast for dark colors." 4.5:1 can be unreadable near black, and predictions degrade when the lighter color is darker than ~#a0a0a0. Example: #797979 on #110402 passes WCAG 4.5:1 but fails APCA for all text. Conversely, white on orange fails WCAG (2.97:1) but reads fine (Lc 61), and Myndex says it is more readable for CVD users — [Myndex WhyAPCA](https://github.com/Myndex/SAPC-APCA/blob/master/documentation/WhyAPCA.md)
- APCA outputs Lc 0 to 106 (dark on light) and 0 to −108 (light on dark), with thresholds that depend on font size and weight. Bridge-PCA is a WCAG-2-compatible variant — [Myndex WhyAPCA](https://github.com/Myndex/SAPC-APCA/blob/master/documentation/WhyAPCA.md)
- Status conflict: a 2026 practitioner guide describes APCA as WCAG 3's candidate method — [CSS DNA](https://cssdna.com/blog/wcag-vs-apca-contrast/). This is unverified, and the researcher's understanding is that W3C removed APCA from WCAG 3 drafts around 2023. Treat WCAG 2.x as the legal floor and APCA as an advisory second check.
- A constrained optimizer (arXiv 2512.05067) minimally adjusts colors to meet WCAG and fixed violations in 77.22% of cases with barely noticeable changes. This is precedent for "solve contrast, don't guess" — [arXiv](https://arxiv.org/abs/2512.05067)

**Distinctness and naming**
- Colorgorical (Gramazio, Laidlaw, Schloss, IEEE TVCG 2017) scores candidates with a weighted sum of Perceptual Distance (CIEDE2000), **Name Difference** (Heer & Stone's model over the XKCD naming survey), Name Uniqueness, and Pair Preference (Schloss & Palmer). Raising Perceptual Distance and Name Difference weights reduced task response time strongly: for 3- and 5-color palettes, r = −.93/−.76 for distance and −.89/−.69 for name difference. Raising Pair Preference weight *slowed* response, a measurable discriminability-vs-aesthetics trade-off. Name Uniqueness had little effect. Aesthetic preference for 3/5/8-color charts was well predicted by Schloss & Palmer pair-preference regression — [Colorgorical PDF](https://vis.cs.brown.edu/docs/pdf/Gramazio-2016-CCD.pdf); [Semantic Scholar](https://www.semanticscholar.org/paper/Colorgorical:-Creating-discriminable-and-preferable-Gramazio-Laidlaw/fc41f9e155143207039a3655206a786b070703ac)
- Perceptual and name distance can diverge. Chartreuse is perceptually distinct from green and yellow yet is *called* green or yellow, while red and pink are close but differently named — [Colorgorical](http://vrl.cs.brown.edu/color)
- Palettailor (arXiv 2009.02969) benchmarked against Colorgorical at 20% distance / 40% name difference / 40% pair preference — [ar5iv](https://ar5iv.labs.arxiv.org/html/2009.02969)

**CVD simulation**
- Machado, Oliveira & Fernandes (IEEE TVCG 2009) is physiologically based. It covers protan/deutan dichromacy *and anomalous trichromacy* with severity, available as precomputed matrices in 0.1 severity steps. It was validated with CVD and normal observers — [project page](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)
- DaltonLens review: Machado is close to Brettel 1997 for dichromacy because it was tuned to match it. It is weak for tritanopia (untested with tritanopes), and Brettel 1997 is recommended for tritan. Viénot 1999 is a faster single-matrix simplification of Brettel — [DaltonLens](https://daltonlens.org/opensource-cvd-simulation/)
- Implementations: R colorspace, R prismatic, Python colour-science — [DaltonLens](https://daltonlens.org/opensource-cvd-simulation/); [colorspace](http://colorspace.r-forge.r-project.org/articles/color_vision_deficiency.html)

**Harmony / aesthetics**
- Ou & Luo 2006 (*Color Res. Appl.* 31(3)) was derived from 1431 pairs of 54 CIELAB colors rated on a gray background on a CRT. The model is CH = HC + HL + HH. Harmony falls with chromatic difference (the equal-hue principle), rises with lightness sum, and drops when ΔL is very small. Yellows harmonize except dark khaki. The formula has been reproduced in patents. Multi-color palettes are averaged over pairs (Ou et al. 2011 "additivity") — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.20208); [author PDF](https://www.researchgate.net/profile/Ming-Luo-13/publication/229906278_A_color_harmony_model_for_two-color_combinations/links/5c0c957192851c39ebde1ea2/A-color-harmony-model-for-two-color-combinations.pdf)
- Limitations: small observer counts (as few as 17 in some experiments). Ou's model underperformed Huang's on clothing two-color combinations (Liu & Ou 2017) — [Springer Fashion & Textiles 2025](https://link.springer.com/article/10.1186/s40691-025-00433-y)
- O'Donovan 2011 LASSO model: themes far from popular ones score lower, and hue templates (Matsuda/Itten-style) fit poorly — [project page](https://www.dgp.toronto.edu/~donovan/color/)
- A 2025 "Unified Color Harmony Model" (Xu, *Color Res. Appl.*) exists but was not reviewed — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.22977)

### Inferences
- Suggested agent-facing feedback object per palette, all deterministic:
  - contrast per role-pair, giving WCAG ratio plus APCA Lc and pass/fail against declared targets
  - min ΔE (OKLab or CIEDE2000) between categorical roles (chart series, status colors)
  - the same ΔE under Machado protan/deutan at severity 1.0 and Brettel tritan, giving a "worst-case CVD min ΔE" with the colliding pair named
  - name-difference / basic color name per swatch, so colors can be described verbally and same-named collisions flagged
  - optionally Ou harmony and lightness-spread, labeled advisory
- Name Difference is especially valuable for this project. It gives a text-native distinctness signal ("these two would both be called 'blue'") that an eyes-free agent can relay, and that a colorblind user who relies on names can check.
- Do not let an agent optimize for harmony scores. Their weak validation and context-free swatch basis make them easy to game toward bland, typical palettes, which is the purple/blue median again.

### Gaps
- No validated "UI theme quality" metric found. All aesthetic models are trained on abstract swatch strips, not rendered interfaces.
- Ou et al. 2004 color-emotion formulas (warm-cool, heavy-light, active-passive as CIELAB functions) were not retrieved this pass. They would be the natural numeric bridge from adjectives to parameters.
- Heer & Stone 2012 (CHI) primary paper not fetched. Its details are known only via Colorgorical.

## (d) Needs elicitation: turning user intent into palette parameters

### Takeaway
There is a mature tradition for mapping adjectives to color: Osgood's semantic differential, Kobayashi's Color Image Scale (warm-cool × soft-hard, plus clear-grayish), and Kansei engineering. It gives an agent a small set of bipolar questions whose answers map onto lightness, chroma, and hue ranges. Combine this with LLM concept-to-color association (near-human for specific concepts) and present a **small set of deliberately contrasting options described in words**, with tool-verified accessibility facts. Then let the user choose, rather than asking the agent to "see."

### Cited Findings
- Kobayashi's Color Image Scale (1981 *Color Res. Appl.* 6(2):93 to 107; book, Kodansha 1990/91) was built with semantic-differential, factor, and cluster analysis. Every color has three attributes (warm-cool, soft-hard, clear-grayish), correlated with hue, value, and chroma. It matched 130 basic colors and 1,170 **three-color combinations** to 180 image words, grouped into 15 patterns (e.g., fashion/lifestyle terms) on a 2D warm-cool × soft-hard plane, with intensity graded 1 to 3 from the center — [Wiley](https://onlinelibrary.wiley.com/doi/10.1002/col.5080060210); [Linköping "Color Semantics for Image Indexing"](https://www.diva-portal.org/smash/get/diva2:325913/FULLTEXT01.pdf)
- Computational uses: an image's position on the scale = mean of its image-word histogram (Linköping). Japan's EVE emotional search engine uses the same soft-hard/warm-cool axes. Color-emotion research places the "warmest" hue angle near 50° and links warm-cool to hue angle and chroma — [Linköping](https://www.diva-portal.org/smash/get/diva2:325913/FULLTEXT01.pdf); [search summary](https://www.researchgate.net/publication/229569563_The_aim_and_method_of_the_color_image_scale)
- Mining color semantics from visual designs, building on Kobayashi — [arXiv 1505.06532](https://arxiv.org/pdf/1505.06532)
- Kansei engineering (Nagamachi, 1970s onward) translates feelings into design features, usually via adjective pairs on SD scales (Osgood). Typical phases: choose domain, define semantic space, synthesize, validate. Adjective sets can reach hundreds and are pruned (e.g., PCA) — [Atlantis Press review](https://www.atlantis-press.com/article/125985598.pdf); [USPTO PCA-E](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11868432)
- Kansei color work combines SD ratings with genetic algorithms, neural nets, and grey relational analysis. Interactive genetic algorithms, where users iteratively pick preferred variants, have been used for color schemes — [ResearchGate (Kansei + IGA)](https://www.researchgate.net/publication/322117397_Color_design_based_on_Kansei_engineering_and_interactive_genetic_algorithm)
- A PAD (pleasure-arousal-dominance) variant uses 12 adjective pairs on a −4 to +4 scale — [PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0341895)
- A 2026 Kansei protocol mines color adjectives by web crawl, filtered for simplicity, universality, unambiguity, and no jargon, and extracts antonym pairs via word vectors. Recent work uses LMs to expand Kansei vocabularies, with partial overlap with human elicitation. It warns that affect varies by demographic — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13530209/)
- Context, culture, and demographics limit any fixed color-semantic mapping — [Kobayashi search summary / Kansei sources](https://pmc.ncbi.nlm.nih.gov/articles/PMC13530209/)
- Practitioner guidance on escaping generic AI design: give the model brand context, a *named* aesthetic, explicit defaults to avoid, a token system, and a screenshot loop — [925studios](https://www.925studios.co/blog/ai-slop-design-tells); [techarion](https://techarion.com/blog/why-ai-websites-look-the-same-how-to-make-claude-design-better) (practitioner sources, attributed in search results to Anthropic's "distributional convergence" framing; primary Anthropic page not fetched)

**Eyes-free tool-design patterns (render and critique)**
- ReLook (arXiv 2510.11498, Oct 2025): generate code, render screenshots, and score with an MLLM critic. Invalid renders get zero reward to prevent reward hacking. "Forced Optimization" accepts only improving revisions. At inference, a critic-free self-edit loop keeps most gains — [arXiv](https://arxiv.org/html/2510.11498v1)
- Design critique from GPT-4 on JSON UI representations showed gaps vs human experts. Screenshot-grounded critique with few-shot UICrit examples helped but still fell short of experts — [arXiv 2412.16829](https://arxiv.org/pdf/2412.16829)
- Combined with (a): VLM critics are unreliable on fine color (Stroop 6.3% exact, non-prototypical naming drops). Render-and-critique is useful for layout and overall impression but should not judge contrast or CVD; deterministic checks should — [arXiv 2511.13400](https://arxiv.org/html/2511.13400); [arXiv 2509.22524](https://arxiv.org/abs/2509.22524)

### Inferences
- **Elicitation script (proposed):** 4 to 6 questions, each mapping to a parameter:
  1. Context of use and mode (light, dark, both; long reading vs dashboards). This sets contrast targets and APCA vs WCAG emphasis.
  2. Audience and accessibility needs, asked directly and without assuming ("Does anyone on your team or in your audience have color-vision differences?"). This sets CVD constraints and chart-series ΔE floors.
  3. Two or three Kobayashi-style bipolar sliders (warm↔cool → hue range; soft↔hard → lightness contrast and chroma; quiet/grayish↔vivid/clear → chroma ceiling).
  4. Three brand or feeling words. The LLM maps these to hue families, which it does near human level for specific concepts, and falls back to asking when the words are flat-association ("modern," "professional").
  5. Fixed constraints (existing brand hex, colors to avoid).
  6. "How far from typical?" (conventional ↔ distinctive), which maps to seed distance or riff hops.
- **Presenting options to a colorblind user:** offer 3 contrasting candidates (e.g., one cool/quiet, one warm/vivid, one wildcard) rather than many near-variants, following the Kansei/IGA "pick and iterate" pattern. Describe each in words: basic color names, lightness ("dark navy surface, pale sand text"), and mood words on the Kobayashi axes. Attach tool-verified facts ("all text ≥ 7:1; chart colors stay distinct under deutan simulation, closest pair ΔE 18 = 'teal' vs 'gray'"). Never say "these look great together" unless a tool supports it.
- Iterate on deltas the user can state verbally ("warmer," "less loud," "more separation between chart colors"), which map directly onto the bipolar axes. This keeps the loop eyes-free for both the agent and a CVD user.
- A SKILL.md should include 2 or 3 worked exemplar briefs → parameter sets → resulting palettes (reference exemplars). LLMs do best when anchored, and exemplars counter the indigo default.

### Gaps
- No study found that tests LLM agents running structured color-needs elicitation dialogues with real users, or that compares eliciting by adjective sliders vs free text vs choosing among options.
- No empirical guidance found on how colorblind users prefer palettes described in words (names vs lightness vs mood). This is a candidate for the owner's own testing.
- The Kobayashi image-word to palette data is in a commercial book and not openly licensed as a dataset, which may limit direct inclusion in a FOSS project (not verified).
- Adobe/Figma/Coolors AI elicitation UX (how they prompt users) not researched.
