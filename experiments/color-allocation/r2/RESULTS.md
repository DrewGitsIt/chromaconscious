# Round 2: Sunshare home, fixed content · Sonnet 5.5 · baseline vs v1 vs v2 · 3 runs each

Same theme as round 1 (`t_gbjq4hmqx64r`). The brief now fixes the exact content and forbids invented data; layout and order are the agent's call. v2 is `../principles-v2.md` with `../guides/app.md` inlined. The key is in `../r2-key.json`. The blind page is `blind.html`, with its letters in `../r2-blind-letters.json`.

| | colored px % | colored regions | alert position | `--success` uses | color plan written | contrast fails |
|---|---|---|---|---|---|---|
| baseline | 13.7 | 5.3 | 2nd, 4th, 2nd | 1.7 | 0/3 | 0 |
| v1 | 14.0 | 3.0 | **4th ×3** | 0 | 0/3 | **1 each** (hero label 2.13:1) |
| v2 | **4.2** | 4.3 | **2nd ×3** | 1.0 | **3/3** | 0 |

What v2 did:
- **Every run made the same change:** the navy hero card is gone. The credit sits in a neutral card (1 run) or an amber-tinted card (2 runs). Navy is kept for actions and the active tab.
- **The alert comes second every time**, in a warning-tinted card with a triangle icon, a solid primary action and a quiet "Later".
- **Amber runs through as one meaning:** the credit figure plus the matching credit icon in the activity list, in all three runs. "12% above forecast" gets success color with an arrow in all three.
- **Every run wrote the plan**, and the plans are almost word for word the examples in v2 ("act here, and where you are" / "what you earn"). **Those examples fit this brief too well, so we haven't tested whether v2 generalizes.** The next brief has to be in a different domain.

New risks:
- **Peach and yellow side by side.** In two runs the amber-tinted credit card sits right above the warning-tinted alert. Peach next to pale yellow may be hard to tell apart under deutan vision, which is the brand-versus-status collision v2 warns about. Needs a deutan check.
- **Too pale?** Colored area fell from about 14% to 4%. The page is calmer but the navy brand nearly disappears, while in round 1 the user's favorites led with a navy hero.

v1 regression: "hierarchy before hue" sent `--muted-foreground` onto the navy hero label in all three runs: 2.13:1, a real contrast failure.

## User's blind verdict (2026-11-01)

The user's favorites were G, I and H: **all three baseline runs**. Least favorite were A, B and D: **v2-3, v2-2 and v1-3**. v2-1 (neutral credit card), v1-1 and v1-2 sat in the middle. Baseline has now won two rounds in a row, and both the v1 and v2 rules made things worse.

What the favorites share: a navy hero block holding the credit (amber "$48.20" in two of them); about 14% colored area; status shown in colored pills; the alert in a yellow-tinted card. The bottom two v2 runs are the ones with a peach credit card directly above a yellow alert, the brand-versus-status clash flagged earlier.

Reading: both rule sets cut the brand's presence (v1 by rationing it, v2 with "a thread, not a splash"), and the user wants it present. On this brief Sonnet's defaults are already a strong control, so rules can only win if they *add* to them.
