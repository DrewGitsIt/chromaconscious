import type { ThemeResult } from './engine'
import { BrandBoard } from './components/BrandBoard'
import { Preview } from './components/Preview'

export interface MockupProps {
  result: ThemeResult
  mode: 'light' | 'dark'
  /** Stable per-frame suffix so element ids stay unique across split panes. */
  uid: string
}

export interface Mockup {
  id: string
  name: string
  /** Print-like spaces have no dark mode; the frame's toggle disables. */
  supportsDark: boolean
  Component: (props: MockupProps) => React.ReactNode
}

/** The design spaces a frame can render its theme into. */
export const MOCKUPS: Mockup[] = [
  {
    id: 'app',
    name: 'App dashboard',
    supportsDark: true,
    Component: ({ result, mode, uid }) => (
      <Preview tokens={result[mode].tokens} mode={mode} uid={uid} />
    ),
  },
  {
    id: 'brand',
    name: 'Brand board',
    supportsDark: true,
    Component: BrandBoard,
  },
]

export const mockupById = (id: string): Mockup => MOCKUPS.find((m) => m.id === id) ?? MOCKUPS[0]
