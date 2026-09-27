import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker } from 'react-colorful'
import { Plus } from 'lucide-react'
import { parseColor, toHex } from '../engine'
import { ColorSwatchPicker, EyeDropperButton } from './ColorSwatchPicker'
import './ColorAddField.css'

interface Props {
  placeholder: string
  /** Whether a hex is already in the candidate list (dedup for the picker). */
  has: (hex: string) => boolean
  onAdd: (inputs: string[]) => void
  /** 'inline' is the sidebar's `+` swatch, which opens a picker popover;
      'hero' is the large first-run block, everything on show at once.
      The hero deliberately does NOT collapse to a 32px `+`: it is the app's
      front door with nothing else on the stage, and a door should look like
      one. Shrinking it would buy space the empty stage does not need. */
  layout?: 'inline' | 'hero'
  /** Controlled open state for the inline popover; uncontrolled when omitted. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Split on whitespace and commas that sit OUTSIDE parentheses, so functional
 * colour syntaxes survive being pasted next to each other.
 *
 * A plain `.split(/[\s,]+/)` shredded `oklch(0.7 0.12 250)` — the syntax this
 * field's own placeholder advertises — into three fragments. Two failed to
 * parse and were dropped in silence; the third, `124` out of
 * `rgb(91, 124, 250)`, parses as the three-digit hex `#124`. So typing a light
 * blue added a dark navy, which is worse than refusing it.
 */
function tokenizeColors(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && /[\s,]/.test(ch)) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** What the popover has understood about the field, one object, no branches
    left for the JSX to re-derive. */
interface FieldRead {
  /** Raw token strings to hand to `onAdd` — unparsed, so the seat keeps the
      provenance of what was actually typed rather than our hex of it. */
  payload: string[]
  /** The unreadable tokens, re-joined. What stays in the field after a commit:
      clearing a typo is how the old field lost it in silence. */
  leftover: string
  /** Every readable colour, in order — the field's preview swatch. */
  hexes: string[]
  message: string
  /** Unreadable tokens present: the message turns red. */
  messageBad: boolean
  /** Nothing readable at all: the field itself turns red. */
  fieldBad: boolean
  addLabel: string
  canAdd: boolean
}

const HINT = 'pick above, or type a hex, a css name, rgb() or oklch()'
const EXAMPLES = 'try #e63946, rebeccapurple, oklch(70% .12 250)'

/**
 * Read the field the way the user would: every token judged separately, and
 * every verdict said out loud. The old control had exactly one response to
 * unreadable input — clear the field, add nothing, say nothing — and `#gg12`
 * was indistinguishable from a working add.
 */
function readField(text: string, picked: string, has: (hex: string) => boolean): FieldRead {
  const tokens = tokenizeColors(text)
  const reads = tokens.map((token) => {
    const color = parseColor(token)
    return { token, hex: color ? toHex(color) : null }
  })
  const good = reads.filter((r): r is { token: string; hex: string } => r.hex !== null)
  const unreadable = reads.filter((r) => r.hex === null).map((r) => r.token)
  const leftover = unreadable.join(' ')

  // An empty field is not an empty intent — the square above is showing a
  // colour, and "add color" means that one. So the picked hex stands in.
  const candidates = tokens.length === 0 ? [{ token: picked, hex: picked }] : good
  const hexes = candidates.map((c) => c.hex)
  // `has` is the dedup the picker has always had, now applied to typed tokens
  // too: `addCandidates` appends without checking, so letting a duplicate
  // through would quietly grow a second identical candidate.
  const fresh = candidates.filter((c) => !has(c.hex))

  if (unreadable.length > 0 && good.length === 0) {
    return {
      payload: [],
      leftover,
      hexes,
      message: `can’t read “${unreadable[0]}” — ${EXAMPLES}`,
      messageBad: true,
      fieldBad: true,
      addLabel: 'add color',
      canAdd: false,
    }
  }
  if (fresh.length === 0) {
    return {
      payload: [],
      leftover,
      hexes,
      message: 'already on the board — adding it again changes nothing',
      messageBad: false,
      fieldBad: false,
      // The mockup leaves this button live and lets the click no-op. A dead
      // click that reports success is the thing this whole change is about,
      // so the button says why it is out instead.
      addLabel: 'already added',
      canAdd: false,
    }
  }

  const label = fresh.length > 1 ? `add ${fresh.length} colors` : `add ${fresh[0].hex}`
  if (unreadable.length > 0) {
    return {
      payload: fresh.map((c) => c.token),
      leftover,
      hexes,
      message: `adds ${fresh.length} — “${unreadable[0]}” is not a colour and stays in the field`,
      messageBad: true,
      fieldBad: false,
      addLabel: label,
      canAdd: true,
    }
  }
  const dupes = candidates.length - fresh.length
  return {
    payload: fresh.map((c) => c.token),
    leftover,
    hexes,
    message:
      tokens.length === 0
        ? HINT
        : dupes > 0
          ? `${dupes} already on the board — adding the other ${fresh.length}`
          : good.length > 1
            ? `${good.length} colours read`
            : `reads as ${good[0].hex}`,
    messageBad: false,
    fieldBad: false,
    addLabel: label,
    canAdd: true,
  }
}

/** Viewport breathing room, and the gap between the swatch and the popover. */
const MARGIN = 8
const GAP = 6

/**
 * Pin the popover to its trigger in VIEWPORT coordinates.
 *
 * The mockup opens this popover upward with `position: absolute`, on the
 * reasoning that a downward one is clipped by `.sidebar-shell` (overflow:
 * hidden) and `.sb-body` (overflow-y: auto). Measured in a real browser, that
 * is only half true: with `.sb-body` scrolled to its end at a 720px viewport
 * the swatch sits ~237px below the fold and ~272px above it, and the popover
 * is ~296px tall — so NEITHER direction fits. Any absolutely-positioned answer
 * is clipped at some scroll offset.
 *
 * So it is `position: fixed` — which no ancestor's overflow can clip —
 * measured off the trigger's rect and clamped to the viewport, and portalled
 * to <body> so no ancestor can make itself its containing block either (see
 * the note at the portal). RolePopover reached the same conclusion for the
 * same sidebar and carries a near-identical `usePlacement`; worth lifting into
 * a shared hook next to `useDismiss` once both files are still.
 */
function usePlacement(
  triggerRef: RefObject<HTMLElement | null>,
  popRef: RefObject<HTMLElement | null>,
  open: boolean,
): { left: number; top: number } | null {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null)
      return
    }
    const measure = () => {
      const trigger = triggerRef.current
      const el = popRef.current
      if (!trigger || !el) return
      const a = trigger.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      // Above by preference: this control is the last row of its section, so
      // above it is the board the colour is about to join. Below only when
      // above genuinely doesn't fit and below does; the clamp catches the rest.
      const above = a.top - GAP - h
      const below = a.bottom + GAP
      const wanted =
        above >= MARGIN ? above : below + h + MARGIN <= window.innerHeight ? below : above
      const top = Math.max(MARGIN, Math.min(wanted, window.innerHeight - h - MARGIN))
      const left = Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN))
      setPlace((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
    }

    measure()
    window.addEventListener('resize', measure)
    // Capture, so a scroll in the sidebar body (not just the window) re-pins us.
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, triggerRef, popRef])

  return place
}

/**
 * The sidebar's add control: a 32px dashed `+` that opens the picker.
 *
 * It sits at the foot of a section that is already dense with seats, a chart
 * tray and a bench, and it was competing with all of them at full width for a
 * job most sessions do once. Closed it is a swatch-sized invitation; open it
 * is the whole control, and the popover has room to say what it read.
 */
function InlineAddField({ placeholder, has, onAdd, open, onOpenChange }: Props) {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState('#7aa2f7')
  const [selfOpen, setSelfOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()

  // Controlled when `open` is supplied (App binds a keyboard shortcut to it),
  // uncontrolled otherwise. `onOpenChange` fires either way, so a controlled
  // parent hears about clicks and Escape as well as its own shortcut.
  const isOpen = open ?? selfOpen
  const setOpen = (next: boolean) => {
    if (open === undefined) setSelfOpen(next)
    onOpenChange?.(next)
  }

  const place = usePlacement(triggerRef, popRef, isOpen)

  // The app's `useDismiss` watches ONE root, and a portalled popover has two:
  // press inside it and it would read as an outside press and close. The
  // trigger has to be exempt as well, or its own toggle would close and
  // immediately reopen.
  //
  // Escape is here as well as on the anchor below. The anchor's handler is the
  // one that runs when focus is inside — it can swallow the key so App's
  // window-level Escape doesn't also fire. This one is the backstop for focus
  // that has left the popover (tabbed out, or opened by shortcut).
  useEffect(() => {
    if (!isOpen) return
    const close = (e: PointerEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target) || popRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen is rebuilt every render
  }, [isOpen])

  // Opening from a keyboard shortcut has to land focus somewhere useful, and
  // the text field is the only part of the popover a keyboard can drive well.
  // `autoFocus` alone does not do it: the popover spends its first commit
  // unplaced, and it used to hide that frame with `visibility: hidden`, which
  // browsers refuse to focus into. Hence opacity for the hiding (see below)
  // and this, which also re-selects on a shortcut-driven reopen.
  useEffect(() => {
    if (isOpen) inputRef.current?.select()
  }, [isOpen])

  const read = readField(text, picked, has)

  const commit = () => {
    if (!read.canAdd) return
    onAdd(read.payload)
    setText(read.leftover)
    // Close only when the field came out clean. With a typo still in it there
    // is a message worth reading, and closing would take it away.
    if (!read.leftover) setOpen(false)
  }

  // The picker and the field are one value: dragging writes its hex into the
  // field, and typing a single readable colour moves the square. Multiple
  // tokens leave the square alone — there is no one place to put it.
  const onPick = (hex: string) => {
    setPicked(hex)
    setText(hex)
  }
  const onType = (next: string) => {
    setText(next)
    const tokens = tokenizeColors(next)
    const color = tokens.length === 1 ? parseColor(tokens[0]) : null
    if (color) setPicked(toHex(color))
  }

  return (
    <div className="addsw-row">
      <div
        className="pk-anchor"
        ref={anchorRef}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !isOpen) return
          // Swallowed, or App's window-level Escape would also fire and close
          // whatever else it owns on the way past.
          e.stopPropagation()
          setOpen(false)
          triggerRef.current?.focus()
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="addsw"
          // Named by the visible label beside it rather than a duplicate
          // aria-label, so the two can never drift apart.
          aria-labelledby={labelId}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title="add a color — opens a picker"
          onClick={() => setOpen(!isOpen)}
        >
          <Plus size={16} />
        </button>
        {/* Portalled to <body>. `position: fixed` alone was not enough: the
            sidebar sections play a `sec-in` entrance animation, and an
            animated transform — even the identity matrix it settles on —
            makes that wrapper the containing block for fixed descendants, so
            the popover landed a scroll-offset away from where it was measured
            and moved as the animation ran. Out of the tree, out of reach of it.
            (React portals still bubble events to the anchor's handlers, so
            the Escape handling below covers this subtree too.) */}
        {isOpen &&
          createPortal(
            <div
              ref={popRef}
              className="pk-pop"
              role="dialog"
              aria-labelledby={labelId}
              style={{
                left: place?.left ?? 0,
                top: place?.top ?? 0,
                // One frame before measurement it has no home yet — hide it
                // rather than let it flash in the corner. Opacity, not
                // `visibility: hidden`, because the field inside autofocuses
                // on that very frame and a hidden element cannot take focus.
                opacity: place ? undefined : 0,
                pointerEvents: place ? undefined : 'none',
              }}
            >
              <HexColorPicker color={picked} onChange={onPick} />
              <div className="pk-row">
                <label className={read.fieldBad ? 'pk-field bad' : 'pk-field'}>
                  <span
                    className={read.hexes.length > 1 ? 'pk-prev multi' : 'pk-prev'}
                    style={
                      read.hexes.length > 1 ? undefined : { background: read.hexes[0] ?? picked }
                    }
                  >
                    {read.hexes.length > 1 &&
                      read.hexes.map((hex, i) => (
                        <i key={`${hex}-${i}`} style={{ background: hex }} />
                      ))}
                  </span>
                  <input
                    ref={inputRef}
                    value={text}
                    spellCheck={false}
                    placeholder={placeholder}
                    autoFocus
                    aria-label="color value — hex, a css name, rgb() or oklch()"
                    onChange={(e) => onType(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter on unreadable text does nothing at all — the typo
                      // stays put and the message stays up.
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commit()
                      }
                    }}
                  />
                </label>
                <EyeDropperButton onPick={onPick} />
              </div>
              <p className={read.messageBad ? 'pk-msg bad' : 'pk-msg'} role="status">
                {read.message}
              </p>
              <button type="button" className="pk-add" disabled={!read.canAdd} onClick={commit}>
                {read.addLabel}
              </button>
            </div>,
            document.body,
          )}
      </div>
      <span className="addsw-lab" id={labelId}>
        add a color
      </span>
    </div>
  )
}

/**
 * The first-run block: swatch, free-text field and Add, all visible at once.
 * Unchanged — see the note on `layout` for why this one does not collapse.
 */
function HeroAddField({ placeholder, has, onAdd }: Props) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState('#7aa2f7')
  // True once the user has picked a color in the popover but not yet added it,
  // so the main Add button commits it even after the popover has closed.
  const [dirty, setDirty] = useState(false)

  // The picked swatch color joins an Add unless it's already in the list —
  // so removing it and hitting Add again re-adds it, but a committed pick
  // doesn't duplicate on later Adds.
  const commit = () => {
    const tokens = tokenizeColors(text)
    if (dirty && !has(pending)) tokens.push(pending)
    onAdd(tokens)
    setText('')
  }

  // The embedded swatch previews what's being typed; otherwise the last pick.
  const lastTyped = tokenizeColors(text).pop()
  const typedColor = lastTyped ? parseColor(lastTyped) : null
  const previewHex = typedColor ? toHex(typedColor) : pending

  return (
    <>
      <ColorSwatchPicker
        color={previewHex}
        variant="inline"
        title="Pick a color"
        onChange={(hex) => {
          setPending(hex)
          setDirty(true)
        }}
        onAdd={(hex) => onAdd([hex])}
      />
      <div className="hexfield">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={placeholder}
        />
      </div>
      <button onClick={commit}>Add</button>
    </>
  )
}

/**
 * The additive way in. Two arrangements of the same job, and they no longer
 * share an implementation: the hero shows everything at once, the sidebar
 * hides everything behind a `+` until asked. Splitting them beat threading
 * `layout` through a dozen branches of one render.
 */
export function ColorAddField(props: Props) {
  return props.layout === 'hero' ? <HeroAddField {...props} /> : <InlineAddField {...props} />
}
