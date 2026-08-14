import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  Filter,
  Info,
  Lock,
  PenLine,
  RefreshCw,
  Table2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TokenSpaceProps } from '../mockups'

/* ────────────────────────────────────────────────────────────────────────────
   The Analytics console — the only mockup that puts chart-1…chart-5 next to
   each other, at mark size, in every encoding a real dashboard uses. If the
   engine invented two chart colors that collide, this is where it shows.

   Rules this file lives by:
   · Marks wear the chart tokens. Text, axes and gridlines never do — labels
     are `muted-foreground`, rules are `border`. A light categorical hue is
     illegible as body text, and a chart token spent on chrome is a chart
     token the reader can no longer trust as identity.
   · The heatmap is a *quantity*, not an identity, so it ramps one hue
     (color-mix from chart-1 toward the card) instead of cycling the five.
   · The brand lives on chrome and actions, never on a mark: the header's
     primary action, the range control's active option, and the drill-down's
     confirming button are `primary`; `link` carries the running text that
     restores a saved view or explains attribution; `accent` is the wash a
     hovered row wears. If the brand fill and chart-1 turn out to be the same
     hue, that collision is a finding — it is not something this file hides.
   · Data is seeded, never random: split view mounts two of these and a
     difference in the data would read as a difference in the theme.
   · Depth is meaning, not decoration. Level 1 rests (metric tiles, panels,
     the legend bar); level 2 is summoned and dismissed (the segment select,
     the chart read-outs); level 3 takes the console over (the drill-down,
     with `--scrim` behind it because it genuinely blocks interaction).
     Every one of them keeps the border it already had: under
     `separation: 'flat'` level 1 is an empty shadow, and a surface that
     leaned on its shadow would come apart there.
     The `shadow:` type hint in `shadow-[shadow:var(--elevation-N)]` is
     load-bearing: without it tailwind-merge reads the bare `var()` as a
     shadow *colour*, leaves a primitive's own `shadow-md` standing, and the
     hardcoded shadow wins on source order.
   ──────────────────────────────────────────────────────────────────────── */

interface Series {
  id: string
  label: string
  /** Fixed slot — colour follows the entity, never its current rank. */
  token: string
  /** Sub-sources shown in the drill-down, as fractions of the series total. */
  parts: Array<[string, number]>
}

const SERIES: Series[] = [
  {
    id: 'organic',
    label: 'Organic search',
    token: 'chart-1',
    parts: [
      ['google.com', 0.61],
      ['bing.com', 0.18],
      ['duckduckgo.com', 0.12],
      ['other engines', 0.09],
    ],
  },
  {
    id: 'referral',
    label: 'Referral',
    token: 'chart-2',
    parts: [
      ['news.ycombinator.com', 0.34],
      ['partner portal', 0.29],
      ['changelog embeds', 0.22],
      ['other sites', 0.15],
    ],
  },
  {
    id: 'paid',
    label: 'Paid social',
    token: 'chart-3',
    parts: [
      ['retargeting', 0.42],
      ['lookalike', 0.31],
      ['brand terms', 0.16],
      ['experiments', 0.11],
    ],
  },
  {
    id: 'email',
    label: 'Lifecycle email',
    token: 'chart-4',
    parts: [
      ['weekly digest', 0.47],
      ['onboarding drip', 0.26],
      ['win-back', 0.18],
      ['transactional', 0.09],
    ],
  },
  {
    id: 'direct',
    label: 'Direct',
    token: 'chart-5',
    parts: [
      ['typed / bookmarked', 0.55],
      ['native app', 0.24],
      ['dark social', 0.13],
      ['unattributed', 0.08],
    ],
  },
]

interface Segment {
  id: string
  label: string
  seed: number
  /** Days of history this segment actually has — drives the empty state. */
  history: number
}

const SEGMENTS: Segment[] = [
  { id: 'all', label: 'All traffic', seed: 3, history: 400 },
  { id: 'web', label: 'Web', seed: 11, history: 400 },
  { id: 'mobile', label: 'Mobile app', seed: 23, history: 400 },
  { id: 'kiosk', label: 'Kiosk (beta)', seed: 41, history: 12 },
]

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Six four-hour buckets — chunky cells read the ramp better than 24 slivers. */
const HOUR_BUCKETS = ['00', '04', '08', '12', '16', '20']

/** Fixed anchor: `new Date()` at render would make the two split panes drift. */
const ANCHOR = Date.UTC(2026, 4, 31)
const DAY_MS = 86_400_000

/* ───────────────────────────── deterministic data ───────────────────────── */

/** xorshift32. Seeded so both split panes draw byte-identical data. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 0x1_0000_0000
  }
}

interface Slice {
  days: number
  /** [seriesIndex][dayIndex] — sessions. */
  values: number[][]
  labels: string[]
  /** [dayOfWeek][hourBucket] — sessions, for the sequential heatmap. */
  heat: number[][]
}

function buildSlice(days: number, seed: number): Slice {
  const values = SERIES.map((_, si) => {
    const r = rng(seed * 7919 + si * 104_729 + days * 31)
    const base = 380 + si * 145
    let v = base
    const out: number[] = []
    for (let d = 0; d < days; d++) {
      // Mean-reverting walk plus a weekly rhythm: shape a reader can follow,
      // not noise. Noise makes every palette look equally bad.
      v = v * 0.8 + base * 0.2 + (r() - 0.5) * base * 0.26
      const week = 1 + Math.sin(((d % 7) / 7) * Math.PI * 2) * 0.14
      const drift = 1 + (d / days) * (si % 2 === 0 ? 0.22 : -0.14)
      out.push(Math.max(12, Math.round(v * week * drift)))
    }
    return out
  })

  const labels: string[] = []
  for (let d = 0; d < days; d++) {
    const t = new Date(ANCHOR - (days - 1 - d) * DAY_MS)
    labels.push(
      `${t.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${t.getUTCDate()}`,
    )
  }

  const hr = rng(seed * 31_337 + days * 17)
  const heat = DAY_NAMES.map((_, row) =>
    HOUR_BUCKETS.map((_, col) => {
      const hour = col * 4 + 2
      const midday = Math.exp(-((hour - 13) ** 2) / 34)
      const weekend = row < 5 ? 1 : 0.42
      return Math.round((midday * weekend * 0.85 + hr() * 0.2) * days * 42 + 4)
    }),
  )

  return { days, values, labels, heat }
}

/* ─────────────────────────────── formatting ─────────────────────────────── */

const compact = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 10_000
      ? `${(n / 1000).toFixed(1)}K`
      : n.toLocaleString('en-US')

const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/**
 * Round a max up to the next clean tick. The ladder is finer than 1/2/5 on
 * purpose: coarse steps leave a third of the plot empty, and empty plot is
 * the enemy of a chart whose whole job is showing five hues side by side.
 */
const TICK_LADDER = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
function niceMax(v: number): number {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  const step = TICK_LADDER.find((s) => v / mag <= s) ?? 10
  return step * mag
}

/** Collapse a day-resolution series into at most `n` equal buckets. */
function bucket(xs: number[], n: number): number[] {
  const size = Math.ceil(xs.length / n)
  const out: number[] = []
  for (let i = 0; i < xs.length; i += size) out.push(sum(xs.slice(i, i + size)))
  return out
}

/* ───────────────────────────────── geometry ─────────────────────────────── */

const LINE_VB = { w: 720, h: 240, l: 48, r: 82, t: 14, b: 26 }
const BAR_VB = { w: 720, h: 210, l: 48, r: 12, t: 12, b: 26 }

/** Rounded at the data end, square at the baseline — never a full pill. */
function capPath(x: number, y: number, w: number, h: number, r: number): string {
  const rad = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rad}a${rad},${rad} 0 0 1 ${rad},-${rad}h${w - rad * 2}a${rad},${rad} 0 0 1 ${rad},${rad}V${y + h}Z`
}

/* ─────────────────────────────── the console ────────────────────────────── */

type Loading = 'cold' | 'ready'

/** Everything the header's primary action actually saves. */
interface SavedView {
  days: number
  segmentId: string
  hidden: string[]
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/**
 * `--elevation-*` as something Tailwind's shadow composite can actually hold.
 *
 * Tailwind assembles `box-shadow` from a list of layer variables, and a list
 * containing the *keyword* `none` is invalid CSS — the browser drops the whole
 * declaration, taking any `ring-*` hairline in the same list with it. Under
 * `separation: 'flat'` `--elevation-1` is exactly that keyword, so the setting
 * that pays for separation in hairlines would be the setting that loses them.
 * `0 0 #0000` is the same nothing said as a shadow (what Tailwind's own
 * `shadow-none` emits) and composes cleanly.
 *
 * The raw `--elevation-*` values are still spread onto the root, so the
 * preview keeps reporting byte-for-byte what the CSS export contains.
 * (Preview.tsx carries the same helper; the two mockups share no module.)
 */
export function Analytics({ tokens, mode, uid, effects }: TokenSpaceProps) {
  // The effects ride in the same object as the tokens so that anything handed
  // `vars` — including portaled content that mounts outside .preview-root —
  // resolves `--elevation-*` and `--scrim` as well as the colours.
  const vars = {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
    ...effects,
  } as CSSProperties

  const [days, setDays] = useState<number>(30)
  const [segmentId, setSegmentId] = useState('all')
  const [hidden, setHidden] = useState<string[]>([])
  const [drill, setDrill] = useState<string | null>(null)
  const [asTable, setAsTable] = useState(false)
  const [loading, setLoading] = useState<Loading>('cold')
  const [saved, setSaved] = useState<SavedView | null>(null)

  const segment = SEGMENTS.find((s) => s.id === segmentId) ?? SEGMENTS[0]
  const thin = segment.history < days

  // "Save view" is the only header action a mockup can perform truthfully —
  // it stores the filter state it can see and hands back a way to return to
  // it. Nothing is exported, mailed or downloaded, so nothing has to lie.
  const onSaved =
    saved !== null &&
    saved.days === days &&
    saved.segmentId === segmentId &&
    sameSet(saved.hidden, hidden)

  // A cold load is a state the theme has to survive, so it is a real state
  // here rather than a permanent happy path. Range and segment changes do NOT
  // re-enter it — that data is already local, and a skeleton on every filter
  // click is the flash this mockup exists to warn people away from.
  useEffect(() => {
    if (loading !== 'cold') return
    const t = setTimeout(() => setLoading('ready'), 460)
    return () => clearTimeout(t)
  }, [loading])

  const slice = useMemo(() => buildSlice(days, segment.seed), [days, segment.seed])

  const visible = SERIES.filter((s) => !hidden.includes(s.id))
  const totals = SERIES.map((_, i) => sum(slice.values[i]))
  const visibleTotal = sum(
    SERIES.map((s, i) => (hidden.includes(s.id) ? 0 : totals[i])),
  )

  const toggle = (id: string) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))

  const drillSeries = SERIES.find((s) => s.id === drill) ?? null
  const drillIndex = drillSeries ? SERIES.indexOf(drillSeries) : -1

  return (
    <div
      className={`preview-root flex min-h-[680px] flex-col bg-background text-sm text-foreground ${
        mode === 'dark' ? 'dark' : ''
      }`}
      style={vars}
      data-uid={uid}
    >
      <div className="an-console relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── header ─────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">
              Acme analytics
            </div>
            <h1 className="font-heading text-lg font-semibold">Acquisition channels</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge className="bg-success-subtle text-success-subtle-foreground">
                Live
              </Badge>
              <span>Data through {slice.labels[slice.labels.length - 1]}</span>
            </div>
            {/* The console's primary action, in the brand's voice and at a
                size a reader can judge. It goes dead once the view on screen
                *is* the saved one — same idiom as the dashboard's Save. */}
            <Button
              className="an-save-view"
              disabled={onSaved}
              aria-disabled={onSaved || undefined}
              title={
                onSaved
                  ? 'This view is already saved'
                  : 'Save this range, segment and channel selection'
              }
              onClick={() => setSaved({ days, segmentId, hidden })}
            >
              <Bookmark className="size-4" /> Save view
            </Button>
          </div>
        </header>

        {/* ── one filter row, scoping everything below it ─────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-5 py-2.5">
          <RangePicker uid={uid} days={days} onChange={setDays} />

          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`seg-${uid}`}
              className="text-xs text-muted-foreground"
            >
              Segment
            </label>
            <Select
              value={segmentId}
              onValueChange={(v) => setSegmentId(String(v))}
            >
              <SelectTrigger id={`seg-${uid}`} size="sm" className="an-segment w-40">
                <SelectValue>
                  {(v) => SEGMENTS.find((s) => s.id === v)?.label ?? SEGMENTS[0].label}
                </SelectValue>
              </SelectTrigger>
              {/* Portaled: mounts outside .preview-root, so it needs the
                  theme's variables — and the effects with them — handed to it
                  explicitly, or `--elevation-2` resolves to nothing here and
                  the menu silently renders flat. Level 2: the user summoned
                  it and the next click sends it away. */}
              <SelectContent style={vars} className="shadow-[shadow:var(--elevation-2)]">
                {SEGMENTS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="an-reload"
              title="Re-run the initial load and show the skeleton state"
              onClick={() => setLoading('cold')}
            >
              <RefreshCw className="size-3.5" /> Reload
            </Button>
            {/* Deliberately dead, and dressed like it: the wrapper carries the
                title because a disabled control gets no pointer events of its
                own, so the reason would never surface on hover. */}
            <span
              className="inline-flex"
              title="Annotations are read-only — this workspace is shared with you in view-only mode"
            >
              <Button
                variant="outline"
                size="sm"
                className="an-annotate"
                disabled
                aria-disabled="true"
                title="Annotations are read-only — this workspace is shared with you in view-only mode"
              >
                <PenLine className="size-3.5" /> Annotate
                <Lock className="size-3" />
              </Button>
            </span>
          </div>
        </div>

        {/* The saved view, and the way back to it. `link` is the accent as
            running text — the one place in this console where a sentence,
            not a mark, carries a color the reader is meant to trust. */}
        {saved && (
          <div className="an-saved-note flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border bg-card/40 px-5 py-2 text-xs text-muted-foreground">
            <Bookmark className="size-3.5 shrink-0" aria-hidden />
            <span>
              Saved view:{' '}
              <span className="an-saved-label font-medium text-foreground">
                {SEGMENTS.find((s) => s.id === saved.segmentId)?.label ?? saved.segmentId} ·{' '}
                {saved.days}d · {SERIES.length - saved.hidden.length} of {SERIES.length} channels
              </span>
              {onSaved ? ' — you are looking at it.' : ' — the filters have moved since. '}
            </span>
            {!onSaved && (
              <button
                type="button"
                className="an-restore-view cursor-pointer rounded-sm font-medium text-link underline decoration-link/40 underline-offset-2 outline-none hover:decoration-link focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setDays(saved.days)
                  setSegmentId(saved.segmentId)
                  setHidden(saved.hidden)
                }}
              >
                Restore it
              </button>
            )}
          </div>
        )}

        {loading === 'cold' ? (
          <ColdLoad />
        ) : (
          // Container queries, not viewport ones: split view mounts two of
          // these side by side in the same 1400px window, and a viewport
          // breakpoint would give a 530px pane the full-width layout.
          <div className="@container flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-5">
            {/* ── metric tiles: five chart tokens, adjacent, at mark size ── */}
            <div className="an-tiles grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
              {SERIES.map((s, i) => (
                <MetricTile
                  key={s.id}
                  series={s}
                  total={totals[i]}
                  spark={slice.values[i]}
                  muted={hidden.includes(s.id)}
                  thin={thin}
                  onOpen={() => setDrill(s.id)}
                />
              ))}
            </div>

            {/* ── one legend scoping the three series charts under it ────── */}
            <SeriesLegend
              hidden={hidden}
              totals={totals}
              thin={thin}
              onToggle={toggle}
              onShowAll={() => setHidden([])}
            />

            <div className="grid min-w-0 grid-cols-1 gap-4 @4xl:grid-cols-3">
              <Panel
                uid={uid}
                slot="line"
                title="Sessions by channel"
                note={
                  thin
                    ? `No sessions in this window · ${segment.label}`
                    : `${visible.length} of ${SERIES.length} series · ${days}-day window`
                }
                className="@4xl:col-span-2"
                action={
                  // Nothing to tabulate when the slice is empty, so the toggle
                  // says so rather than flipping to a table of nothing.
                  <span
                    className="inline-flex"
                    title={
                      thin
                        ? 'No rows to show — this segment has no data in the selected range'
                        : asTable
                          ? 'Back to the chart'
                          : 'Read the same numbers as a table'
                    }
                  >
                    <Button
                      // A pressed toggle should look pressed: `secondary` is
                      // the neutral fill for "this is on", and it keeps the
                      // brand for actions rather than spending it on a view
                      // switch that sits inches from the chart.
                      variant={asTable ? 'secondary' : 'ghost'}
                      size="xs"
                      className="an-table-toggle"
                      aria-pressed={asTable}
                      disabled={thin}
                      aria-disabled={thin || undefined}
                      title={
                        thin
                          ? 'No rows to show — this segment has no data in the selected range'
                          : asTable
                            ? 'Back to the chart'
                            : 'Read the same numbers as a table'
                      }
                      onClick={() => setAsTable((v) => !v)}
                    >
                      <Table2 className="size-3.5" /> {asTable ? 'Chart' : 'Table'}
                    </Button>
                  </span>
                }
              >
                {thin ? (
                  <Thin segment={segment} days={days} onFix={() => setDays(7)} />
                ) : asTable ? (
                  <SeriesTable slice={slice} visible={visible} />
                ) : (
                  <LineChart uid={uid} slice={slice} visible={visible} />
                )}
              </Panel>

              <Panel
                uid={uid}
                slot="donut"
                title="Share of sessions"
                note="Click a wedge to drill in"
              >
                {thin ? (
                  <Thin segment={segment} days={days} onFix={() => setDays(7)} />
                ) : (
                  <Donut
                    uid={uid}
                    visible={visible}
                    totals={totals}
                    visibleTotal={visibleTotal}
                    onOpen={setDrill}
                  />
                )}
              </Panel>

              <Panel
                uid={uid}
                slot="bars"
                title="Sessions per period"
                note="Stacked — click a segment for its channel"
                className="@4xl:col-span-2"
              >
                {thin ? (
                  <Thin segment={segment} days={days} onFix={() => setDays(7)} />
                ) : (
                  <StackedBars
                    uid={uid}
                    slice={slice}
                    visible={visible}
                    onOpen={setDrill}
                  />
                )}
              </Panel>

              <Panel
                uid={uid}
                slot="heat"
                title="When sessions land"
                note="One hue, light to dark — magnitude, not identity"
              >
                {thin ? (
                  <Thin segment={segment} days={days} onFix={() => setDays(7)} />
                ) : (
                  <Heatmap uid={uid} slice={slice} />
                )}
              </Panel>
            </div>
          </div>
        )}

        {/* ── drill-down, in-frame so split view keeps both panes honest ─── */}
        {drillSeries && (
          <>
            {/* The drill-down blocks the console behind it, so it gets the
                real scrim — the engine's, tinted by the neutral and opened up
                for dark, rather than a foreground wash guessed at locally. */}
            <button
              type="button"
              aria-label="Close detail"
              className="an-scrim absolute inset-0 z-10 cursor-default bg-[var(--scrim)]"
              onClick={() => setDrill(null)}
            />
            <DrillPanel
              uid={uid}
              series={drillSeries}
              slice={slice}
              total={totals[drillIndex]}
              share={visibleTotal > 0 ? totals[drillIndex] / visibleTotal : 0}
              days={days}
              segment={segment}
              // Already alone on the charts: there is nothing left to focus,
              // so the confirming action says so instead of no-oping.
              sole={visible.length === 1 && visible[0].id === drillSeries.id}
              onFocusOnly={() => {
                setHidden(SERIES.filter((s) => s.id !== drillSeries.id).map((s) => s.id))
                setDrill(null)
              }}
              onClose={() => setDrill(null)}
            />
          </>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────── chrome bits ───────────────────────────── */

function RangePicker({
  uid,
  days,
  onChange,
}: {
  uid: string
  days: number
  onChange: (d: number) => void
}) {
  return (
    <div
      role="group"
      aria-labelledby={`range-label-${uid}`}
      className="an-range inline-flex items-center rounded-lg border border-border bg-card p-0.5"
    >
      <span id={`range-label-${uid}`} className="sr-only">
        Time range
      </span>
      {RANGES.map((r) => {
        const on = r.days === days
        return (
          <button
            key={r.days}
            type="button"
            aria-pressed={on}
            data-active={on || undefined}
            onClick={() => onChange(r.days)}
            /* Selection speaks in the accent's voice, not the brand's — the
               same rule the dashboard's tab indicator follows. A time range
               is the window every number below is quoted in, but it is still
               a selection, so it wears the accent wash and the ink solved
               against it. The brand stays on actions (Save view, and the
               drill's confirm), which is the job it actually holds. */
            className={`an-range-opt relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              on
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

function Panel({
  uid,
  slot,
  title,
  note,
  action,
  className = '',
  children,
}: {
  uid: string
  slot: string
  title: string
  note: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={`${slot}-title-${uid}`}
      data-panel={slot}
      /* Level 1: a chart panel is a resting raised surface. Additive to the
         border, never a replacement for it. */
      className={`an-panel flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 text-card-foreground shadow-[shadow:var(--elevation-1)] ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${slot}-title-${uid}`} className="font-heading text-sm font-semibold">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{note}</p>
        </div>
        {action}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

/** Cold load. Pulse is motion-gated — a shimmering grid is a vestibular risk. */
function ColdLoad() {
  return (
    <div className="an-skeleton @container flex flex-1 flex-col gap-4 p-5" aria-busy="true">
      <p className="sr-only" role="status">
        Loading analytics
      </p>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
        {SERIES.map((s) => (
          /* The skeleton stands in for a level-1 tile, so it sits at the same
             height — otherwise the whole grid lifts when the data lands. */
          <div
            key={s.id}
            className="rounded-xl border border-border bg-card p-3 shadow-[shadow:var(--elevation-1)]"
          >
            <div className="h-2.5 w-20 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
            <div className="mt-3 h-5 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="mt-3 h-6 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        ))}
      </div>
      <div className="h-8 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="grid flex-1 grid-cols-1 gap-4 @4xl:grid-cols-3">
        <div className="min-h-52 animate-pulse rounded-xl bg-muted motion-reduce:animate-none @4xl:col-span-2" />
        <div className="min-h-52 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  )
}

/** Insufficient data — with the numbers that explain it and a way out. */
function Thin({
  segment,
  days,
  onFix,
}: {
  segment: Segment
  days: number
  onFix: () => void
}) {
  return (
    <div className="an-empty flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <TriangleAlert className="size-5 text-warning" aria-hidden />
      <p className="text-sm font-medium">Not enough data</p>
      <p className="max-w-64 text-xs text-muted-foreground">
        {segment.label} has {segment.history} days of history. The {days}-day range needs{' '}
        {days}.
      </p>
      <Button size="xs" variant="outline" className="an-empty-fix" onClick={onFix}>
        Show the last 7 days
      </Button>
    </div>
  )
}

/* ──────────────────────────────── metric tiles ──────────────────────────── */

function MetricTile({
  series,
  total,
  spark,
  muted,
  thin,
  onOpen,
}: {
  series: Series
  total: number
  spark: number[]
  muted: boolean
  thin: boolean
  onOpen: () => void
}) {
  const half = Math.max(1, Math.floor(spark.length / 2))
  const prev = sum(spark.slice(0, half))
  const now = sum(spark.slice(half))
  const delta = prev > 0 ? ((now - prev) / prev) * 100 : 0
  const up = delta >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight

  // With no data behind it the tile has nothing to drill into, so it goes
  // visibly inert rather than opening a detail view full of dashes.
  const why = thin
    ? 'No data for this channel in the selected range'
    : `Break down ${series.label}`

  return (
    <button
      type="button"
      data-series={series.id}
      disabled={thin}
      aria-disabled={thin || undefined}
      title={why}
      /* Level 1, the same weight as the panels below it: a stat tile rests on
         the page rather than floating over it. */
      className={`an-tile group flex flex-col items-start rounded-xl border border-border bg-card p-3 text-left shadow-[shadow:var(--elevation-1)] transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none enabled:hover:border-accent-strong disabled:opacity-60 ${
        muted ? 'opacity-55' : ''
      }`}
      onClick={onOpen}
    >
      <span className="flex w-full items-center gap-1.5">
        {/* Line key, not a text colour: identity rides the mark beside the
            label so a pale chart hue never has to survive as type. */}
        <span
          aria-hidden
          className="h-[3px] w-3.5 shrink-0 rounded-full"
          style={{ background: `var(--${series.token})` }}
        />
        <span className="truncate text-xs text-muted-foreground">{series.label}</span>
        <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="an-tile-value mt-1.5 text-xl font-semibold">
        {thin ? '—' : compact(total)}
      </span>
      <span
        className={`mt-0.5 inline-flex items-center gap-0.5 text-xs ${
          thin ? 'text-muted-foreground' : up ? 'text-success' : 'text-destructive'
        }`}
      >
        {!thin && <Arrow className="size-3" aria-hidden />}
        {thin ? 'no baseline' : `${signed(delta)} vs. prior`}
      </span>
      {!thin && <Sparkline points={spark} token={series.token} />}
    </button>
  )
}

function Sparkline({ points, token }: { points: number[]; token: string }) {
  const tail = points.slice(-14)
  const lo = Math.min(...tail)
  const hi = Math.max(...tail)
  const span = hi - lo || 1
  const d = tail
    .map((v, i) => {
      const x = (i / (tail.length - 1)) * 116 + 2
      const y = 24 - ((v - lo) / span) * 20
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 28"
      className="mt-2 h-7 w-full"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={`var(--${token})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/* ─────────────────────────────────── legend ─────────────────────────────── */

function SeriesLegend({
  hidden,
  totals,
  thin,
  onToggle,
  onShowAll,
}: {
  hidden: string[]
  totals: number[]
  thin: boolean
  onToggle: (id: string) => void
  onShowAll: () => void
}) {
  const shown = SERIES.filter((s) => !hidden.includes(s.id))
  return (
    <div className="an-legend flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 shadow-[shadow:var(--elevation-1)]">
      <span className="mr-1 text-xs text-muted-foreground">Channels</span>
      {SERIES.map((s, i) => {
        const on = !hidden.includes(s.id)
        // The last one standing can't be switched off — an empty chart is not
        // a state worth reaching, so the control says so instead of no-oping.
        const locked = on && shown.length === 1
        const why = locked
          ? 'At least one channel has to stay visible'
          : on
            ? `Hide ${s.label}`
            : `Show ${s.label}`
        return (
          <span key={s.id} className="inline-flex" title={why}>
            <button
              type="button"
              data-series={s.id}
              aria-pressed={on}
              aria-disabled={locked || undefined}
              disabled={locked}
              title={why}
              onClick={() => onToggle(s.id)}
              className={`an-legend-item inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-100 ${
                on ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              <span
                aria-hidden
                className="h-[3px] w-3.5 shrink-0 rounded-full"
                style={{ background: on ? `var(--${s.token})` : 'var(--border)' }}
              />
              {s.label}
              <span className="tabular-nums opacity-70">
                {thin || !on ? '—' : compact(totals[i])}
              </span>
              {locked && <Lock className="size-3 opacity-60" aria-hidden />}
            </button>
          </span>
        )
      })}
      {/* Undoing five separate hides one click at a time is a chore, so the
          legend offers the way back — as a link, because it is a sentence
          about the data rather than another switch. */}
      {hidden.length > 0 && (
        <button
          type="button"
          className="an-show-all ml-1 cursor-pointer rounded-sm text-xs font-medium text-link underline decoration-link/40 underline-offset-2 outline-none hover:decoration-link focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onShowAll}
        >
          Show all {SERIES.length}
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────── the line chart ─────────────────────────── */

function LineChart({
  uid,
  slice,
  visible,
}: {
  uid: string
  slice: Slice
  visible: Series[]
}) {
  const [idx, setIdx] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const n = slice.days

  const cols = visible.map((s) => slice.values[SERIES.indexOf(s)])
  const top = niceMax(Math.max(1, ...cols.flat()))
  const plotW = LINE_VB.w - LINE_VB.l - LINE_VB.r
  const plotH = LINE_VB.h - LINE_VB.t - LINE_VB.b
  const xAt = (i: number) => LINE_VB.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yAt = (v: number) => LINE_VB.t + plotH - (v / top) * plotH

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f))
  const xTicks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)

  const track = (e: PointerEvent<HTMLDivElement>) => {
    const box = plotRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const f = (e.clientX - box.left) / box.width
    setIdx(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))))
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0 && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    setIdx((cur) => {
      if (e.key === 'Home') return 0
      if (e.key === 'End') return n - 1
      return Math.max(0, Math.min(n - 1, (cur ?? 0) + step))
    })
  }

  // End labels only where they clear each other; converging lines get the
  // legend and the readout instead of a pile of nudged text.
  const ends = visible
    .map((s, i) => ({ s, y: yAt(cols[i][n - 1]), v: cols[i][n - 1] }))
    .sort((a, b) => a.y - b.y)
  let lastY = -Infinity
  const labelled = ends.map((e) => {
    const fits = e.y - lastY >= 18
    if (fits) lastY = e.y
    return { ...e, fits }
  })

  return (
    <div className="relative flex flex-1 flex-col">
      <svg
        viewBox={`0 0 ${LINE_VB.w} ${LINE_VB.h}`}
        className="an-line h-auto w-full"
        role="img"
        aria-label={`Sessions by channel over ${n} days, ${visible.length} series shown`}
      >
        <defs>
          {/* uid-scoped: two panes sharing a clip id would clip each other. */}
          <clipPath id={`plot-clip-${uid}`}>
            <rect
              x={LINE_VB.l}
              y={LINE_VB.t - 6}
              width={plotW}
              height={plotH + 12}
            />
          </clipPath>
        </defs>

        {/* Grid recedes: hairline `border`, solid, never dashed. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={LINE_VB.l}
              x2={LINE_VB.l + plotW}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={LINE_VB.l - 8}
              y={yAt(t) + 4}
              textAnchor="end"
              className="tabular-nums"
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {compact(t)}
            </text>
          </g>
        ))}

        {xTicks.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={LINE_VB.h - 8}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="var(--muted-foreground)"
          >
            {slice.labels[i]}
          </text>
        ))}

        <g clipPath={`url(#plot-clip-${uid})`}>
          {idx != null && (
            <line
              className="an-crosshair"
              x1={xAt(idx)}
              x2={xAt(idx)}
              y1={LINE_VB.t}
              y2={LINE_VB.t + plotH}
              stroke="var(--accent-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {visible.map((s, i) => (
            <path
              key={s.id}
              className="an-line-path"
              data-series={s.id}
              d={cols[i]
                .map((v, j) => `${j === 0 ? 'M' : 'L'}${xAt(j).toFixed(1)},${yAt(v).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke={`var(--${s.token})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* End markers carry a 2px ring in the surface colour so they stay
              readable where two channels finish on top of each other. */}
          {visible.map((s, i) => (
            <circle
              key={s.id}
              cx={xAt(n - 1)}
              cy={yAt(cols[i][n - 1])}
              r={4}
              fill={`var(--${s.token})`}
              stroke="var(--card)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {idx != null &&
            visible.map((s, i) => (
              <circle
                key={s.id}
                className="an-hover-dot"
                cx={xAt(idx)}
                cy={yAt(cols[i][idx])}
                r={4}
                fill={`var(--${s.token})`}
                stroke="var(--card)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </g>

        {labelled.map(
          (e) =>
            e.fits && (
              <text
                key={e.s.id}
                className="an-end-label"
                x={LINE_VB.l + plotW + 9}
                y={e.y + 4}
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                {e.s.label.length > 11 ? `${e.s.label.slice(0, 10)}…` : e.s.label}
              </text>
            ),
        )}
      </svg>

      {/* Hit layer sits exactly over the plot box, so the reader aims at a
          date rather than at a 2px stroke. Focusable, with the same readout
          on arrow keys as on hover. */}
      <div
        ref={plotRef}
        tabIndex={0}
        role="slider"
        aria-label="Scrub the session timeline"
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={idx ?? 0}
        aria-valuetext={idx == null ? 'not scrubbing' : slice.labels[idx]}
        className="an-scrub absolute rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        style={{
          left: `${(LINE_VB.l / LINE_VB.w) * 100}%`,
          right: `${(LINE_VB.r / LINE_VB.w) * 100}%`,
          top: `${(LINE_VB.t / LINE_VB.h) * 100}%`,
          bottom: `${(LINE_VB.b / LINE_VB.h) * 100}%`,
        }}
        onPointerMove={track}
        onPointerLeave={() => setIdx(null)}
        onFocus={() => setIdx((c) => c ?? n - 1)}
        onBlur={() => setIdx(null)}
        onKeyDown={onKey}
      />

      {idx != null && (
        <Readout
          className="an-line-tip"
          left={`${((xAt(idx) + (idx > n / 2 ? -14 : 14)) / LINE_VB.w) * 100}%`}
          align={idx > n / 2 ? 'right' : 'left'}
          title={slice.labels[idx]}
          rows={visible.map((s, i) => ({
            token: s.token,
            label: s.label,
            value: cols[i][idx].toLocaleString('en-US'),
          }))}
        />
      )}
    </div>
  )
}

/** The table twin: every value the tooltip shows, reachable without hovering. */
function SeriesTable({ slice, visible }: { slice: Slice; visible: Series[] }) {
  const n = Math.min(8, slice.days)
  const size = Math.ceil(slice.days / n)
  const periods = Array.from({ length: n }, (_, i) => {
    const from = i * size
    const to = Math.min(slice.days - 1, from + size - 1)
    return from === to
      ? slice.labels[from]
      : `${slice.labels[from]} – ${slice.labels[to]}`
  })
  const cols = visible.map((s) => bucket(slice.values[SERIES.indexOf(s)], n))

  return (
    <div className="an-series-table min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            {visible.map((s) => (
              <TableHead key={s.id} className="text-right">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-[3px] w-3 rounded-full"
                    style={{ background: `var(--${s.token})` }}
                  />
                  {s.label}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.map((p, r) => (
            /* Reading across a row of five numbers is exactly when a wash
               earns its keep: `accent` is the subtle one (ramp step 2), and
               `accent-foreground` is the ink solved against it. */
            <TableRow
              key={p}
              className="an-series-row hover:bg-accent hover:text-accent-foreground"
            >
              <TableCell className="whitespace-nowrap">{p}</TableCell>
              {cols.map((c, ci) => (
                <TableCell key={visible[ci].id} className="text-right tabular-nums">
                  {c[r]?.toLocaleString('en-US') ?? '—'}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ────────────────────────────── stacked bars ────────────────────────────── */

function StackedBars({
  uid,
  slice,
  visible,
  onOpen,
}: {
  uid: string
  slice: Slice
  visible: Series[]
  onOpen: (id: string) => void
}) {
  const [hover, setHover] = useState<{ b: number; s: number } | null>(null)
  const n = slice.days <= 7 ? slice.days : slice.days <= 30 ? 10 : 9
  const cols = visible.map((s) => bucket(slice.values[SERIES.indexOf(s)], n))
  const size = Math.ceil(slice.days / n)
  const bars = cols[0]?.length ?? 0
  const stackTotals = Array.from({ length: bars }, (_, b) =>
    sum(cols.map((c) => c[b] ?? 0)),
  )
  const top = niceMax(Math.max(1, ...stackTotals))

  const plotW = BAR_VB.w - BAR_VB.l - BAR_VB.r
  const plotH = BAR_VB.h - BAR_VB.t - BAR_VB.b
  const band = plotW / Math.max(1, bars)
  const barW = Math.min(24, band * 0.62)
  const base = BAR_VB.t + plotH
  const GAP = 2 // surface gap — white does the separating, never a stroke

  return (
    <div className="relative flex flex-1 flex-col">
      <svg
        viewBox={`0 0 ${BAR_VB.w} ${BAR_VB.h}`}
        className="an-bars h-auto w-full"
        role="img"
        aria-label={`Stacked sessions across ${bars} periods`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={BAR_VB.l}
              x2={BAR_VB.l + plotW}
              y1={base - f * plotH}
              y2={base - f * plotH}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={BAR_VB.l - 8}
              y={base - f * plotH + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {compact(Math.round(top * f))}
            </text>
          </g>
        ))}

        {Array.from({ length: bars }, (_, b) => {
          const cx = BAR_VB.l + band * b + band / 2
          let acc = 0
          return (
            <g key={b} transform={`translate(${cx - barW / 2} 0)`}>
              {visible.map((s, si) => {
                const v = cols[si][b] ?? 0
                const h = (v / top) * plotH
                const y = base - acc - h
                acc += h
                const drawH = Math.max(1, h - GAP)
                const isTop = si === visible.length - 1
                const on = hover?.b === b && hover.s === si
                const shape = isTop
                  ? capPath(0, y + GAP, barW, drawH, 4)
                  : null
                const common = {
                  className: 'an-bar-seg',
                  'data-series': s.id,
                  fill: `var(--${s.token})`,
                  opacity: hover && !on ? 0.55 : 1,
                  style: { cursor: 'pointer' } as CSSProperties,
                  onPointerEnter: () => setHover({ b, s: si }),
                  onPointerLeave: () => setHover(null),
                  onClick: () => onOpen(s.id),
                }
                return shape ? (
                  <path key={s.id} d={shape} {...common} />
                ) : (
                  <rect
                    key={s.id}
                    x={0}
                    y={y + GAP}
                    width={barW}
                    height={drawH}
                    {...common}
                  />
                )
              })}
            </g>
          )
        })}

        {Array.from({ length: bars }, (_, b) => {
          if (bars > 6 && b % 2 === 1) return null
          const from = b * size
          return (
            <text
              key={b}
              x={BAR_VB.l + band * b + band / 2}
              y={BAR_VB.h - 8}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {slice.labels[Math.min(from, slice.days - 1)]}
            </text>
          )
        })}
      </svg>

      {hover && (
        <Readout
          className="an-bar-tip"
          left={`${(((BAR_VB.l + band * hover.b + band / 2) / BAR_VB.w) * 100).toFixed(1)}%`}
          align={hover.b > bars / 2 ? 'right' : 'left'}
          title={`${slice.labels[Math.min(hover.b * size, slice.days - 1)]} · ${compact(stackTotals[hover.b])} total`}
          rows={[
            {
              token: visible[hover.s].token,
              label: visible[hover.s].label,
              value: (cols[hover.s][hover.b] ?? 0).toLocaleString('en-US'),
            },
          ]}
        />
      )}
      <p id={`bars-help-${uid}`} className="sr-only">
        Each column stacks the visible channels for one period.
      </p>
    </div>
  )
}

/* ──────────────────────────────────  donut  ─────────────────────────────── */

function Donut({
  uid,
  visible,
  totals,
  visibleTotal,
  onOpen,
}: {
  uid: string
  visible: Series[]
  totals: number[]
  visibleTotal: number
  onOpen: (id: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const R = 56
  const SW = 18
  const C = 2 * Math.PI * R
  const GAP = 3 // arc-length gap in the surface colour, same job as the bars'

  let acc = 0
  const arcs = visible.map((s) => {
    const v = totals[SERIES.indexOf(s)]
    const share = visibleTotal > 0 ? v / visibleTotal : 0
    const len = Math.max(0, share * C - GAP)
    const arc = { s, v, share, len, offset: acc }
    acc += share * C
    return arc
  })

  const focus = arcs.find((a) => a.s.id === hover) ?? null

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="relative">
        <svg
          viewBox="0 0 150 150"
          className="an-donut h-36 w-36"
          role="img"
          aria-labelledby={`donut-total-${uid}`}
        >
          <g transform="translate(75 75) rotate(-90)">
            {arcs.map((a) => (
              <circle
                key={a.s.id}
                className="an-arc"
                data-series={a.s.id}
                r={R}
                fill="none"
                stroke={`var(--${a.s.token})`}
                strokeWidth={hover === a.s.id ? SW + 4 : SW}
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={-a.offset}
                opacity={hover && hover !== a.s.id ? 0.5 : 1}
                pointerEvents="none"
              />
            ))}
            {/* Transparent over-arc: the hit target is wider than the ring, so
                a wedge is reachable without landing dead-centre on 18px. */}
            {arcs.map((a) => (
              <circle
                key={a.s.id}
                className="an-arc-hit"
                data-series={a.s.id}
                r={R}
                fill="none"
                stroke="transparent"
                strokeWidth={SW + 14}
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={-a.offset}
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHover(a.s.id)}
                onPointerLeave={() => setHover(null)}
                onClick={() => onOpen(a.s.id)}
              />
            ))}
          </g>
        </svg>
        <div
          id={`donut-total-${uid}`}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <span className="an-donut-total text-2xl font-semibold">
            {compact(focus ? focus.v : visibleTotal)}
          </span>
          <span className="an-donut-caption max-w-24 text-[11px] leading-tight text-muted-foreground">
            {focus
              ? `${focus.s.label} · ${(focus.share * 100).toFixed(0)}%`
              : `sessions · ${visible.length} of ${SERIES.length}`}
          </span>
        </div>
      </div>

      {/* The same wedge, reachable without aiming at an 18px ring — hover
          drives the centre read-out, click drills in, and it tabs. */}
      <ul className="grid w-full gap-0.5 text-xs">
        {arcs.map((a) => (
          <li key={a.s.id}>
            <button
              type="button"
              /* The hovered row is what the donut's centre is currently
                 reporting, so it wears the selection wash rather than a
                 neutral one — accent + the ink solved against it. */
              className="an-share-row group/share flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              data-series={a.s.id}
              title={`Break down ${a.s.label}`}
              onPointerEnter={() => setHover(a.s.id)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(a.s.id)}
              onBlur={() => setHover(null)}
              onClick={() => onOpen(a.s.id)}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: `var(--${a.s.token})` }}
              />
              <span className="truncate text-muted-foreground group-hover/share:text-accent-foreground group-focus-visible/share:text-accent-foreground">
                {a.s.label}
              </span>
              <span className="ml-auto tabular-nums">{(a.share * 100).toFixed(1)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ──────────────────────────────────  heatmap ────────────────────────────── */

/** Six bins. Past ~7 classes adjacent steps blur into each other. */
const HEAT_STEPS = [10, 26, 44, 62, 81, 100]

/**
 * The sequential ramp: ONE hue walking from the card surface toward maximum
 * contrast with it. The far end is chart-1 nudged toward `foreground` because
 * a pale chart-1 mixed only with `card` has almost no range left to spend —
 * and since `foreground` inverts with the mode, the ramp gets darker in light
 * and lighter in dark without a second code path.
 */
const heatFill = (step: number) =>
  `color-mix(in oklab, color-mix(in oklab, var(--chart-1) 74%, var(--foreground)) ${step}%, var(--card))`

function Heatmap({ uid, slice }: { uid: string; slice: Slice }) {
  const [cell, setCell] = useState<{ r: number; c: number } | null>(null)
  const flat = slice.heat.flat()
  const lo = Math.min(...flat)
  const hi = Math.max(...flat)
  const binOf = (v: number) =>
    Math.min(HEAT_STEPS.length - 1, Math.floor(((v - lo) / (hi - lo || 1)) * HEAT_STEPS.length))

  const W = 300
  const H = 168
  const L = 30
  const T = 16
  const cw = (W - L) / HOUR_BUCKETS.length
  const ch = (H - T) / DAY_NAMES.length

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = map[e.key]
    if (!step) return
    e.preventDefault()
    setCell((cur) => {
      const r = Math.max(0, Math.min(DAY_NAMES.length - 1, (cur?.r ?? 0) + step[0]))
      const c = Math.max(0, Math.min(HOUR_BUCKETS.length - 1, (cur?.c ?? 0) + step[1]))
      return { r, c }
    })
  }

  const value = cell ? slice.heat[cell.r][cell.c] : null

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div
        tabIndex={0}
        role="group"
        aria-label="Sessions by weekday and hour. Arrow keys move the read-out."
        aria-describedby={`heat-readout-${uid}`}
        className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onKeyDown={onKey}
        onFocus={() => setCell((c) => c ?? { r: 0, c: 3 })}
        onBlur={() => setCell(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="an-heat h-auto w-full" aria-hidden>
          {HOUR_BUCKETS.map((h, c) => (
            <text
              key={h}
              x={L + cw * c + cw / 2}
              y={10}
              textAnchor="middle"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {h}
            </text>
          ))}
          {DAY_NAMES.map((d, r) => (
            <text
              key={d}
              x={L - 6}
              y={T + ch * r + ch / 2 + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {d}
            </text>
          ))}
          {slice.heat.map((row, r) =>
            row.map((v, c) => {
              const on = cell?.r === r && cell.c === c
              return (
                <rect
                  key={`${r}-${c}`}
                  className="an-heat-cell"
                  data-cell={`${r}-${c}`}
                  x={L + cw * c + 1}
                  y={T + ch * r + 1}
                  width={cw - 2}
                  height={ch - 2}
                  rx={2}
                  // Cycling the categorical five here would claim these cells
                  // are different *kinds* of thing rather than different
                  // amounts. One hue, six bins.
                  fill={heatFill(HEAT_STEPS[binOf(v)])}
                  stroke={on ? 'var(--accent-strong)' : 'transparent'}
                  strokeWidth={on ? 2 : 0}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() => setCell({ r, c })}
                  onPointerLeave={() => setCell(null)}
                />
              )
            }),
          )}
        </svg>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{compact(lo)}</span>
        {HEAT_STEPS.map((s) => (
          <span
            key={s}
            aria-hidden
            className="h-3 flex-1 rounded-[2px]"
            style={{ background: heatFill(s) }}
          />
        ))}
        <span>{compact(hi)}</span>
      </div>

      <p
        id={`heat-readout-${uid}`}
        role="status"
        className="an-heat-readout min-h-8 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs"
      >
        {cell ? (
          <>
            <span className="font-medium tabular-nums">{value?.toLocaleString('en-US')}</span>{' '}
            <span className="text-muted-foreground">
              sessions · {DAY_NAMES[cell.r]} {HOUR_BUCKETS[cell.c]}:00–
              {String(Number(HOUR_BUCKETS[cell.c]) + 4).padStart(2, '0')}:00
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Hover or focus the grid to read a cell.
          </span>
        )}
      </p>
    </div>
  )
}

/* ─────────────────────────────── shared readout ─────────────────────────── */

function Readout({
  className,
  left,
  align,
  title,
  rows,
}: {
  className: string
  left: string
  align: 'left' | 'right'
  title: string
  rows: Array<{ token: string; label: string; value: string }>
}) {
  return (
    <div
      // Deliberately not a live region: this changes on every pixel of pointer
      // travel and would machine-gun a screen reader. The scrub's aria-valuetext
      // and the Table view are the non-visual routes to the same numbers.
      aria-hidden
      /* Level 2: a read-out is a tooltip — summoned by the pointer, gone the
         moment it leaves. Same weight as a menu, never a dialog's. */
      className={`${className} pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-border bg-popover px-2.5 py-2 text-popover-foreground shadow-[shadow:var(--elevation-2)]`}
      style={{ left, transform: align === 'right' ? 'translateX(-100%)' : undefined }}
    >
      <div className="mb-1 text-[11px] text-muted-foreground">{title}</div>
      <ul className="grid gap-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="h-[3px] w-3 shrink-0 rounded-full"
              style={{ background: `var(--${r.token})` }}
            />
            {/* Value leads, label follows: the reader already has the series
                and came for the number. */}
            <span className="font-medium tabular-nums">{r.value}</span>
            <span className="ml-auto truncate text-muted-foreground">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ────────────────────────────────  drill-down  ──────────────────────────── */

function DrillPanel({
  uid,
  series,
  slice,
  total,
  share,
  days,
  segment,
  sole,
  onFocusOnly,
  onClose,
}: {
  uid: string
  series: Series
  slice: Slice
  total: number
  share: number
  days: number
  segment: Segment
  sole: boolean
  onFocusOnly: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [method, setMethod] = useState(false)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const values = slice.values[SERIES.indexOf(series)]
  const n = Math.min(6, slice.days)
  const buckets = bucket(values, n)
  const size = Math.ceil(slice.days / n)
  const peak = Math.max(...values)
  const peakDay = slice.labels[values.indexOf(peak)]
  const partMax = Math.max(...series.parts.map(([, f]) => f))

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`drill-title-${uid}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      /* Level 3: aria-modal, scrimmed, and it owns the console while it is
         open. The `border-l` is what still separates it under `flat`. */
      className="an-drill absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col overflow-auto border-l border-border bg-card text-card-foreground shadow-[shadow:var(--elevation-3)] motion-safe:animate-in motion-safe:slide-in-from-right-6 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-[3px] w-4 shrink-0 rounded-full"
              style={{ background: `var(--${series.token})` }}
            />
            <span className="text-xs text-muted-foreground">Channel detail</span>
          </span>
          <h3 id={`drill-title-${uid}`} className="font-heading text-base font-semibold">
            {series.label}
          </h3>
          <p className="text-xs text-muted-foreground">
            {segment.label} · last {days} days
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="an-drill-close"
          aria-label="Close detail"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 p-4">
        {[
          ['Sessions', compact(total)],
          ['Share', `${(share * 100).toFixed(1)}%`],
          ['Peak day', peakDay],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-background p-2.5">
            <div className="text-[11px] text-muted-foreground">{k}</div>
            <div className="mt-0.5 truncate text-base font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <Separator />

      <div className="p-4">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Sources within {series.label}
        </h4>
        {/* One series, one colour: a value ramp across these rows would
            re-encode the bar length as hue and say nothing new. */}
        <ul className="grid gap-2">
          {series.parts.map(([name, frac]) => (
            <li key={name} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate">{name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {compact(Math.round(total * frac))}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(frac / partMax) * 100}%`,
                    background: `var(--${series.token})`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Separator />

      <div className="p-4">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">By period</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((v, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap">
                  {slice.labels[Math.min(i * size, slice.days - 1)]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {v.toLocaleString('en-US')}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {((v / total) * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* A dialog's footer: the way out on the left, the confirming action on
          the right, in the brand's voice. It is the one button in this panel
          that changes what every chart behind it draws. */}
      <div className="an-drill-actions mt-auto flex items-center justify-end gap-2 border-t border-border p-4">
        <Button variant="outline" className="an-drill-cancel" onClick={onClose}>
          Cancel
        </Button>
        <span
          className="inline-flex"
          title={
            sole
              ? `${series.label} is already the only channel on the charts`
              : `Hide every other channel and show ${series.label} alone`
          }
        >
          <Button
            className="an-drill-focus"
            disabled={sole}
            aria-disabled={sole || undefined}
            title={
              sole
                ? `${series.label} is already the only channel on the charts`
                : `Hide every other channel and show ${series.label} alone`
            }
            onClick={onFocusOnly}
          >
            <Filter className="size-4" /> Show only this channel
          </Button>
        </span>
      </div>

      <p className="flex items-start gap-2 border-t border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Attribution is last-touch, and sessions inside a 30-minute window count once.{' '}
          <button
            type="button"
            aria-expanded={method}
            className="an-attr-link cursor-pointer rounded-sm font-medium text-link underline decoration-link/40 underline-offset-2 outline-none hover:decoration-link focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setMethod((v) => !v)}
          >
            {method ? 'Hide the detail' : 'What that means'}
          </button>
          {method && (
            <span className="an-attr-detail mt-1.5 block">
              A visit credited to {series.label} touched it last before converting. Earlier
              touches inside the same 30-minute window fold into that one session, so each of
              the {compact(total)} above is counted once and never split across channels.
            </span>
          )}
        </span>
      </p>
    </div>
  )
}
