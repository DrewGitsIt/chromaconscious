// Loaded in the browser through the Vite dev server by vision-filter.spec.ts.
// Playwright rewrites JSX in the files a test imports, so the component has to
// be rendered here, by React itself, to test the markup the app really ships.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VisionFilter } from '../src/components/VisionFilter'
import type { Vision } from '../src/engine/cvd'

export const filterMarkup = (id: string, vision: Vision, strength: number): string =>
  renderToStaticMarkup(createElement(VisionFilter, { id, vision, strength }))
