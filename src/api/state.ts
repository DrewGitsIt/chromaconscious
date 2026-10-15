/**
 * A theme as a stored, addressable snapshot.
 *
 * The wire form is the engine state with colours as the strings people typed.
 * It is canonical — fixed key order, defaults dropped — so the same theme
 * always serializes to the same bytes, and its id is a hash of those bytes:
 * storing a theme twice is harmless, and two callers who reach the same state
 * share one id.
 *
 * Nothing is rounded. A lock names an exact colour, and taste 0.8 must stay
 * 0.8, so floats travel as JSON numbers (which round-trip exactly).
 */
import type { ColorCandidate, Role, Separation } from '../engine'
import { SEPARATIONS, normalizeContrast, parseColor } from '../engine'
import type { ThemeState } from '../ops'
import { emptyThemeState } from '../ops'
import { FONT_DEFAULT, RADIUS_DEFAULT, clampRadius, isPageFontId } from '../pageSettings'

export const STATE_VERSION = 1

interface WireCandidate {
  color: string
  pin?: Role | 'chart'
  locked?: true
  /** [l, c, h] — exact, where an `oklch()` or hex string would round. */
  lockedColor?: [number, number, number]
  benched?: true
  origin?: 'invented'
  source?: 'image'
  /** This colour's own taste ("derive safely"). Absent unless set, so old ids hold. */
  fidelity?: number
}

interface WireState {
  v: number
  candidates: WireCandidate[]
  fidelity?: number
  seed?: number
  monoBase?: number
  separation?: Separation
  /** Contrast level 0..1. Absent = 0 (standard), so pre-contrast ids still resolve. */
  contrast?: number
  preset?: string
  /** Corners in px. Absent = 10 (shadcn's default), so ids made before it was exported hold. */
  radius?: number
  /** A face id (pageSettings.ts). Absent = the system stack. */
  font?: string
}

export class StateError extends Error {}

/** The canonical JSON text of a state. */
export function encodeState(s: ThemeState): string {
  const wire: WireState = {
    v: STATE_VERSION,
    candidates: s.candidates.map((c) => ({
      color: c.raw,
      ...(c.pin ? { pin: c.pin } : {}),
      ...(c.locked ? { locked: true as const } : {}),
      ...(c.locked && c.lockedColor
        ? { lockedColor: [c.lockedColor.l, c.lockedColor.c, c.lockedColor.h] as [number, number, number] }
        : {}),
      ...(c.benched ? { benched: true as const } : {}),
      ...(c.origin ? { origin: c.origin } : {}),
      ...(c.source === 'image' ? { source: 'image' as const } : {}),
      ...(typeof c.fidelity === 'number' ? { fidelity: c.fidelity } : {}),
    })),
    ...(s.fidelity !== 0.5 ? { fidelity: s.fidelity } : {}),
    ...(s.seed ? { seed: s.seed } : {}),
    ...(s.monoBase != null ? { monoBase: s.monoBase } : {}),
    ...(s.separation !== 'layered' ? { separation: s.separation } : {}),
    // Omitted at standard: the id is a hash of these bytes, and every theme
    // stored before the level existed must keep the id it was given.
    ...(s.contrast ? { contrast: s.contrast } : {}),
    ...(s.preset ? { preset: s.preset } : {}),
    // After everything that existed before them, and only away from their
    // defaults: older states keep their bytes, so their ids.
    ...(s.radius !== RADIUS_DEFAULT ? { radius: s.radius } : {}),
    ...(s.font !== FONT_DEFAULT ? { font: s.font } : {}),
  }
  return JSON.stringify(wire)
}

export function decodeState(text: string): ThemeState {
  let wire: WireState
  try {
    wire = JSON.parse(text)
  } catch {
    throw new StateError('state is not JSON')
  }
  if (wire?.v !== STATE_VERSION || !Array.isArray(wire.candidates)) throw new StateError('unknown state version')
  const candidates: ColorCandidate[] = wire.candidates.map((w, i) => {
    const color = typeof w.color === 'string' ? parseColor(w.color) : null
    if (!color) throw new StateError(`candidate ${i} has no readable colour`)
    return {
      color,
      raw: w.color,
      source: w.source === 'image' ? 'image' : 'manual',
      ...(w.pin ? { pin: w.pin } : {}),
      ...(w.locked ? { locked: true } : {}),
      ...(w.locked && w.lockedColor
        ? { lockedColor: { l: w.lockedColor[0], c: w.lockedColor[1], h: w.lockedColor[2] } }
        : {}),
      ...(w.benched ? { benched: true } : {}),
      ...(w.origin === 'invented' ? { origin: 'invented' as const } : {}),
      ...(typeof w.fidelity === 'number' && Number.isFinite(w.fidelity)
        ? { fidelity: Math.min(1, Math.max(0, w.fidelity)) }
        : {}),
    }
  })
  const base = emptyThemeState()
  const monoBase = wire.monoBase ?? null
  return {
    candidates,
    fidelity: typeof wire.fidelity === 'number' ? wire.fidelity : base.fidelity,
    seed: Number.isInteger(wire.seed) && wire.seed! >= 0 ? wire.seed! : 0,
    monoBase: monoBase != null && monoBase >= 0 && monoBase < candidates.length ? monoBase : null,
    separation: SEPARATIONS.includes(wire.separation!) ? wire.separation! : base.separation,
    contrast: typeof wire.contrast === 'number' ? normalizeContrast(wire.contrast) : base.contrast,
    preset: typeof wire.preset === 'string' ? wire.preset : null,
    // A face this build doesn't know falls back to the default, like an
    // unknown vision: the theme still opens.
    radius: typeof wire.radius === 'number' && Number.isFinite(wire.radius) ? clampRadius(wire.radius) : base.radius,
    font: typeof wire.font === 'string' && isPageFontId(wire.font) ? wire.font : base.font,
  }
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** `t_` + 12 base32 characters (60 bits) of the canonical text's SHA-256. */
export async function themeId(canonical: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of digest) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5 && out.length < 12) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    if (out.length === 12) break
  }
  return `t_${out}`
}

export const isThemeId = (s: string) => /^t_[a-z2-7]{12}$/.test(s)
