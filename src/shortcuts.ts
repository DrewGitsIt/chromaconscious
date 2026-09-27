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
}

export type ShortcutId =
  | 'add'
  | 'mono'
  | 'riff'
  | 'back'
  | 'reset'
  | 'startOver'
  | 'bench'
  | 'help'

export const SHORTCUTS: Shortcut[] = [
  { id: 'add', key: 'a', label: 'add a color' },
  { id: 'mono', key: 'm', label: "mono — lock the theme to one color's hue" },
  { id: 'riff', key: 'r', label: 'riff — walk the palette one hop' },
  // z, not b: this is an undo, and it reads as one everywhere else.
  { id: 'back', key: 'z', label: 'back one riff' },
  { id: 'reset', key: 'x', label: 'clear your placements' },
  { id: 'startOver', key: 'o', label: 'start over' },
  { id: 'bench', key: 'b', label: 'show the bench' },
  { id: 'help', key: '?', label: 'this list' },
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
