declare module 'apca-w3' {
  /** Returns Lc value (signed: + dark-on-light, − light-on-dark), or 0 near threshold. */
  export function APCAcontrast(txtY: number, bgY: number): number | string
  /** Linearize an sRGB color [r,g,b] 0-255 to luminance Y for APCA. */
  export function sRGBtoY(rgb: [number, number, number]): number
}
