import { useMemo } from 'react'
import type { ThemeResult, TokenAncestor } from './engine'
import { effectVars, locateTokens } from './engine'
import { Analytics } from './components/Analytics'
import { BrandBoard } from './components/BrandBoard'
import { Marketing } from './components/Marketing'
import { Preview } from './components/Preview'
import type { PageSettings } from './pageSettings'
import { DEFAULT_PAGE, pageVars } from './pageSettings'

export interface MockupProps {
  result: ThemeResult
  mode: 'light' | 'dark'
  /** Stable per-frame suffix so element ids stay unique across split panes. */
  uid: string
  /**
   * Locate mode: the seat whose descendants stay lit while everything else
   * renders muted (token substitution). Null = normal render. Keyed by
   * ancestor rather than candidate so DERIVED seats locate too — they have no
   * candidate, but they still own tokens.
   */
  locateTarget?: TokenAncestor | null
  /** Corners and type for the preview (pageSettings.ts). Global view state, never theme state. */
  page?: PageSettings
}

export interface Mockup {
  id: string
  name: string
  /** Print-like spaces have no dark mode; the frame's toggle disables. */
  supportsDark: boolean
  /** Whether the page settings (corners, type) reach this space. */
  followsPage: boolean
  Component: (props: MockupProps) => React.ReactNode
}

/**
 * What a mockup that renders the *app* token space receives: resolved tokens
 * (already substituted if locate mode is on), the mode, and the frame's uid.
 *
 * Every element id inside such a mockup must carry `uid` — split view mounts
 * two of these at once, and duplicate ids break label/control association in
 * whichever pane React rendered second.
 */
export interface TokenSpaceProps {
  tokens: Record<string, string>
  mode: 'light' | 'dark'
  uid: string
  /**
   * Ready-to-use CSS values for the non-colour effects: `--elevation-1/2/3`
   * (whole `box-shadow` values, `none` under `flat`) and `--scrim`.
   *
   * Spread these into the same `style` as the tokens and reach them with
   * `shadow-[var(--elevation-2)]`. They are NOT tokens — they carry alpha and
   * multiple layers — and locate mode deliberately leaves them lit, because a
   * shadow is not one of the palette's colours.
   *
   * The page settings ride here too (`pageVars`): `--radius`, the faces and
   * the heading weight. Empty at the defaults. They have to be in this same
   * object, because it is the one thing every portalled menu and dialog is
   * handed, and a portal never sees the frame's own styles.
   */
  effects: Record<string, string>
}

/**
 * Lift a token-space component into a Mockup: resolve the mode's tokens,
 * substituting them for locate mode when it's on. Kept in one place so a new
 * mockup can't accidentally opt out of locate mode — it comes free.
 *
 * Only spaces speaking shadcn token names go through here. BrandBoard has its
 * own vocabulary (paper/ink) and runs its own substitution via brandAncestry.
 */
function tokenSpace(Component: (props: TokenSpaceProps) => React.ReactNode) {
  return function TokenSpaceMockup({ result, mode, uid, locateTarget = null, page = DEFAULT_PAGE }: MockupProps) {
    const tokens = useMemo(() => {
      const base = result[mode].tokens
      // `ancestry` is already keyed by role/chart-slot — no candidate lookup.
      return locateTarget == null
        ? base
        : locateTokens(base, result[mode].ancestry, locateTarget, base.background)
    }, [result, mode, locateTarget])
    // Serialized by the engine, not here, so the preview shows exactly the
    // string the CSS export contains.
    const effects = useMemo(
      () => ({ ...effectVars(result[mode].effects), ...pageVars(page) }),
      [result, mode, page],
    )
    return <Component tokens={tokens} mode={mode} uid={uid} effects={effects} />
  }
}

/** The design spaces a frame can render its theme into. */
export const MOCKUPS: Mockup[] = [
  {
    id: 'app',
    name: 'App dashboard',
    supportsDark: true,
    followsPage: true,
    Component: tokenSpace(Preview),
  },
  {
    id: 'analytics',
    name: 'Analytics console',
    supportsDark: true,
    followsPage: true,
    Component: tokenSpace(Analytics),
  },
  {
    id: 'marketing',
    name: 'Marketing page',
    supportsDark: true,
    followsPage: true,
    Component: tokenSpace(Marketing),
  },
  {
    id: 'brand',
    name: 'Brand board',
    supportsDark: true,
    // Print, in its own paper/ink vocabulary: its Georgia display lines and
    // its corners are the board's design, not a UI's, so neither follows.
    followsPage: false,
    Component: BrandBoard,
  },
]

export const mockupById = (id: string): Mockup => MOCKUPS.find((m) => m.id === id) ?? MOCKUPS[0]
