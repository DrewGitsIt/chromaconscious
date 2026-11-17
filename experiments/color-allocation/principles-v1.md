## Applying the colors

The theme gives you good colors. Where you spend them decides whether the page looks designed. Before you write CSS, decide the following, in order.

1. **Pick the one thing.** Every screen has one focal point: the hero number, the headline or the main action. Name it first. It alone gets both the largest size and the strongest color. If two things compete for attention, demote one.
2. **Hierarchy before hue.** Reach for emphasis in this order: size, then weight, then lightness (`--foreground` vs `--muted-foreground`), then surface (a card, or an inverted block), and only then color. If size and weight already make the point, leave the color out. A huge number in plain `--foreground` looks more confident than a colored one.
3. **Spend color in one of two ways, never in between.**
   - **Neutral page, small accents.** Most of the screen is `--background`, `--card` and text. The accent appears on 3–5 small things at most.
   - **One bold field.** A single large area, such as a hero band, an ad's background or the top card, is filled with `--primary` (or `--accent-strong`), with text in its `-foreground`. Everything else stays neutral.

   Medium amounts of color everywhere (tinted cards, colored headings, colored icons, colored borders) is what makes a page look generated.
4. **One color, one meaning.** Choose what the accent means on this screen, such as "act here" or "the current value", and use it only for that: the primary button, the active tab, the fill of the key meter. It is not for headings, decoration or icons. A view has one primary button; other actions use `--secondary`, an outline or plain text.
5. **Neutrals do the structure.** Separate regions with the surface ladder (`--background` → `--card` → `--muted`), spacing and, at most, `--border` hairlines. To emphasise or select a block without spending hue, **invert** it: `--foreground` as its background and `--background` as its text.
6. **Status is small and earned.** Use `--destructive`, `--warning` and `--success` only when the item's meaning *is* that status, and only as a dot, an icon, a word or the `-subtle` pill. Calm, normal states get no status color. Every status color sits next to a word or an icon, never alone.
7. **Meters and numbers.** Show amount by length. Draw the fill in one color on a `--muted` track, and print the value as text beside it. Change the fill to `--warning` or `--destructive`, with a label, only when a threshold is actually crossed. Never use a red→yellow→green gradient. For steps or a heat grid, use one hue in lighter and darker mixes, not several chart colors. Use `--chart-1…5` only when categories must be told apart, and use as few as you can.
8. **Tints, not new colors.** For a softer or stronger variant, mix existing tokens: `color-mix(in oklab, var(--primary) 12%, var(--background))`. Don't type new hex values; every color should trace back to a token.
9. **Before you finish, audit.** List every place the accent and the status colors appear, and what each one means. If the accent carries more than one meaning, or a neutral page has more than about five accented things, cut until it doesn't. Check that there is exactly one focal point.

**Example, an account summary card.** The balance is the focal point: 40px, semibold, `--foreground`. The label above it is 13px `--muted-foreground`. The card is `--card` with no border. "Pay now" is the only `--primary` button. "View history" is a plain-text link. An overdue notice is a `--destructive-subtle` pill reading "Overdue" with an icon. Nothing else on the card has hue.
