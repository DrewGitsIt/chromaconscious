# Round 1: Sunshare home screen · Sonnet 5.5 vs Opus 5.5 · baseline vs principles v1 · 3 runs each

Setup: one brief (`brief.md`), one frozen theme (`t_gbjq4hmqx64r`: navy primary #1f3a5f, amber accent #f2a541, taste 1). Every agent got an identical prompt in a blind-named directory. The only difference was `SKILL.md`: the baseline skill, or the baseline plus `../principles-v1.md`. Each agent built one pass with no browser. The key is in `../r1-key.json`. Screenshots are 390px light mode. The metrics come from `../tools/measure.mjs`.

## Metrics (mean of 3)

| | colored px % | amber % | colored regions | status-token uses | chart-token uses | bytes |
|---|---|---|---|---|---|---|
| Sonnet baseline | 15.3 | 1.2 | 4.7 | 3.0 | 1.3 | 8.1k |
| Sonnet principles | 15.4 | 2.4 | **2.3** | **0** | **0** | 6.6k |
| Opus baseline | 15.7 | 2.3 | 5.0 | 3.3 | **5.7** | 19.2k |
| Opus principles | 17.7 | 1.0 | **3.3** | 0.7 | 0.7 | 17.2k |

- "Colored regions" counts connected colored areas over 0.15% of the page, a rough count of focal points.
- "Status" counts uses of `--warning` and `--success`; `--destructive` was never used.
- The contrast column was dropped. Opus pages put hero backgrounds on pseudo-elements and translucent layers, which the checker can't see through, so its "failures" there are artifacts. Sonnet scored 0 in both arms.

## What changed

- **The principles had the same effect on both models, and it's restraint.** Status colors and chart colors almost disappeared, and there were fewer colored regions. Decorative amber went away: Sonnet's amber "$48" and the sun circles, Opus's amber bar charts and sun graphics.
- **Allocation changed, composition didn't.** All 12 builds share one layout: a navy hero card holding the credit number, then a card stack, then a tab bar. The "one bold field or a neutral page" rule got the same answer every time. The gap to Dribbble is mostly composition and type, which v1 doesn't touch.
- **The two brand colors had no assigned jobs, so agents guessed.** Opus principles run 1 dropped amber entirely (0%). Sonnet principles runs 1–2 put amber on the CTA beneath a navy hero, so two strong colors compete. v1 says "the accent" without saying which of primary and accent-strong that is.
- **The rules mostly said what to remove.** v1 told agents where color must not go, so they removed color. Nothing told them where the brand should show up confidently, such as amber as a recurring motif for "credit and earnings".
- **The meter rule did nothing measurable.** Every baseline build already drew a single-color fill on a muted track. This brief has no threshold crossing, so the rule wasn't exercised.
- **The model difference is bigger than the principles effect.** Opus wrote 2.5× more markup: sparklines, pace markers, comparisons to forecast, and data it invented. It looks more "designed". Sonnet is sparse and nearly identical across its three runs.

## User's blind verdict (2026-11-01)

The user's favorites were E, G and F, which are **opus-base-3, opus-base-1 and opus-base-2**. Least favorite were C, D and B, which are **sonnet-prin-1, sonnet-prin-2 and opus-prin-1**. By the user's criteria (clear touchpoints, visual consistency, what needs attention), v1 made things worse. The user also judged every build "generic": a uniform stack of rounded cards on off-white.

Why v1 lost:
- "Status is small" demoted the peak-pricing alert. In the favorites that alert is the second item, in a tinted card with actions.
- The ≤5-accent cap removed amber as a recurring motif with one meaning.
- "One primary button" flattened the hierarchy of actions.

v1 was written for a billboard. In an app, color is a signal system.

Confound: Opus baseline also had the richest content. Next: v2, testing color alone, on Sonnet.
