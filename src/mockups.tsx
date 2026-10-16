import { useMemo } from 'react'
import type { ThemeResult, TokenAncestor } from './engine'
import { effectVars, locateTokens } from './engine'
import { Analytics } from './components/Analytics'
import { BrandBoard } from './components/BrandBoard'
import { Magazine } from './components/Magazine'
import { Marketing } from './components/Marketing'
import { Posters } from './components/Posters'
import { Preview } from './components/Preview'
import { Shop } from './components/Shop'
import { Trail } from './components/Trail'
import type { Budget } from './budget'
import { spendBudget } from './budget'
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
  /** The frame's corners and font (pageSettings.ts). Theme state; the mockup only draws them. */
  page?: PageSettings
  /** The frame's colour budget (budget.ts). View state; only showcase spaces offer it. */
  budget?: Budget
}

export interface Mockup {
  id: string
  name: string
  /** Print-like spaces have no dark mode; the frame's toggle disables. */
  supportsDark: boolean
  /** Whether the page settings (corners, type) reach this space. */
  followsPage: boolean
  /** Whether the frame offers a colour budget: the showcase compositions do. */
  budgets: boolean
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
  /**
   * The frame's colour budget. `tokens` are already substituted for it; a
   * mockup reads this only where it chooses colours by name for itself
   * (photograph stops, generated art, a shop's finishes), so it can choose
   * among the ones the budget spends. Absent means full.
   */
  budget?: Budget
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
  return function TokenSpaceMockup({
    result,
    mode,
    uid,
    locateTarget = null,
    page = DEFAULT_PAGE,
    budget = 'full',
  }: MockupProps) {
    const tokens = useMemo(() => {
      const base = result[mode].tokens
      // `ancestry` is already keyed by role/chart-slot — no candidate lookup.
      const located =
        locateTarget == null ? base : locateTokens(base, result[mode].ancestry, locateTarget, base.background)
      // The budget last: a colour it doesn't spend stays unspent while located.
      return spendBudget(located, budget)
    }, [result, mode, locateTarget, budget])
    // Serialized by the engine, not here, so the preview shows exactly the
    // string the CSS export contains.
    const effects = useMemo(
      () => ({ ...effectVars(result[mode].effects), ...pageVars(page) }),
      [result, mode, page],
    )
    return <Component tokens={tokens} mode={mode} uid={uid} effects={effects} budget={budget} />
  }
}

/** The design spaces a frame can render its theme into. */
export const MOCKUPS: Mockup[] = [
  {
    id: 'app',
    name: 'App dashboard',
    supportsDark: true,
    followsPage: true,
    budgets: false,
    Component: tokenSpace(Preview),
  },
  {
    id: 'analytics',
    name: 'Analytics console',
    supportsDark: true,
    followsPage: true,
    budgets: false,
    Component: tokenSpace(Analytics),
  },
  {
    id: 'marketing',
    name: 'Marketing page',
    supportsDark: true,
    followsPage: true,
    budgets: false,
    Component: tokenSpace(Marketing),
  },
  {
    id: 'brand',
    name: 'Brand board',
    supportsDark: true,
    // Print, in its own paper/ink vocabulary: its Georgia display lines and
    // its corners are the board's design, not a UI's, so neither follows.
    followsPage: false,
    budgets: false,
    Component: BrandBoard,
  },
  {
    id: 'magazine',
    name: 'Magazine',
    // Print, but in the shadcn token vocabulary, so it rides the token space
    // and locate mode like the app mockups; its photographs are mapped
    // through tokens, so they follow the mode too.
    supportsDark: true,
    followsPage: true,
    budgets: true,
    Component: tokenSpace(Magazine),
  },
  {
    id: 'trail',
    name: 'Hiking app',
    supportsDark: true,
    followsPage: true,
    budgets: true,
    Component: tokenSpace(Trail),
  },
  {
    id: 'shop',
    name: 'Product page',
    supportsDark: true,
    followsPage: true,
    budgets: true,
    Component: tokenSpace(Shop),
  },
  {
    id: 'posters',
    name: 'Concert posters',
    // Print, like the magazine: no controls, and the art is drawn in tokens.
    supportsDark: true,
    followsPage: true,
    budgets: true,
    Component: tokenSpace(Posters),
  },
]

export const mockupById = (id: string): Mockup => MOCKUPS.find((m) => m.id === id) ?? MOCKUPS[0]
