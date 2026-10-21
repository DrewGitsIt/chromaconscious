import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, RefObject } from 'react'
import { CircleAlert, CircleCheck, CornerDownLeft, Info, Search, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { REQUEST_DAYS, REQUESTS_TOTAL } from './dashboardData'

/**
 * The App dashboard's newer parts, kept out of Preview.tsx so that file stays
 * the state machine and this one the drawing. Nothing here owns app state:
 * every part takes plain data and callbacks.
 *
 * The page's discipline (the redesign drafted in mockups/dashboard.html):
 * neutrals carry it, and each colour has one job. Primary marks the brand,
 * the main action, the requests line and the deploys that shipped; status
 * colours mark only status; the chart palette appears only on traffic.
 */

const useSize = (ref: RefObject<HTMLElement | null>) => {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/* ------------------------------------------------------------- requests */

// An hour's share of its day: low overnight, a broad working-day hump.
const HOUR_SHARE = Array.from({ length: 24 }, (_, h) => 0.55 + 0.9 * Math.max(0, Math.sin(((h - 6) / 16) * Math.PI)) ** 1.2)
const SHARE_SUM = HOUR_SHARE.reduce((a, b) => a + b, 0)
const SERIES = REQUEST_DAYS.flatMap(([, total]) => HOUR_SHARE.map((k) => (total * k) / SHARE_SUM))
/** Production deploys that shipped, by hour from Friday 00:00. */
const SHIPS = [3 * 24 + 15, 4 * 24 + 11, 5 * 24 + 16, 6 * 24 + 9.7]
/** The build that failed: the one the alerts tab and its logs are about. */
const FAILED = { at: 6 * 24 + 9.2, label: 'billing-service #4821 failed' }

/** A smooth path through points (Catmull-Rom, as cubic Béziers). */
const smooth = (p: Array<[number, number]>) =>
  p.reduce((d, [x, y], i) => {
    if (!i) return `M${x},${y}`
    const [x0, y0] = p[i - 2] ?? p[i - 1]
    const [x1, y1] = p[i - 1]
    const [x3, y3] = p[i + 1] ?? [x, y]
    return `${d}C${x1 + (x - x0) / 6},${y1 + (y - y0) / 6} ${x - (x3 - x1) / 6},${y - (y3 - y1) / 6} ${x},${y}`
  }, '')

const ink = (token: string) => `var(--${token})`

/**
 * The dashboard's focal point: requests per hour for the week, the deploys
 * that shipped along the axis, and the failed build marked where it broke.
 * Drawn at its real pixel size (measured), so strokes and labels never
 * stretch. Hovering reads an hour back; the readout and the failure label are
 * HTML on their own surfaces, never text laid over the line.
 */
export function RequestsChart() {
  const ref = useRef<HTMLDivElement>(null)
  const { w: W, h: H } = useSize(ref)
  const [hover, setHover] = useState<number | null>(null)
  const L = 4
  const R = 36
  const T = 34
  const B = 24
  const n = SERIES.length
  const max = Math.ceil(Math.max(...SERIES) / 50) * 50
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const line = useMemo(() => (W ? smooth(SERIES.map((v, i) => [x(i), y(v)])) : ''), [W, H]) // eslint-disable-line react-hooks/exhaustive-deps
  const fx = x(FAILED.at)
  const pick = (clientX: number) => {
    const box = ref.current!.getBoundingClientRect()
    const i = Math.round(((clientX - box.left - L) / (W - L - R)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const at = hover == null ? null : { day: REQUEST_DAYS[Math.floor(hover / 24)][0], hour: hover % 24, v: SERIES[hover] }

  return (
    <div
      ref={ref}
      className="requests-chart relative min-h-[220px] flex-1"
      onPointerMove={(e) => pick(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      {W > 0 && (
        <svg
          className="absolute inset-0"
          width={W}
          height={H}
          role="img"
          aria-label={`Requests per hour, Friday to Thursday, ${REQUESTS_TOTAL.toLocaleString('en')} in all`}
        >
          {[0, max / 3, (2 * max) / 3, max].map((g) => (
            <g key={g}>
              <line
                x1={L}
                x2={W - R}
                y1={y(g)}
                y2={y(g)}
                style={{ stroke: ink('border'), strokeDasharray: g ? '2 4' : undefined }}
              />
              <text x={W - R + 8} y={y(g) + 4} className="text-[11px]" style={{ fill: ink('muted-foreground') }}>
                {Math.round(g)}
              </text>
            </g>
          ))}
          {REQUEST_DAYS.map(([d], i) => (
            <text
              key={d}
              x={x(i * 24 + 12)}
              y={H - 5}
              textAnchor="middle"
              className="text-[11px]"
              style={{ fill: ink('muted-foreground') }}
            >
              {d}
            </text>
          ))}
          <path d={`${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} style={{ fill: ink('secondary') }} />
          <path d={line} className="requests-line" style={{ fill: 'none', stroke: ink('primary'), strokeWidth: 2 }} />
          {SHIPS.map((i) => (
            <path key={i} className="requests-ship" d={`M${x(i) - 4} ${y(0) + 7}h8l-4 -6z`} style={{ fill: ink('primary') }} />
          ))}
          <line
            x1={fx}
            x2={fx}
            y1={T - 22}
            y2={y(0)}
            style={{ stroke: ink('destructive-strong'), strokeDasharray: '3 3' }}
          />
          <circle
            cx={fx}
            cy={y(SERIES[Math.round(FAILED.at)])}
            r={4}
            style={{ fill: ink('card'), stroke: ink('destructive-strong'), strokeWidth: 2 }}
          />
          {at && hover != null && (
            <g className="requests-hover">
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} style={{ stroke: ink('foreground') }} />
              <circle cx={x(hover)} cy={y(at.v)} r={4} style={{ fill: ink('primary'), stroke: ink('card'), strokeWidth: 2 }} />
            </g>
          )}
        </svg>
      )}
      {W > 0 && (
        <span
          className="requests-failed absolute top-1 -translate-x-full rounded-full bg-destructive-subtle px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-destructive-subtle-foreground"
          style={{ left: fx - 8 }}
        >
          {FAILED.label}
        </span>
      )}
      {at && hover != null && (
        <div
          role="status"
          className="requests-tip pointer-events-none absolute rounded-md border border-border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-[shadow:var(--elevation-2)]"
          style={{
            top: Math.max(T, y(at.v) - 40),
            ...(x(hover) > W / 2 ? { right: W - x(hover) + 10 } : { left: x(hover) + 10 }),
          }}
        >
          <b className="font-semibold tabular-nums">{Math.round(at.v)}</b> requests ·{' '}
          <span className="tabular-nums">
            {at.day} {String(at.hour).padStart(2, '0')}:00
          </span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ sparkline */

/** A KPI's own trend: a quiet line, its latest value marked in primary. */
export function Sparkline({ data }: { data: number[] }) {
  const lo = Math.min(...data) - 2
  const hi = Math.max(...data) + 2
  const p = data.map((v, i) => [(i / (data.length - 1)) * 192 + 4, 26 - ((v - lo) / (hi - lo)) * 22] as const)
  const [ex, ey] = p[p.length - 1]
  return (
    <svg viewBox="0 0 200 30" preserveAspectRatio="none" className="mt-2 block h-7 w-full" aria-hidden>
      <polyline
        points={p.map((q) => q.join(',')).join(' ')}
        vectorEffect="non-scaling-stroke"
        style={{ fill: 'none', stroke: ink('muted-foreground'), strokeWidth: 1.5 }}
      />
      <circle cx={ex} cy={ey} r={3} style={{ fill: ink('primary') }} />
    </svg>
  )
}

/* --------------------------------------------------------------- uptime */

/** Thirty days a project, one mark a day: the seeds have a history, a new project starts clean. */
const HISTORY: Record<string, { warn: number[]; err: number[] }> = {
  'marketing-site': { warn: [17], err: [] },
  'billing-service': { warn: [22, 25, 26, 27, 29], err: [28] },
  'legacy-importer': { warn: [12, 13, 20, 21], err: [14, 15, 16, 22, 23, 24, 25, 26, 27, 28, 29] },
  'docs-portal': { warn: [], err: [] },
}

export function UptimeStrip({ id }: { id: string }) {
  const h = HISTORY[id] ?? { warn: [], err: [] }
  return (
    <span className="uptime-strip col-span-full flex h-4.5 gap-0.5" aria-hidden>
      {Array.from({ length: 30 }, (_, d) => (
        <i
          key={d}
          data-day={h.err.includes(d) ? 'err' : h.warn.includes(d) ? 'warn' : 'ok'}
          className={`flex-1 rounded-[min(var(--radius)*0.2,2px)] ${
            h.err.includes(d) ? 'bg-destructive-strong' : h.warn.includes(d) ? 'bg-warning-strong' : 'bg-success-strong'
          }`}
        />
      ))}
    </span>
  )
}

/* ----------------------------------------------------------------- feed */

/** A feed row's lead: the person's initials, or the event's level as a glyph. */
export function FeedMark({ text, level, people }: { text: string; level: string; people: readonly string[] }) {
  const who = people.find((p) => text.startsWith(`${p} `))
  if (who)
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground uppercase">
        {who.slice(0, 2)}
      </span>
    )
  const [Icon, tone] =
    level === 'ok'
      ? [CircleCheck, 'text-success-strong']
      : level === 'warn'
        ? [TriangleAlert, 'text-warning-strong']
        : level === 'error'
          ? [CircleAlert, 'text-destructive-strong']
          : [Info, 'text-muted-foreground']
  return (
    <span className={`grid size-7 shrink-0 place-items-center rounded-full border border-border ${tone}`} aria-hidden>
      <Icon className="size-4" />
    </span>
  )
}

/* -------------------------------------------------------- command menu */

export interface Command {
  id: string
  label: string
  /** What kind of thing it is: "Page", "Project". */
  group: string
  run: () => void
}

/**
 * Search, as a command menu: type to narrow pages and projects, arrows to
 * move, Enter to go. A real listbox (aria-activedescendant on the input), so
 * the keyboard never leaves the field.
 */
export function CommandMenu({
  open,
  onOpenChange,
  uid,
  vars,
  commands,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  uid: string
  vars: CSSProperties
  commands: Command[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const q = query.trim().toLowerCase()
  const shown = commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
  const current = Math.min(active, Math.max(0, shown.length - 1))
  const close = () => {
    onOpenChange(false)
    setQuery('')
    setActive(0)
  }
  const go = (c: Command | undefined) => {
    if (!c) return
    close()
    c.run()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((current + 1) % Math.max(1, shown.length))
    else if (e.key === 'ArrowUp') setActive((current - 1 + shown.length) % Math.max(1, shown.length))
    else if (e.key === 'Enter') go(shown[current])
    else return
    e.preventDefault()
  }
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent
        style={vars}
        showCloseButton={false}
        className="cmd-menu gap-0 overflow-hidden p-0 shadow-[shadow:var(--elevation-3)] sm:max-w-md"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Pages and projects. Arrows move, Enter opens.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            id={`cmd-${uid}`}
            className="cmd-input h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search pages and projects"
            role="combobox"
            aria-expanded
            aria-controls={`cmd-list-${uid}`}
            aria-activedescendant={shown.length ? `cmd-${uid}-${shown[current].id}` : undefined}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
          />
        </div>
        <ul id={`cmd-list-${uid}`} role="listbox" aria-label="results" className="max-h-72 overflow-y-auto p-1.5">
          {shown.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${uid}-${c.id}`}
              role="option"
              aria-selected={i === current}
              className="cmd-item flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              onPointerMove={() => setActive(i)}
              onClick={() => go(c)}
            >
              <span className="flex-1">{c.label}</span>
              <span className="text-xs">{c.group}</span>
              {i === current && <CornerDownLeft className="size-3.5" aria-hidden />}
            </li>
          ))}
          {shown.length === 0 && <li className="cmd-empty px-2.5 py-6 text-center text-sm">Nothing matches “{query}”.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------- invite people */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

/** Invite someone to the team: an email that has to be one, then a toast. */
export function InviteDialog({
  open,
  onOpenChange,
  uid,
  vars,
  onInvite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  uid: string
  vars: CSSProperties
  onInvite: (email: string) => void
}) {
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const valid = EMAIL_RE.test(email.trim())
  const close = (v: boolean) => {
    onOpenChange(v)
    if (!v) {
      setEmail('')
      setTouched(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => close(!!v)}>
      <DialogContent style={vars} className="invite-dialog shadow-[shadow:var(--elevation-3)]">
        <DialogHeader>
          <DialogTitle>Invite people to Acme Web</DialogTitle>
          <DialogDescription>They join as viewers. You can change their role in Settings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`invite-${uid}`}>Email</Label>
          <Input
            id={`invite-${uid}`}
            type="email"
            value={email}
            placeholder="name@acme.com"
            aria-invalid={touched && !valid}
            onBlur={() => setTouched(true)}
            onChange={(e) => setEmail(e.target.value)}
          />
          {touched && !valid && (
            <p className="invite-error text-xs text-destructive">
              {email.trim() ? `“${email.trim()}” is not a valid email address.` : 'Email is required.'}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            className="act-invite"
            disabled={!valid}
            title={valid ? `Invite ${email.trim()}` : 'Enter an email address first'}
            onClick={() => {
              onInvite(email.trim())
              close(false)
            }}
          >
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
