import { useMemo } from 'react'
import type { ThemeResult } from './engine'
import { locateTokens, tokenAncestry } from './engine'
import { BrandBoard } from './components/BrandBoard'
import { Preview } from './components/Preview'

export interface MockupProps {
  result: ThemeResult
  mode: 'light' | 'dark'
  /** Stable per-frame suffix so element ids stay unique across split panes. */
  uid: string
  /**
   * Locate mode: candidate whose descendants stay lit while everything else
   * renders muted (token substitution). Null = normal render.
   */
  locateIndex?: number | null
}

export interface Mockup {
  id: string
  name: string
  /** Print-like spaces have no dark mode; the frame's toggle disables. */
  supportsDark: boolean
  Component: (props: MockupProps) => React.ReactNode
}

/** The app mockup's tokens, substituted for locate mode when it's on. */
function AppMockup({ result, mode, uid, locateIndex = null }: MockupProps) {
  const tokens = useMemo(() => {
    const base = result[mode].tokens
    return locateIndex == null
      ? base
      : locateTokens(base, tokenAncestry(result, mode), locateIndex, base.background)
  }, [result, mode, locateIndex])
  return <Preview tokens={tokens} mode={mode} uid={uid} />
}

/** The design spaces a frame can render its theme into. */
export const MOCKUPS: Mockup[] = [
  {
    id: 'app',
    name: 'App dashboard',
    supportsDark: true,
    Component: AppMockup,
  },
  {
    id: 'brand',
    name: 'Brand board',
    supportsDark: true,
    Component: BrandBoard,
  },
]

export const mockupById = (id: string): Mockup => MOCKUPS.find((m) => m.id === id) ?? MOCKUPS[0]
