export interface Preset {
  name: string
  colors: string[]
}

/**
 * Curated starting points. These are *input palettes* — they populate the
 * candidate strip and run through the engine like any user input, so each one
 * doubles as a demo of a different palette shape (minimal, pastel, neon,
 * monochrome, …).
 */
export const PRESETS: Preset[] = [
  { name: 'Coastal starter', colors: ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557'] },
  { name: 'Ink & sky', colors: ['#0f172a', '#38bdf8'] },
  { name: 'Pastel picnic', colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff'] },
  { name: 'Neon arcade', colors: ['#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0'] },
  { name: 'Mono + ember', colors: ['#1a1a1a', '#4d4d4d', '#9a9a9a', '#e8e8e8', '#ff5c1f'] },
  { name: 'Terracotta', colors: ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'] },
  { name: 'Corporate blue', colors: ['#0a2540', '#1f6feb', '#66a3ff', '#f5f7fa', '#d0d7de'] },
]
