/**
 * What a role label teaches when you click it.
 *
 * Two tiers, deliberately:
 *   GLOSS      — hand-written, stable, plain English. Read by every new user,
 *                so it says what the role is FOR, never what tokens it sets.
 *   jobsForRole — DERIVED from the same ancestry map the locator uses. It can
 *                never drift from what the engine actually does, and it changes
 *                per mockup: `primary` genuinely does different work in the
 *                Brand board than in the App dashboard, and the tooltip says so
 *                by itself.
 *
 * The board's whole premise is that the labels teach the vocabulary rather than
 * assume it, so this file is load-bearing, not decoration.
 */
import type { Role, ThemeResult } from './engine'
import { JOB_TOKENS } from './engine'

export type Seat = Role | 'chart'

export const GLOSS: Record<Seat, string> = {
  primary:
    'Your brand color — the thing people click, and the loudest voice in the theme.',
  accent:
    'The quiet second voice — how the UI shows you where you are, without shouting.',
  neutral:
    'Surfaces and text. Most of the pixels on screen are this, so it decides how the theme feels.',
  danger: 'Destructive actions and errors — the only color allowed to alarm.',
  success: 'Confirmations and healthy states.',
  warning: "Cautions that aren't failures — expiring, degraded, needs a look.",
  chart: 'Data series — up to five, kept apart from each other and from the page.',
}

/**
 * The jobs a seat currently holds, e.g. ["buttons", "links", "focus ring"].
 *
 * Reads `mode.ancestry` (token → role) rather than `tokenAncestry` (token →
 * candidate index), because a seat's jobs are a property of the ROLE, not of
 * whichever color happens to be sitting in it.
 */
export function jobsForRole(result: ThemeResult, mode: 'light' | 'dark', seat: Seat): string[] {
  const ancestry = result[mode].ancestry
  const holds = (token: string): boolean => {
    const a = ancestry[token]
    if (seat === 'chart') {
      // A chart token the engine had to invent still IS a data series — it just
      // has no candidate behind it. The seat owns those too, so the tooltip
      // reports the series it fills rather than only the ones you supplied.
      // (chart-1 is excluded when accent claimed it: that ancestry is a role.)
      if (a == null) return token.startsWith('chart-')
      return a.kind === 'chart'
    }
    if (a == null) return false
    return a.kind === 'role' && a.role === seat
  }
  return Object.entries(JOB_TOKENS)
    .filter(([, tokens]) => tokens.some(holds))
    .map(([job]) => job)
}
