/**
 * The keyboard map, in one table.
 *
 * The control row's tooltips, the flyout, and the key handler all read this,
 * so a key cannot end up bound to one thing and documented as another. Adding
 * a shortcut means adding a row here and a case in App's handler — the label
 * and the tooltip come along for free.
 */
export interface Shortcut {
  id: ShortcutId
  key: string
  /** What it does, phrased as the button's own label reads. */
  label: string
  /**
   * The sidebar section whose control this key presses. A key aimed at a
   * folded section opens it and scrolls it into view before acting, so the
   * press is never silent and its result is on screen. Keys with no section
   * act on the stage (vision) and need nothing opened.
   */
  section?: SectionId
}

/** The pane's sections, in order. `input` is what `colors` is called before any colour exists. */
export type SectionId = 'input' | 'colors' | 'tuning' | 'riff' | 'compare'

export type ShortcutId =
  | 'add'
  | 'mono'
  | 'riff'
  | 'back'
  | 'reset'
  | 'startOver'
  | 'chart'
  | 'vision'
  | 'help'

export const SHORTCUTS: Shortcut[] = [
  { id: 'add', key: 'a', label: 'add a color', section: 'colors' },
  { id: 'mono', key: 'm', label: "mono — lock the theme to one color's hue", section: 'colors' },
  { id: 'riff', key: 'r', label: 'riff — walk the palette one hop', section: 'riff' },
  // z, not b: this is an undo, and it reads as one everywhere else.
  { id: 'back', key: 'z', label: 'back one riff', section: 'riff' },
  { id: 'reset', key: 'x', label: 'clear your placements', section: 'colors' },
  { id: 'startOver', key: 'o', label: 'start over', section: 'colors' },
  { id: 'chart', key: 'c', label: 'show or fold the chart series', section: 'colors' },
  { id: 'vision', key: 'v', label: 'vision — cycle typical, protan, deutan, tritan' },
  // the flyout hangs off the colors header, which a fold hides
  { id: 'help', key: '?', label: 'this list', section: 'colors' },
]

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]))

/** The key for a control, for its tooltip. */
export const keyFor = (id: ShortcutId): string => BY_ID.get(id)!.key

/**
 * A control's `title`, with its key appended in the same shape everywhere.
 * Tooltips are where a shortcut is actually discovered — the flyout only helps
 * someone who already suspects there are any.
 */
export const withKey = (id: ShortcutId, title: string): string =>
  `${title}  ·  ${keyFor(id).toUpperCase()}`

/**
 * True when a keystroke belongs to whatever the user is typing in, rather than
 * to the app. Without this, typing a hex into the add field would riff, bench
 * and start over on the way through.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}
