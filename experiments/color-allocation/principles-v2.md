## Applying the colors

The theme gives you good colors. Where you spend them decides whether the page works. Color is a signal: each color should tell the reader what something *is* or how much it needs them.

**Write a color plan first.** Before any CSS, put a short comment at the top of your stylesheet that answers three questions:

1. What does each brand color mean on this page?
2. What needs the reader's attention most?
3. What are the actions, from most to least important?

Then build to the plan.

1. **Give each brand color one meaning, and use it wherever that meaning appears.** The theme has two brand colors: `--primary` and `--accent-strong` (with `--accent` as its soft tint). Decide what each one stands for here. For example, primary is "act here, and where you are", and accent is "what you earn". Every instance of that meaning gets that color, and nothing else does. A color that repeats with a single meaning makes a screen feel consistent and easy to scan. There is no quota; the rule is one meaning per color.
2. **Rank attention, then match the strength.** List what is on the screen by how much it needs the reader *now*. Give each item treatment in proportion:
   - **Fine or normal:** no status color. At most a quiet word.
   - **Worth knowing:** a small icon or word in the status color.
   - **Needs action soon** (a deadline, a price change, a pending step): a tinted container (`--warning-subtle`, `--destructive-subtle` and similar) with an icon, a clear heading and its own action. Place it high on the screen.
   - **Broken or urgent:** a solid status fill, sparingly.

   The top-ranked item should be the one the eye finds second, after the page's main subject.
3. **Style actions by importance.** In each region, the main action is a solid `--primary` button. Secondary actions are `--secondary` or outlined. Minor actions ("See all", "Later", "Details") are `--link` text or quiet buttons. Anything tappable must look tappable, and nothing that isn't tappable should look like a button.
4. **Status colors mean status, nothing else.** `--warning` means caution, even if your brand is amber. If a brand color sits near a status hue (look at the summary's seats), don't use the brand color anywhere it could be read as a status, and always put an icon or word next to status colors.
5. **Neutrals do the structure.** Separate regions with the surface ladder (`--background` → `--card` → `--muted`), spacing and `--border` hairlines. To mark a selected block without spending a hue, invert it: `--foreground` as its background.
6. **Data follows meaning.** A meter's fill uses the color of what it measures, on a `--muted` track, with the value printed beside it. It turns `--warning` or `--destructive`, with a label, only when a threshold is crossed. Use `--chart-1…5` only when categories need telling apart.
7. **Mix tints; don't invent colors.** `color-mix(in oklab, var(--accent-strong) 14%, var(--card))`. Every color should trace back to a token.
8. **Audit against your plan.** Every colored element should map to a line in your plan. Remove anything that doesn't, and add color anywhere the plan's meaning appears without it.

**Choose the guide for what you are building** and follow it on top of the rules above:
- app screens and dashboards: [app.md](guides/app.md)
- marketing pages and ads: not written yet
- docs: not written yet
- store listings: not written yet
- email app UI: not written yet
