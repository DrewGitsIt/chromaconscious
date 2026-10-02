/**
 * Colorblind simulation: what a color looks like to someone with one of the
 * three dichromacies, at full strength or blended toward typical vision for
 * the partial (anomalous) forms.
 *
 * View-only. Nothing in the engine calls this; the frame's vision filter is
 * generated from these constants (VisionFilter.tsx), and the JS functions are
 * the reference that filter is tested against.
 *
 * Constants are DaltonLens-Python 0.1.5's (public domain, daltonlens.org),
 * derived from its sRGB + Smith & Pokorny LMS model with white as the neutral
 * axis, to six places. They match DaltonLens's own SVG-filter article. The C
 * libDaltonLens carries an older precompute (protan 0.11238, not 0.10889);
 * don't mix the two.
 * - protan, deutan: Viénot 1999, one 3×3 matrix in linear RGB.
 * - tritan: Brettel 1997, two matrices and a plane that picks between them.
 *   Viénot is not valid for tritanopia.
 * Strength blends the result with the original in linear RGB, which is linear,
 * so it folds into the matrices.
 */

export type Vision = 'typical' | 'protan' | 'deutan' | 'tritan'

export const VISIONS: readonly Vision[] = ['typical', 'protan', 'deutan', 'tritan']

export const isVision = (s: string): s is Vision => (VISIONS as readonly string[]).includes(s)

/** Row-major 3×3, linear RGB in → linear RGB out. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

const VIENOT_PROTAN: Mat3 = [0.108889, 0.891111, 0, 0.108889, 0.891111, 0, 0.004471, -0.004471, 1]
const VIENOT_DEUTAN: Mat3 = [0.290305, 0.709695, 0, 0.290305, 0.709695, 0, -0.021974, 0.021974, 1]

const BRETTEL_TRITAN = {
  /** Used where `normal · rgb >= 0`. */
  plane1: [
    1.013542, 0.142682, -0.156224, -0.011805, 0.875612, 0.136194, 0.077073, 0.812081, 0.110847,
  ] as Mat3,
  plane2: [
    0.93337, 0.19999, -0.13336, 0.058087, 0.825652, 0.116261, -0.379228, 1.13825, 0.240978,
  ] as Mat3,
  normal: [0.039601, -0.028307, -0.011294] as const,
}

/**
 * The simulation for one vision at one strength, as matrices: one for protan
 * and deutan, two plus the separating plane's normal for tritan. Typical
 * vision is the identity.
 */
export type VisionTransform =
  | { kind: 'single'; m: Mat3 }
  | { kind: 'split'; m1: Mat3; m2: Mat3; normal: readonly [number, number, number] }

const blend = (m: Mat3, s: number): Mat3 => m.map((v, i) => s * v + (1 - s) * IDENTITY[i]) as unknown as Mat3

export function visionTransform(vision: Vision, strength = 1): VisionTransform {
  const s = Math.min(1, Math.max(0, strength))
  switch (vision) {
    case 'typical':
      return { kind: 'single', m: IDENTITY }
    case 'protan':
      return { kind: 'single', m: blend(VIENOT_PROTAN, s) }
    case 'deutan':
      return { kind: 'single', m: blend(VIENOT_DEUTAN, s) }
    case 'tritan':
      return {
        kind: 'split',
        m1: blend(BRETTEL_TRITAN.plane1, s),
        m2: blend(BRETTEL_TRITAN.plane2, s),
        normal: BRETTEL_TRITAN.normal,
      }
  }
}

const apply = (m: Mat3, [r, g, b]: readonly [number, number, number]): [number, number, number] => [
  m[0] * r + m[1] * g + m[2] * b,
  m[3] * r + m[4] * g + m[5] * b,
  m[6] * r + m[7] * g + m[8] * b,
]

/** Simulate one linear-RGB color (0..1 channels). The result is not clamped. */
export function simulateLinear(
  rgb: readonly [number, number, number],
  vision: Vision,
  strength = 1,
): [number, number, number] {
  const t = visionTransform(vision, strength)
  if (t.kind === 'single') return apply(t.m, rgb)
  const [nr, ng, nb] = t.normal
  return apply(nr * rgb[0] + ng * rgb[1] + nb * rgb[2] >= 0 ? t.m1 : t.m2, rgb)
}

export const srgbToLinear = (v: number): number =>
  v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)

export const linearToSrgb = (v: number): number =>
  v <= 0 ? 0 : v >= 1 ? 1 : v < 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055

/** `#rrggbb` → its simulation as `#rrggbb`, clamped to sRGB. */
export function simulateHex(hex: string, vision: Vision, strength = 1): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => srgbToLinear(c / 255)) as [
    number,
    number,
    number,
  ]
  return (
    '#' +
    simulateLinear(lin, vision, strength)
      .map((v) => Math.round(linearToSrgb(v) * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}
