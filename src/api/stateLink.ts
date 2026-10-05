/**
 * A theme's whole state, packed small enough to ride in a link.
 *
 * `#s=<payload>` opens the exact theme with no server and no saved id, and the
 * API takes the same payload as `state=` wherever it takes `theme=`. The
 * payload is the canonical state (state.ts) in a hand-packed binary form,
 * base64url. It is lossless: unpacking gives back the canonical text byte for
 * byte, so a link's theme has the same `t_` id as the theme that made it.
 *
 * Why binary and not compressed JSON: links are short palettes, and on a short
 * palette deflate has nothing to find (see the measurements in
 * stateLink.test.ts). Hex colours, the common case, cost 3 bytes; everything
 * else survives exactly, just less compactly — a colour typed as `oklch(…)`
 * travels as its text, and a lock's exact OKLCH as three float64s.
 *
 * Layout, version 1 (all integers are unsigned LEB128 varints):
 *
 *   u8      version (1)
 *   u8      settings flags: 1 fidelity · 2 seed · 4 monoBase · 8 separation
 *           · 16 contrast · 32 preset — a clear bit is the canonical default
 *   varint  candidate count, then per candidate:
 *     u8      pin (bits 0–2: 0 none, 1–6 primary…warning, 7 chart) · 8 locked
 *             · 16 lockedColor · 32 benched · 64 colour is text, not hex
 *             · 128 an extension byte follows (1 invented · 2 from an image)
 *     colour  3 bytes (#rrggbb, lowercase), or varint length + UTF-8 text
 *     [24 bytes, lockedColor l c h as float64, when flagged]
 *   then the flagged settings in flag order: fidelity and contrast as a u8
 *   percent (0–100) or 255 + float64; seed and monoBase as varints;
 *   separation as a u8 index; preset as varint (1 + index into PRESET_NAMES)
 *   or 0 + varint length + UTF-8 text.
 *
 * The tables below belong to version 1 and must never be reordered. A
 * different layout is a new version; old versions keep decoding.
 */
import { StateError } from './state'

export const LINK_VERSION = 1

const PINS = ['primary', 'accent', 'neutral', 'danger', 'success', 'warning', 'chart'] as const
const SEPARATIONS_V1 = ['flat', 'layered', 'lifted'] as const
/** The presets as named on 2026-10-05. A name not here travels as text. */
const PRESET_NAMES = [
  'Coastal starter',
  'Ink & sky',
  'Pastel picnic',
  'Neon arcade',
  'Mono + ember',
  'Terracotta',
  'Corporate blue',
]

interface WireCandidate {
  color: string
  pin?: string
  locked?: true
  lockedColor?: [number, number, number]
  benched?: true
  origin?: 'invented'
  source?: 'image'
}
interface WireState {
  v: number
  candidates: WireCandidate[]
  fidelity?: number
  seed?: number
  monoBase?: number
  separation?: string
  contrast?: number
  preset?: string
}

const HEX = /^#[0-9a-f]{6}$/

// ---- bytes ----------------------------------------------------------------

class Writer {
  private bytes: number[] = []
  u8(n: number) {
    this.bytes.push(n & 255)
  }
  varint(n: number) {
    if (!Number.isSafeInteger(n) || n < 0) throw new StateError(`cannot pack ${n} as a count`)
    while (n > 127) {
      this.bytes.push((n % 128) | 128)
      n = Math.floor(n / 128)
    }
    this.bytes.push(n)
  }
  f64(n: number) {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setFloat64(0, n)
    this.bytes.push(...b)
  }
  text(s: string) {
    const b = new TextEncoder().encode(s)
    this.varint(b.length)
    this.bytes.push(...b)
  }
  /** 0–100 as one byte when the number is exactly a whole percent, else exact. */
  unit(n: number) {
    const pct = Math.round(n * 100)
    if (pct >= 0 && pct <= 100 && pct / 100 === n) this.u8(pct)
    else {
      this.u8(255)
      this.f64(n)
    }
  }
  done() {
    return Uint8Array.from(this.bytes)
  }
}

class Reader {
  private at = 0
  private readonly b: Uint8Array
  constructor(b: Uint8Array) {
    this.b = b
  }
  u8(): number {
    if (this.at >= this.b.length) throw new StateError('the link is cut short')
    return this.b[this.at++]
  }
  varint(): number {
    let n = 0
    let scale = 1
    for (let i = 0; i < 8; i++) {
      const byte = this.u8()
      n += (byte & 127) * scale
      if (!(byte & 128)) return n
      scale *= 128
    }
    throw new StateError('the link has an unreadable number')
  }
  f64(): number {
    if (this.at + 8 > this.b.length) throw new StateError('the link is cut short')
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.at, 8).getFloat64(0)
    this.at += 8
    return v
  }
  text(): string {
    const len = this.varint()
    if (this.at + len > this.b.length) throw new StateError('the link is cut short')
    const s = new TextDecoder('utf-8', { fatal: true }).decode(this.b.subarray(this.at, this.at + len))
    this.at += len
    return s
  }
  unit(): number {
    const pct = this.u8()
    if (pct === 255) return this.f64()
    if (pct > 100) throw new StateError('the link has an unreadable setting')
    return pct / 100
  }
  get left() {
    return this.b.length - this.at
  }
}

// ---- canonical text <-> bytes ----------------------------------------------

/** The canonical state text (state.ts `encodeState`) as version-1 bytes. */
export function packState(canonical: string): Uint8Array {
  const s = JSON.parse(canonical) as WireState
  const w = new Writer()
  w.u8(LINK_VERSION)
  const flags =
    (s.fidelity !== undefined ? 1 : 0) |
    (s.seed !== undefined ? 2 : 0) |
    (s.monoBase !== undefined ? 4 : 0) |
    (s.separation !== undefined ? 8 : 0) |
    (s.contrast !== undefined ? 16 : 0) |
    (s.preset !== undefined ? 32 : 0)
  w.u8(flags)
  w.varint(s.candidates.length)
  for (const c of s.candidates) {
    const pin = c.pin === undefined ? 0 : PINS.indexOf(c.pin as (typeof PINS)[number]) + 1
    if (pin === 0 && c.pin !== undefined) throw new StateError(`cannot pack pin ${c.pin}`)
    const hex = HEX.test(c.color)
    const ext = (c.origin === 'invented' ? 1 : 0) | (c.source === 'image' ? 2 : 0)
    w.u8(
      pin |
        (c.locked ? 8 : 0) |
        (c.lockedColor ? 16 : 0) |
        (c.benched ? 32 : 0) |
        (hex ? 0 : 64) |
        (ext ? 128 : 0),
    )
    if (ext) w.u8(ext)
    if (hex) for (let i = 1; i < 7; i += 2) w.u8(parseInt(c.color.slice(i, i + 2), 16))
    else w.text(c.color)
    if (c.lockedColor) for (const n of c.lockedColor) w.f64(n)
  }
  if (s.fidelity !== undefined) w.unit(s.fidelity)
  if (s.seed !== undefined) w.varint(s.seed)
  if (s.monoBase !== undefined) w.varint(s.monoBase)
  if (s.separation !== undefined) {
    const i = SEPARATIONS_V1.indexOf(s.separation as (typeof SEPARATIONS_V1)[number])
    if (i < 0) throw new StateError(`cannot pack separation ${s.separation}`)
    w.u8(i)
  }
  if (s.contrast !== undefined) w.unit(s.contrast)
  if (s.preset !== undefined) {
    const i = PRESET_NAMES.indexOf(s.preset)
    if (i >= 0) w.varint(i + 1)
    else {
      w.varint(0)
      w.text(s.preset)
    }
  }
  return w.done()
}

/** Bytes back to the exact canonical text they were packed from. */
export function unpackState(bytes: Uint8Array): string {
  const r = new Reader(bytes)
  const version = r.u8()
  if (version !== LINK_VERSION) throw new StateError(`this link was made by a newer ChromaConscious (format ${version})`)
  const flags = r.u8()
  const count = r.varint()
  if (count > 256) throw new StateError('the link has too many colours')
  const candidates: WireCandidate[] = []
  for (let i = 0; i < count; i++) {
    const head = r.u8()
    const ext = head & 128 ? r.u8() : 0
    let color: string
    if (head & 64) color = r.text()
    else {
      color = '#'
      for (let j = 0; j < 3; j++) color += r.u8().toString(16).padStart(2, '0')
    }
    const pin = head & 7
    const c: WireCandidate = { color }
    // key order is encodeState's, so the text comes back byte for byte
    if (pin) c.pin = PINS[pin - 1]
    if (head & 8) c.locked = true
    if (head & 16) c.lockedColor = [r.f64(), r.f64(), r.f64()]
    if (head & 32) c.benched = true
    if (ext & 1) c.origin = 'invented'
    if (ext & 2) c.source = 'image'
    candidates.push(c)
  }
  const s: WireState = { v: 1, candidates }
  if (flags & 1) s.fidelity = r.unit()
  if (flags & 2) s.seed = r.varint()
  if (flags & 4) s.monoBase = r.varint()
  if (flags & 8) {
    const sep = SEPARATIONS_V1[r.u8()]
    if (!sep) throw new StateError('the link has an unreadable separation')
    s.separation = sep
  }
  if (flags & 16) s.contrast = r.unit()
  if (flags & 32) {
    const i = r.varint()
    s.preset = i === 0 ? r.text() : PRESET_NAMES[i - 1]
    if (s.preset === undefined) throw new StateError('the link names an unknown preset')
  }
  if (r.left !== 0) throw new StateError('the link has trailing data')
  return JSON.stringify(s)
}

// ---- base64url --------------------------------------------------------------

export function toBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new StateError('the link has characters a state never contains')
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  let bin: string
  try {
    bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  } catch {
    throw new StateError('the link is not a readable state')
  }
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
}

/** The `s=` payload for a canonical state text. */
export const statePayload = (canonical: string): string => toBase64url(packState(canonical))

/** The canonical state text a payload carries. Throws StateError on anything malformed. */
export function payloadState(payload: string): string {
  if (!payload) throw new StateError('the link carries no state')
  return unpackState(fromBase64url(payload))
}
