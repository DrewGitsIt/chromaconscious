import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { ImageUp, X } from 'lucide-react'
import { parseColor, toHex } from '../engine'
import type { Preset } from '../presets'
import { PRESETS } from '../presets'
import { tokenizeColors } from './colorTokens'
import { EyeDropperButton } from './ColorSwatchPicker'
import { useDismiss } from './useDismiss'
import './StartStage.css'

/** The swatch's colour before you touch it. */
export const START_DRAFT = '#5b7cfa'
/** More than this and the row stops being a palette and starts being a list. */
const MAX_PICKS = 8

interface Props {
  /** What the specimen behind the sheet should paint, as you go. */
  onPreview: (colors: string[]) => void
  /** Paint: start a theme from these colours. `from` is where they fly from. */
  onPaint: (colors: string[], from: HTMLElement | null) => void
  onPreset: (preset: Preset, from: HTMLElement | null) => void
  /** Open the file picker. A drop anywhere in the window also works. */
  onImage: () => void
}

const hexOf = (token: string): string | null => {
  const c = parseColor(token)
  return c ? toHex(c) : null
}

/**
 * The way in, on the stage, over a live specimen of what you will get.
 *
 * Three equal panels on one surface: a colour (or several), an image, a
 * preset. The specimen behind is real engine output and repaints as you go:
 * your colours, plus whatever readable colour is typed, plus a preset while
 * you hover it. Nothing is committed until Paint, a preset click, or an image.
 *
 * "A color" takes n colours. Each one you choose (Enter in the field, or the
 * picker closing on a new colour) folds into a row of coins under the label;
 * a coin's × removes it, and Backspace in the empty field takes the last.
 * Paint paints them; with none chosen it paints the swatch, as one colour
 * always did. The first coin leads: it is the one the engine reads first.
 */
export function StartStage({ onPreview, onPaint, onPreset, onImage }: Props): ReactElement {
  const [picks, setPicks] = useState<string[]>([])
  const [draft, setDraft] = useState(START_DRAFT)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [hover, setHover] = useState<string[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [entering, setEntering] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const coinsRef = useRef<HTMLDivElement>(null)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  // the colour the picker opened on: closing on anything else is a choice
  const openedOn = useRef(draft)

  // what the field holds, if every token in it reads as a colour
  const typed = (() => {
    const tokens = tokenizeColors(text)
    if (tokens.length === 0) return []
    const hexes = tokens.map(hexOf)
    return hexes.every((h): h is string => h != null) ? hexes : []
  })()

  // the specimen: a hovered preset wins; then your colours plus what's typed;
  // then the swatch alone
  const shown = hover ?? (() => {
    const all = [...picks, ...typed.filter((h) => !picks.includes(h))]
    return all.length ? all : [draft]
  })()
  const shownKey = shown.join(' ')
  useEffect(() => {
    onPreview(shownKey.split(' '))
  }, [shownKey, onPreview])

  const add = (hexes: string[]) => {
    const next = [...picks]
    for (const h of hexes) if (!next.includes(h) && next.length < MAX_PICKS) next.push(h)
    if (next.length === picks.length) return
    setEntering(next[next.length - 1])
    setPicks(next)
  }
  const remove = (hex: string) => setPicks((p) => p.filter((h) => h !== hex))

  /** Fold the field into coins. null: something in it didn't read; say so. */
  const commitTyped = (): boolean | null => {
    const tokens = tokenizeColors(text)
    if (tokens.length === 0) return false
    const bad = tokens.find((t) => hexOf(t) == null)
    if (bad) {
      setProblem(`can't read “${bad}” — try a hex like #e63946`)
      return null
    }
    add(tokens.map((t) => hexOf(t)!))
    setText('')
    return true
  }

  const closePicker = () => {
    setPickerOpen(false)
    if (draft !== openedOn.current) add([draft])
  }
  useDismiss(pickerRef, pickerOpen, closePicker)

  const paint = () => {
    if (commitTyped() === null) return
    const fromField = tokenizeColors(text).map(hexOf).filter((h): h is string => h != null)
    const colors = [...picks, ...fromField.filter((h) => !picks.includes(h))]
    onPaint(colors.length ? colors : [draft], coinsRef.current?.querySelector('.ss-coin') ?? swatchRef.current)
  }

  return (
    <div className="start-stage">
      <div className="ss-sheet" role="group" aria-labelledby="ss-title">
        <div className="ss-head">
          <p className="ss-wordmark">ChromaConscious</p>
          <h2 className="ss-title" id="ss-title">
            Start with a color.
          </h2>
        </div>
        <div className="ss-panels">
          {/* ---- a colour, or several ---- */}
          <section className="ss-panel ss-color" aria-labelledby="ss-color-h">
            <h3 className="ss-panel-h" id="ss-color-h">
              A color <span>one is enough · add more</span>
            </h3>
            <div className={`ss-coins${picks.length ? ' has' : ''}`}>
              <div ref={coinsRef} className="ss-coins-in" aria-label="your colors" role="list">
                {picks.map((h, i) => (
                  <span
                    key={h}
                    role="listitem"
                    className={`ss-coin${h === entering ? ' in' : ''}${i === 0 ? ' lead' : ''}`}
                    style={{ background: h }}
                    title={i === 0 ? `${h} · read first` : h}
                  >
                    <button type="button" className="ss-coin-x" aria-label={`remove ${h}`} onClick={() => remove(h)}>
                      <X size={9} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div
              className="ss-swatch-anchor"
              ref={pickerRef}
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || !pickerOpen) return
                // swallowed, so the app's window-level Escape doesn't also fire
                e.stopPropagation()
                closePicker()
                swatchRef.current?.focus()
              }}
            >
              <button
                ref={swatchRef}
                type="button"
                className="ss-swatch"
                style={{ background: draft, color: readableOn(draft) }}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                title="pick a color; it joins your colors when the picker closes"
                onClick={() => {
                  if (pickerOpen) return closePicker()
                  openedOn.current = draft
                  setPickerOpen(true)
                }}
              >
                <span className="ss-swatch-hex">{draft}</span>
              </button>
              {pickerOpen && (
                <div className="picker-pop ss-pop" role="dialog" aria-label="pick a color">
                  <HexColorPicker color={draft} onChange={setDraft} />
                  <div className="picker-pop-row">
                    <HexColorInput color={draft} onChange={setDraft} prefixed />
                    <EyeDropperButton onPick={setDraft} />
                  </div>
                </div>
              )}
            </div>
            <form
              className="ss-field"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault()
                paint()
              }}
            >
              <input
                ref={fieldRef}
                className="ss-hex"
                value={text}
                spellCheck={false}
                placeholder="#e63946 · enter adds"
                aria-label="type a color; enter adds it to your colors"
                onChange={(e) => {
                  setText(e.target.value)
                  setProblem(null)
                  const tokens = tokenizeColors(e.target.value)
                  const one = tokens.length === 1 ? hexOf(tokens[0]) : null
                  if (one) setDraft(one)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (commitTyped() === false) add([draft])
                  } else if (e.key === 'Backspace' && text === '' && picks.length) {
                    remove(picks[picks.length - 1])
                  }
                }}
              />
              <button type="submit" className="ss-paint">
                Paint
              </button>
            </form>
            <p className="ss-problem" role="status">
              {problem}
            </p>
          </section>

          {/* ---- an image ---- */}
          <section className="ss-panel" aria-labelledby="ss-image-h">
            <h3 className="ss-panel-h" id="ss-image-h">
              An image
            </h3>
            <button type="button" className="ss-drop" onClick={onImage}>
              <ImageUp size={24} strokeWidth={1.5} aria-hidden="true" />
              <span>Drop an image here</span>
              <small>or click to browse · or drop one anywhere</small>
              <small>png · jpg · webp · avif · gif · bmp · svg · heic</small>
            </button>
          </section>

          {/* ---- a preset ---- */}
          <section className="ss-panel" aria-labelledby="ss-preset-h">
            <h3 className="ss-panel-h" id="ss-preset-h">
              A preset
            </h3>
            <div className="ss-presets" onMouseLeave={() => setHover(null)}>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="ss-preset"
                  onMouseEnter={() => setHover(p.colors)}
                  onFocus={() => setHover(p.colors)}
                  onBlur={() => setHover(null)}
                  onClick={(e) => onPreset(p, e.currentTarget.querySelector('.ss-mini'))}
                >
                  <span className="ss-minis" aria-hidden="true">
                    {p.colors.slice(0, 5).map((c, i) => (
                      <i key={i} className="ss-mini" style={{ background: c }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Ink for the swatch's hex label: dark on light colours, light on dark. */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const y = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return y > 0.36 ? '#0b0b0c' : '#ffffff'
}
