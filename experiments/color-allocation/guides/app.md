## App screens and dashboards

People open an app to check something and act on it. They come back often, so color has to work as a reliable code: the same color means the same thing on every screen, and the eye learns where to look.

- **Lead with the subject, then what needs attention.** The top of the screen holds what the screen is about (the balance, the status, today's number) at the largest size, in `--foreground` or on a single `--primary` block. The highest-ranked attention item comes next, not buried below the routine content.
- **Routine content stays quiet.** Lists, history and settings use neutral text and surfaces. Icons in lists are `--muted-foreground` on `--muted`, unless the icon itself carries the item's meaning in your plan, such as "credit" in your accent.
- **Brand color is a thread, not a splash.** The accent appears wherever its meaning does: the earnings figure, the matching icon in history, the chart series for that quantity. A reader should be able to scan for the accent and find every instance of its meaning.
- **Navigation:** the active tab or item uses `--primary` (icon and label, or a `--secondary` pill behind them). Inactive items use `--muted-foreground`, and nothing else in the bar has color.
- **Trends and deltas:** up or down is a judgment only when the domain says so. "12% above forecast" for solar output is good news: give it `--success` text with an arrow. A neutral change gets `--muted-foreground`. Never use color without the sign or arrow beside it.
- **Density:** prefer rows separated by dividers over a card for every item. Use cards to group, not to wrap each line.
