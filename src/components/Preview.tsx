import { useEffect, useMemo, useReducer, useState } from 'react'
import type { CSSProperties, Dispatch } from 'react'
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Check,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FolderKanban,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Plus,
  Rocket,
  ScrollText,
  Settings,
  Share,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TokenSpaceProps } from '../mockups'

export type ExportFormat = 'css' | 'tailwind' | 'json'

type Page = 'dashboard' | 'projects' | 'settings'
type Status = 'live' | 'degraded' | 'down' | 'queued' | 'deploying'
type Role = 'viewer' | 'editor' | 'admin'
type Level = 'ok' | 'info' | 'warn' | 'error'

interface Project {
  id: string
  owner: string
  uptime: string
  status: Status
}

interface Feed {
  id: number
  at: string
  level: Level
  text: string
}

interface Toast {
  id: number
  level: Level
  text: string
  /** Toasts that offer a way back — the only place `undo` lives. */
  action?: 'undo-archive' | 'undo-delete' | 'view-logs'
}

const NAV: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const SEED_PROJECTS: Project[] = [
  { id: 'marketing-site', owner: 'ana', uptime: '99.98%', status: 'live' },
  { id: 'billing-service', owner: 'drew', uptime: '97.20%', status: 'degraded' },
  { id: 'legacy-importer', owner: 'sam', uptime: '61.05%', status: 'down' },
  { id: 'docs-portal', owner: 'kai', uptime: '99.99%', status: 'live' },
]

/** Deploys are scripted, not random: split panes must agree on the outcome.
    The scripted failure is the project whose log fixture is already a failure,
    so "View logs" on the toast lands on the build it is talking about. */
const DEPLOY_FAILS = 'billing-service'
const TICK_MS = 110
const TICK_STEP = 20

const OWNERS = ['ana', 'drew', 'sam', 'kai'] as const

/** Traffic mix — the one place chart-4 and chart-5 get to speak. Fixed order,
    never cycled, and the shares sum to 100 so the stack fills the track. */
const TRAFFIC = [
  { label: 'Direct', share: 34, token: 'chart-1' },
  { label: 'Organic search', share: 27, token: 'chart-2' },
  { label: 'Referral', share: 18, token: 'chart-3' },
  { label: 'Social', share: 13, token: 'chart-4' },
  { label: 'Email', share: 8, token: 'chart-5' },
]

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 }
const PERMISSIONS: Array<{ label: string; min: Role }> = [
  { label: 'View projects and dashboards', min: 'viewer' },
  { label: 'Comment on a deploy', min: 'viewer' },
  { label: 'Deploy to staging', min: 'editor' },
  { label: 'Deploy to production', min: 'admin' },
  { label: 'Manage members and billing', min: 'admin' },
]

const TEAM_NAME = 'Acme Web'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

const SEED_FEED: Feed[] = [
  { id: -1, at: '09:42', level: 'ok', text: 'ana deployed marketing-site to production' },
  { id: -2, at: '09:31', level: 'warn', text: 'billing-service p95 latency above 400 ms' },
  { id: -3, at: '09:12', level: 'error', text: 'legacy-importer health check failed 3× in a row' },
  { id: -4, at: '08:58', level: 'info', text: 'kai opened “Rewrite the docs search index”' },
  { id: -5, at: '08:40', level: 'ok', text: 'Certificate renewed for docs-portal' },
]

/** Log bodies are fixtures, keyed by whatever opened the drawer. */
const LOGS: Record<string, { title: string; lines: Array<[Level, string, string]> }> = {
  report: {
    title: 'Production deploy · report',
    lines: [
      ['ok', '14:02:11', '42 of 42 checks passed'],
      ['info', '14:02:04', 'bundle 1.84 MB (−4.1% vs. previous)'],
      ['info', '14:01:47', 'lighthouse 98 / 100 / 100 / 92'],
      ['warn', '14:01:12', '2 images served without width & height'],
      ['info', '14:00:25', 'build finished in 47s'],
      ['ok', '13:59:38', 'dependencies restored from cache'],
    ],
  },
  failure: {
    title: 'billing-service · build #4821',
    lines: [
      ['error', '09:12:58', 'AssertionError: expected 200, received 502'],
      ['error', '09:12:58', '2 tests failed in billing-service/invoices'],
      ['warn', '09:11:40', 'retrying invoice-sync (attempt 2 of 3)'],
      ['info', '09:10:02', 'running 318 tests across 12 workers'],
      ['ok', '09:09:14', 'dependencies installed in 11s'],
    ],
  },
}

const logsFor = (key: string) =>
  LOGS[key] ?? {
    title: `${key} · last 24h`,
    lines: [
      ['ok', '14:20:03', `${key} responded 200 in 84 ms`],
      ['info', '14:19:55', 'scaled to 3 instances (cpu 71%)'],
      ['warn', '14:04:11', 'cache miss rate 38% — above the 25% budget'],
      ['info', '13:50:00', 'hourly snapshot written'],
      ['ok', '13:12:47', 'health check green'],
    ] as Array<[Level, string, string]>,
  }

interface Form {
  email: string
  role: Role
  notify: boolean
  digest: boolean
}

interface State {
  page: Page
  tab: string
  /** Project id whose detail page is open, else the list. */
  detail: string | null
  projects: Project[]
  selected: string[]
  filterStatus: 'all' | 'live' | 'degraded' | 'down'
  filterOwner: 'all' | string
  deploy: { queue: string[]; progress: number; total: number; failed: number } | null
  logKey: string | null
  feed: Feed[]
  /** Synthetic wall clock (minutes) so new feed rows are identical per pane. */
  clock: number
  toasts: Toast[]
  seq: number
  form: Form
  saved: Form
  saving: boolean
  deleting: boolean
  archiveUndo: Project[] | null
  /** Highlighted traffic source, or null for the whole mix. */
  source: string | null
}

const SEED_FORM: Form = { email: 'ana@acme.com', role: 'editor', notify: true, digest: true }

const INITIAL: State = {
  page: 'dashboard',
  tab: 'activity',
  detail: null,
  projects: SEED_PROJECTS,
  selected: [],
  filterStatus: 'all',
  filterOwner: 'all',
  deploy: null,
  logKey: null,
  feed: SEED_FEED,
  clock: 9 * 60 + 42,
  toasts: [],
  seq: 1,
  form: SEED_FORM,
  saved: SEED_FORM,
  saving: false,
  deleting: false,
  archiveUndo: null,
  source: null,
}

type Action =
  | { type: 'nav'; page: Page }
  | { type: 'tab'; tab: string }
  | { type: 'open'; id: string }
  | { type: 'close-detail' }
  | { type: 'toggle-row'; id: string }
  | { type: 'toggle-all'; ids: string[] }
  | { type: 'archive'; ids: string[] }
  | { type: 'filter'; key: 'status' | 'owner'; value: string }
  | { type: 'clear-filters' }
  | { type: 'deploy'; ids: string[] }
  | { type: 'tick' }
  | { type: 'logs'; key: string | null }
  | { type: 'create'; name: string }
  | { type: 'toast'; level: Level; text: string; action?: Toast['action'] }
  | { type: 'dismiss'; id: number }
  | { type: 'expire' }
  | { type: 'form'; patch: Partial<Form> }
  | { type: 'save' }
  | { type: 'saved' }
  | { type: 'revert' }
  | { type: 'delete-team' }
  | { type: 'keep-team' }
  | { type: 'undo' }
  | { type: 'source'; label: string | null }

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Every mutating action narrates itself into the feed, so the dashboard is a
    live record of what the other pages just did. */
function log(s: State, level: Level, text: string): State {
  const clock = s.clock + 7
  return {
    ...s,
    clock,
    seq: s.seq + 1,
    feed: [{ id: s.seq, at: hhmm(clock), level, text }, ...s.feed].slice(0, 8),
  }
}

function toast(s: State, level: Level, text: string, action?: Toast['action']): State {
  return { ...s, seq: s.seq + 1, toasts: [...s.toasts, { id: s.seq, level, text, action }].slice(-3) }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'nav':
      // The drawer belongs to the page that opened it, so leaving closes it.
      return { ...state, page: action.page, detail: null, logKey: null }
    case 'tab':
      return { ...state, tab: action.tab }
    case 'open':
      return { ...state, page: 'projects', detail: action.id }
    case 'close-detail':
      return { ...state, detail: null }
    case 'toggle-row':
      return {
        ...state,
        selected: state.selected.includes(action.id)
          ? state.selected.filter((id) => id !== action.id)
          : [...state.selected, action.id],
      }
    case 'toggle-all': {
      const all = action.ids.every((id) => state.selected.includes(id))
      return {
        ...state,
        selected: all
          ? state.selected.filter((id) => !action.ids.includes(id))
          : [...new Set([...state.selected, ...action.ids])],
      }
    }
    case 'archive': {
      const kept = state.projects.filter((p) => !action.ids.includes(p.id))
      const next = { ...state, projects: kept, selected: [], archiveUndo: state.projects }
      const label = `${action.ids.length} project${action.ids.length === 1 ? '' : 's'}`
      return toast(log(next, 'info', `Archived ${label}`), 'info', `Archived ${label}`, 'undo-archive')
    }
    case 'filter':
      return action.key === 'status'
        ? { ...state, filterStatus: action.value as State['filterStatus'] }
        : { ...state, filterOwner: action.value }
    case 'clear-filters':
      return { ...state, filterStatus: 'all', filterOwner: 'all' }
    case 'deploy': {
      const queued = new Set(action.ids)
      return log(
        {
          ...state,
          deploy: { queue: action.ids, progress: 0, total: action.ids.length, failed: 0 },
          projects: state.projects.map((p) => (queued.has(p.id) ? { ...p, status: 'queued' } : p)),
        },
        'info',
        `Deploy started for ${action.ids.length} project${action.ids.length === 1 ? '' : 's'}`,
      )
    }
    case 'tick': {
      if (!state.deploy) return state
      const run = state.deploy
      const [head, ...rest] = run.queue
      const progress = run.progress + TICK_STEP
      if (progress < 100) return { ...state, deploy: { ...run, progress } }
      const broke = head === DEPLOY_FAILS
      const failed = run.failed + (broke ? 1 : 0)
      const settled: State = {
        ...state,
        projects: state.projects.map((p) =>
          p.id === head ? { ...p, status: broke ? 'down' : 'live' } : p,
        ),
        deploy: rest.length ? { ...run, queue: rest, progress: 0, failed } : null,
      }
      const noted = log(
        settled,
        broke ? 'error' : 'ok',
        broke ? `${head} failed to deploy — 2 test errors` : `${head} deployed to production`,
      )
      if (rest.length) return noted
      return failed
        ? toast(noted, 'error', `${failed} of ${run.total} deploys failed`, 'view-logs')
        : toast(noted, 'ok', `${run.total} project${run.total === 1 ? '' : 's'} deployed`)
    }
    case 'logs':
      return { ...state, logKey: action.key }
    case 'create': {
      const id = action.name.trim().toLowerCase().replace(/\s+/g, '-')
      if (state.projects.some((p) => p.id === id)) {
        return toast(state, 'warn', `${id} already exists`)
      }
      const next: State = {
        ...state,
        page: 'projects',
        detail: null,
        projects: [...state.projects, { id, owner: 'you', uptime: '—', status: 'queued' }],
      }
      return toast(log(next, 'ok', `Created ${id}`), 'ok', `Created ${id}`)
    }
    case 'toast':
      return toast(state, action.level, action.text, action.action)
    case 'dismiss':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }
    case 'expire': {
      // Only the ones with nothing to click time out; a toast holding the undo
      // for a destructive action waits for the user.
      const doomed = state.toasts.find((t) => !t.action)
      return doomed ? { ...state, toasts: state.toasts.filter((t) => t !== doomed) } : state
    }
    case 'form':
      return { ...state, form: { ...state.form, ...action.patch } }
    case 'save':
      return { ...state, saving: true }
    case 'saved': {
      const next: State = { ...state, saving: false, saved: state.form }
      return toast(log(next, 'ok', 'Team settings saved'), 'ok', 'Team settings saved')
    }
    case 'revert':
      return { ...state, form: state.saved }
    case 'delete-team':
      return toast(
        log({ ...state, deleting: true }, 'error', `${TEAM_NAME} scheduled for deletion`),
        'error',
        `${TEAM_NAME} will be deleted in 30 days`,
        'undo-delete',
      )
    case 'keep-team':
      return toast(log({ ...state, deleting: false }, 'ok', 'Deletion cancelled'), 'ok', 'Deletion cancelled')
    case 'undo': {
      const t = state.toasts[state.toasts.length - 1]
      if (t?.action === 'undo-delete') {
        return toast(
          { ...state, deleting: false, toasts: state.toasts.filter((x) => x.id !== t.id) },
          'ok',
          'Deletion cancelled',
        )
      }
      if (t?.action === 'undo-archive' && state.archiveUndo) {
        return toast(
          {
            ...state,
            projects: state.archiveUndo,
            archiveUndo: null,
            toasts: state.toasts.filter((x) => x.id !== t.id),
          },
          'ok',
          'Restored',
        )
      }
      return state
    }
    case 'source':
      return { ...state, source: action.label }
  }
}

/**
 * A dense fake app built from real shadcn/ui components, rendered entirely
 * from the generated CSS variables — the visual test bench for the algorithm.
 * Every control in here does something you can see: the mockup is only useful
 * as a palette judgment if the states it paints (selected, pending, invalid,
 * disabled, failing) are reachable. `vars` is also passed to portaled content
 * (dialogs, menus, selects) because portals mount outside this wrapper — and
 * it carries the `--elevation-*` / `--scrim` effects alongside the tokens for
 * exactly the same reason: a portaled menu whose subtree never saw
 * `--elevation-2` renders with no shadow at all and nothing says so.
 *
 * Elevation is assigned by what a surface *means*, never by taste:
 * level 1 rests (cards, stat tiles), level 2 is summoned (menus, selects,
 * toasts), level 3 takes over (dialogs, the log drawer). It is strictly
 * additive — every surface here keeps the border or ring that already
 * separated it, because `separation: 'flat'` makes `--elevation-1` literally
 * `none` and pays for the difference in hairlines instead.
 */
export function Preview({ tokens, mode, uid, effects }: TokenSpaceProps) {
  const vars = {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
    ...effects,
  } as CSSProperties
  const [s, dispatch] = useReducer(reducer, INITIAL)

  // Deploys advance on a timer; the effect re-arms off the deploy object, so a
  // finished run (deploy === null) simply stops scheduling.
  useEffect(() => {
    if (!s.deploy) return
    const t = setTimeout(() => dispatch({ type: 'tick' }), TICK_MS)
    return () => clearTimeout(t)
  }, [s.deploy])

  useEffect(() => {
    if (!s.saving) return
    const t = setTimeout(() => dispatch({ type: 'saved' }), 650)
    return () => clearTimeout(t)
  }, [s.saving])

  useEffect(() => {
    if (!s.toasts.some((t) => !t.action)) return
    const t = setTimeout(() => dispatch({ type: 'expire' }), 6000)
    return () => clearTimeout(t)
  }, [s.toasts])

  const running = !!s.deploy
  const visible = useMemo(
    () =>
      s.projects.filter(
        (p) =>
          // A row mid-deploy keeps its seat: a status filter must not make the
          // thing you just launched vanish out from under the progress bar.
          (s.filterStatus === 'all' ||
            p.status === s.filterStatus ||
            (running && p.status === 'queued')) &&
          (s.filterOwner === 'all' || p.owner === s.filterOwner),
      ),
    [s.projects, s.filterStatus, s.filterOwner, running],
  )
  // Selection only ever means "selected *and* on screen" — a filter must never
  // arm a destructive button with rows the user can't see.
  const picked = visible.filter((p) => s.selected.includes(p.id)).map((p) => p.id)
  const filters = (s.filterStatus === 'all' ? 0 : 1) + (s.filterOwner === 'all' ? 0 : 1)
  const emailError =
    s.form.email !== s.saved.email && !EMAIL_RE.test(s.form.email)
      ? s.form.email.trim() === ''
        ? 'Email is required.'
        : `“${s.form.email}” is not a valid email address.`
      : null
  const dirty =
    s.form.email !== s.saved.email ||
    s.form.role !== s.saved.role ||
    s.form.notify !== s.saved.notify ||
    s.form.digest !== s.saved.digest

  return (
    <div
      className={`preview-root relative flex min-h-[680px] overflow-hidden bg-background text-sm text-foreground ${mode === 'dark' ? 'dark' : ''}`}
      style={vars}
    >
      {/* rail */}
      <div className="flex w-44 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
        <div className="mb-4 px-2 text-base font-bold text-sidebar-primary">Acme</div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ id, label: navLabel, icon: Icon }) => (
            <button
              key={id}
              onClick={() => dispatch({ type: 'nav', page: id })}
              aria-current={s.page === id ? 'page' : undefined}
              /* The sidebar owns its own focus color: `ring` is tuned against
                 `background`, and would go invisible on the rail. */
              className={`nav-item flex items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                s.page === id
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icon className="size-4" />
              {navLabel}
              {id === 'projects' && (
                <span className="ml-auto text-xs tabular-nums opacity-70">{s.projects.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted-foreground">v2.4.1</div>
      </div>

      {/* main */}
      {/* A container, not a viewport: split view halves this column and the
          stat tiles have to reflow off *its* width, not the window's. */}
      <div className="@container flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <header className="flex items-center justify-between">
          <strong className="text-base capitalize">{s.page}</strong>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  /* Secondary action in the accent's voice: accent outline +
                     accent text on transparent — both solver-backed tokens. */
                  <Button
                    variant="outline"
                    size="sm"
                    className="act-export border-accent-strong bg-transparent text-link hover:bg-accent hover:text-link aria-expanded:bg-accent aria-expanded:text-link dark:border-accent-strong dark:bg-transparent dark:hover:bg-accent"
                  >
                    <Share className="size-4" /> Export
                  </Button>
                }
              />
              {/* Level 2: summoned by the user, dismissed by the user. The
                  style carries the effects as well as the tokens — a portal
                  mounts outside .preview-root, so `--elevation-2` would be
                  undefined here and the menu would paint no shadow at all.

                  The `shadow:` type hint is load-bearing, not decoration.
                  `shadow-[var(…)]` compiles fine, but tailwind-merge cannot
                  tell a bare `var()` from a shadow *colour*, so it leaves the
                  primitive's own `shadow-md` in the class list — and Tailwind
                  emits `.shadow-md` last, so the hardcoded shadow silently
                  wins. `shadow-[shadow:var(…)]` lands in the shadow group and
                  evicts it. Same reason every elevation class in this file
                  carries the hint. */}
              <DropdownMenuContent style={vars} className="shadow-[shadow:var(--elevation-2)]">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Export as</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="export-pdf"
                    onClick={() =>
                      dispatch({ type: 'toast', level: 'ok', text: 'Report exported as PDF' })
                    }
                  >
                    PDF report
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="export-csv"
                    onClick={() =>
                      dispatch({
                        type: 'toast',
                        level: 'ok',
                        text: `${visible.length} rows exported to CSV`,
                      })
                    }
                  >
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="export-share"
                    onClick={() =>
                      dispatch({
                        type: 'toast',
                        level: 'info',
                        text: 'Share link copied — expires in 7 days',
                      })
                    }
                  >
                    Share link
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <NewProjectDialog
              uid={uid}
              vars={vars}
              taken={s.projects.map((p) => p.id)}
              onCreate={(name) => dispatch({ type: 'create', name })}
            />
          </div>
        </header>

        {s.page === 'dashboard' && (
          <>
            <Alert className="border-success bg-success-subtle text-success-subtle-foreground">
              <AlertTitle>Deploy succeeded</AlertTitle>
              <AlertDescription className="text-success-subtle-foreground/90">
                All 42 checks passed on production.{' '}
                <button
                  onClick={() => dispatch({ type: 'logs', key: 'report' })}
                  className="banner-action act-view-report cursor-pointer font-medium text-link underline decoration-link/40 underline-offset-2 outline-none hover:decoration-link focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View report
                </button>
              </AlertDescription>
            </Alert>
            <Alert className="flex items-center justify-between border-warning bg-warning-subtle text-warning-subtle-foreground">
              <AlertTitle>Certificate expires in 12 days</AlertTitle>
              {/* Deliberately dead: renewal is the registrar's job, so the
                  button states that instead of pretending to work. */}
              <Button
                size="sm"
                variant="outline"
                disabled
                aria-disabled
                title="Renewal is handled by your DNS provider — nothing to do here"
                className="border-warning bg-transparent text-warning-subtle-foreground"
              >
                Renew now
              </Button>
            </Alert>

            <div className="grid grid-cols-3 gap-3">
              {[
                ['Revenue', '$48,210', '+4.2%', 'chart-1'],
                ['Active users', '3,842', '+12.1%', 'chart-2'],
                ['Churn', '2.1%', '-0.4%', 'chart-3'],
              ].map(([title, value, delta, chart]) => (
                /* Level 1: a stat tile is a resting raised surface. The ring
                   the Card already carries stays — under `flat` it is the
                   only thing separating the tile from the page. */
                <Card key={title} className="stat-tile shadow-[shadow:var(--elevation-1)]">
                  <CardHeader>
                    <CardDescription>{title}</CardDescription>
                    <CardTitle className="text-xl @2xl:text-2xl">{value}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Chart marks follow the corners setting down to sharp
                        but never past today's 6px: at round, a short bar's
                        top would become a half-circle and stop reading as a
                        value. Same cap on every chart mark in the mockups. */}
                    <div className="flex h-9 items-end gap-1">
                      {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t-[min(var(--radius)*0.6,6px)]"
                          style={{ height: `${h}%`, background: `var(--${chart})` }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{delta} vs. last month</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <TrafficCard source={s.source} onSource={(label) => dispatch({ type: 'source', label })} />

            {/* Selection speaks in the accent's voice, not the brand's: the
                active tab carries an accent-strong indicator bar. */}
            <Tabs value={s.tab} onValueChange={(v) => dispatch({ type: 'tab', tab: String(v) })}>
              <TabsList>
                <TabsTrigger value="activity" className="tab-activity">
                  <BarChart3 className="size-4" /> Activity
                  {s.tab === 'activity' && <TabIndicator />}
                </TabsTrigger>
                <TabsTrigger value="alerts" className="tab-alerts">
                  Alerts
                  {s.tab === 'alerts' && <TabIndicator />}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="activity">
                <Card className="activity-card shadow-[shadow:var(--elevation-1)]">
                  <CardHeader>
                    <CardTitle>Activity</CardTitle>
                    <CardDescription>Everything the team did today.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="feed flex flex-col">
                      {s.feed.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-2 border-b border-border py-1.5 last:border-0"
                        >
                          <LevelDot level={f.level} />
                          <span className="min-w-0 flex-1 truncate">{f.text}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {f.at}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="alerts">
                <Alert className="border-destructive bg-destructive-subtle text-destructive-subtle-foreground">
                  <AlertTitle>Build failed on main</AlertTitle>
                  <AlertDescription className="text-destructive-subtle-foreground/90">
                    2 test errors in billing-service.{' '}
                    <button
                      onClick={() => dispatch({ type: 'logs', key: 'failure' })}
                      className="banner-action act-view-logs cursor-pointer font-medium underline decoration-current/40 underline-offset-2 outline-none hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      View logs
                    </button>
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>
          </>
        )}

        {s.page === 'projects' &&
          (s.detail ? (
            <ProjectDetail
              project={s.projects.find((p) => p.id === s.detail)}
              deploying={!!s.deploy}
              progress={s.deploy?.queue[0] === s.detail ? s.deploy.progress : null}
              dispatch={dispatch}
            />
          ) : (
            <Card className="projects-card shadow-[shadow:var(--elevation-1)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="grid gap-1">
                  <CardTitle>All projects</CardTitle>
                  <CardDescription>
                    {picked.length > 0
                      ? `${picked.length} of ${visible.length} selected`
                      : `${visible.length} of ${s.projects.length} shown`}
                  </CardDescription>
                </div>
                <FilterMenu
                  vars={vars}
                  count={filters}
                  status={s.filterStatus}
                  owner={s.filterOwner}
                  dispatch={dispatch}
                />
              </CardHeader>
              <CardContent>
                <ProjectTable
                  uid={uid}
                  rows={visible}
                  selected={s.selected}
                  deploy={s.deploy}
                  filtered={filters > 0}
                  dispatch={dispatch}
                />
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    className="act-deploy"
                    disabled={!!s.deploy || visible.length === 0}
                    title={
                      s.deploy
                        ? 'A deploy is already running'
                        : visible.length === 0
                          ? 'Nothing matches the current filter'
                          : `Deploy the ${visible.length} projects in view`
                    }
                    onClick={() => dispatch({ type: 'deploy', ids: visible.map((p) => p.id) })}
                  >
                    {s.deploy ? (
                      <LoaderCircle className="size-4 motion-safe:animate-spin" />
                    ) : (
                      <Rocket className="size-4" />
                    )}
                    {s.deploy ? `Deploying ${s.deploy.queue.length} left` : `Deploy all (${visible.length})`}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="act-archive"
                    disabled={picked.length === 0 || !!s.deploy}
                    title={
                      picked.length === 0
                        ? 'Select at least one project to archive'
                        : `Archive ${picked.length} selected`
                    }
                    onClick={() => dispatch({ type: 'archive', ids: picked })}
                  >
                    <Archive className="size-4" />
                    {picked.length === 0 ? 'Archive selected' : `Archive selected (${picked.length})`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

        {s.page === 'settings' && (
          <div className="grid max-w-md gap-3">
            {s.deleting && (
              <Alert className="flex items-center justify-between border-destructive bg-destructive-subtle text-destructive-subtle-foreground">
                <div>
                  <AlertTitle>Team scheduled for deletion</AlertTitle>
                  <AlertDescription className="text-destructive-subtle-foreground/90">
                    {TEAM_NAME} and its {s.projects.length} projects go in 30 days.
                  </AlertDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="restore-team border-destructive bg-transparent text-destructive-subtle-foreground"
                  onClick={() => dispatch({ type: 'keep-team' })}
                >
                  <Undo2 className="size-4" /> Keep it
                </Button>
              </Alert>
            )}
            <Card className="settings-card shadow-[shadow:var(--elevation-1)]">
              <CardHeader>
                <CardTitle>Team settings</CardTitle>
                <CardDescription>Invite teammates and set defaults.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor={`email-${uid}`}>Email</Label>
                  <Input
                    id={`email-${uid}`}
                    value={s.form.email}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? `email-err-${uid}` : undefined}
                    placeholder="name@example.com"
                    onChange={(e) => dispatch({ type: 'form', patch: { email: e.target.value } })}
                  />
                  {emailError ? (
                    <p
                      id={`email-err-${uid}`}
                      className="field-error flex items-center gap-1.5 text-xs text-destructive"
                    >
                      <CircleAlert className="size-3.5 shrink-0" />
                      {emailError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Deploy notices go here.
                    </p>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label>Role</Label>
                  <Select
                    value={s.form.role}
                    onValueChange={(v) => dispatch({ type: 'form', patch: { role: v as Role } })}
                  >
                    <SelectTrigger className="role-select w-full">
                      {/* The trigger echoes the raw value, so title-case it here
                          rather than shipping capitalised values into state. */}
                      <SelectValue className="capitalize" />
                    </SelectTrigger>
                    {/* Level 2, portaled — same contract as the menus. */}
                    <SelectContent style={vars} className="shadow-[shadow:var(--elevation-2)]">
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <ul className="perms mt-1 grid gap-1">
                    {PERMISSIONS.map((p) => {
                      const allowed = RANK[s.form.role] >= RANK[p.min]
                      return (
                        <li
                          key={p.label}
                          data-allowed={allowed}
                          /* Granted vs. withheld is the cleanest success/muted
                             pairing in the app — it flips five rows at once. */
                          className={`flex items-center gap-1.5 text-xs ${
                            allowed ? 'text-success-subtle-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {allowed ? (
                            <Check className="size-3.5 shrink-0 text-success-strong" />
                          ) : (
                            <X className="size-3.5 shrink-0" />
                          )}
                          {p.label}
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`notif-${uid}`}>Email notifications</Label>
                    <Switch
                      id={`notif-${uid}`}
                      checked={s.form.notify}
                      onCheckedChange={(v) => dispatch({ type: 'form', patch: { notify: !!v } })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`digest-${uid}`}
                      checked={s.form.notify && s.form.digest}
                      disabled={!s.form.notify}
                      title={s.form.notify ? undefined : 'Turn email notifications on first'}
                      onCheckedChange={(v) => dispatch({ type: 'form', patch: { digest: !!v } })}
                    />
                    <Label
                      htmlFor={`digest-${uid}`}
                      title={s.form.notify ? undefined : 'Turn email notifications on first'}
                      className={s.form.notify ? 'text-muted-foreground' : 'text-muted-foreground opacity-50'}
                    >
                      Include the weekly digest
                    </Label>
                  </div>
                  <p className="notify-summary text-xs text-muted-foreground">
                    {s.form.notify
                      ? `We'll email ${s.form.email || 'you'} on failed deploys${
                          s.form.digest ? ', plus a digest every Monday' : ''
                        }.`
                      : 'Notifications are off — failures show up in-app only.'}
                  </p>
                </div>

                <Separator />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="act-cancel"
                    disabled={!dirty || s.saving}
                    title={dirty ? 'Discard your changes' : 'Nothing changed yet'}
                    onClick={() => dispatch({ type: 'revert' })}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="act-save"
                    disabled={!dirty || !!emailError || s.saving}
                    title={
                      emailError
                        ? 'Fix the email address first'
                        : dirty
                          ? 'Save your changes'
                          : 'Nothing changed yet'
                    }
                    onClick={() => dispatch({ type: 'save' })}
                  >
                    {s.saving && <LoaderCircle className="size-4 motion-safe:animate-spin" />}
                    {s.saving ? 'Saving…' : 'Save changes'}
                  </Button>
                  <DeleteTeamDialog
                    uid={uid}
                    vars={vars}
                    count={s.projects.length}
                    onConfirm={() => dispatch({ type: 'delete-team' })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {s.logKey && <LogDrawer logKey={s.logKey} onClose={() => dispatch({ type: 'logs', key: null })} />}

      {/* Toasts step aside for the drawer instead of stacking on top of it. */}
      <ToastStack toasts={s.toasts} shifted={!!s.logKey} dispatch={dispatch} />
    </div>
  )
}

/** Accent underline marking the selected tab (TabsTrigger is `relative`). */
function TabIndicator() {
  return (
    <span
      aria-hidden
      className="tab-accent-indicator pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent-strong"
    />
  )
}

/**
 * Status/severity in one glyph. Reserved status colors, never series colors —
 * and the -strong marks, not the fills: a fill is solved to carry its own
 * label, so the warning fill sat near 1.3:1 on a light page, and at raised
 * contrast the danger and success fills sink into a dark one.
 */
function LevelDot({ level }: { level: Level }) {
  const tone =
    level === 'ok'
      ? 'bg-success-strong'
      : level === 'warn'
        ? 'bg-warning-strong'
        : level === 'error'
          ? 'bg-destructive-strong'
          : 'bg-muted-foreground'
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone}`} />
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'live') return <Badge className="bg-success text-success-foreground">live</Badge>
  if (status === 'degraded')
    return <Badge className="bg-warning text-warning-foreground">degraded</Badge>
  if (status === 'down') return <Badge variant="destructive">down</Badge>
  // In-flight isn't a *status* color — it borrows the accent, and as text it
  // has to use `link` (accent-strong is a mark color, with no paired ink).
  if (status === 'deploying')
    return (
      <Badge variant="outline" className="border-accent-strong text-link">
        deploying
      </Badge>
    )
  return <Badge variant="secondary">queued</Badge>
}

/**
 * The traffic mix. One stacked bar (magnitude that sums to a whole) with a
 * legend — identity is never carried by color alone, and picking a source
 * direct-labels it instead of repainting the others.
 */
function TrafficCard({
  source,
  onSource,
}: {
  source: string | null
  onSource: (label: string | null) => void
}) {
  const active = TRAFFIC.find((t) => t.label === source)
  return (
    <Card className="traffic-card shadow-[shadow:var(--elevation-1)]" size="sm">
      <CardHeader className="flex flex-row items-end justify-between">
        <div className="grid gap-1">
          <CardDescription>{active ? active.label : 'Traffic by source'}</CardDescription>
          <CardTitle className="text-xl tabular-nums @2xl:text-2xl">
            {active ? `${active.share}%` : '12,904'}
          </CardTitle>
        </div>
        <span className="text-xs text-muted-foreground">
          {active ? 'click again for the full mix' : 'last 7 days'}
        </span>
      </CardHeader>
      <CardContent className="grid gap-2">
        {/* 2px surface gaps keep adjacent hues from fusing into one band. */}
        <div className="traffic-bar flex h-2.5 gap-0.5">
          {TRAFFIC.map((t) => (
            <div
              key={t.label}
              title={`${t.label} — ${t.share}%`}
              className="rounded-full motion-safe:transition-opacity"
              style={{
                flex: `${t.share} 0 0`,
                background: `var(--${t.token})`,
                opacity: source && source !== t.label ? 0.25 : 1,
              }}
            />
          ))}
        </div>
        {/* Identity never rides on color alone: every series is named here. */}
        <ul className="traffic-legend flex flex-wrap gap-x-4 gap-y-1">
          {TRAFFIC.map((t) => (
            <li key={t.label}>
              <button
                onClick={() => onSource(source === t.label ? null : t.label)}
                aria-pressed={source === t.label}
                className={`traffic-key flex items-center gap-1.5 rounded-sm text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  source === t.label ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[min(var(--radius)*0.2,2px)]"
                  style={{ background: `var(--${t.token})` }}
                />
                {t.label}
                <span className="tabular-nums opacity-70">{t.share}%</span>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function FilterMenu({
  vars,
  count,
  status,
  owner,
  dispatch,
}: {
  vars: CSSProperties
  count: number
  status: string
  owner: string
  dispatch: Dispatch<Action>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="secondary" size="sm" className="act-filter">
            <ListFilter className="size-4" /> Filter
            {count > 0 && (
              <span className="filter-count ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                {count}
              </span>
            )}
          </Button>
        }
      />
      {/* The labels live *inside* their radio group — Base UI's GroupLabel
          reads a group context and throws when it can't find one. */}
      <DropdownMenuContent
        style={vars}
        align="end"
        className="w-40 shadow-[shadow:var(--elevation-2)]"
      >
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(v) => dispatch({ type: 'filter', key: 'status', value: String(v) })}
        >
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {['all', 'live', 'degraded', 'down'].map((v) => (
            <DropdownMenuRadioItem key={v} value={v} closeOnClick={false} className={`fs-${v}`}>
              {v === 'all' ? 'Any status' : v}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={owner}
          onValueChange={(v) => dispatch({ type: 'filter', key: 'owner', value: String(v) })}
        >
          <DropdownMenuLabel>Owner</DropdownMenuLabel>
          {['all', ...OWNERS].map((v) => (
            <DropdownMenuRadioItem key={v} value={v} closeOnClick={false} className={`fo-${v}`}>
              {v === 'all' ? 'Anyone' : v}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="act-clear-filters"
          disabled={count === 0}
          onClick={() => dispatch({ type: 'clear-filters' })}
        >
          Clear filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectTable({
  uid,
  rows,
  selected,
  deploy,
  filtered,
  dispatch,
}: {
  uid: string
  rows: Project[]
  selected: string[]
  deploy: State['deploy']
  filtered: boolean
  dispatch: Dispatch<Action>
}) {
  const ids = rows.map((r) => r.id)
  const allPicked = ids.length > 0 && ids.every((id) => selected.includes(id))
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox
              id={`all-${uid}`}
              aria-label="Select every project in view"
              checked={allPicked}
              disabled={ids.length === 0}
              onCheckedChange={() => dispatch({ type: 'toggle-all', ids })}
            />
          </TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          {/* Owner and uptime are the first to go when the pane narrows —
              split view halves the column and the table must not scroll. */}
          <TableHead className="hidden @xl:table-cell">Owner</TableHead>
          <TableHead className="hidden text-right @lg:table-cell">Uptime</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              {filtered ? (
                <>
                  No projects match this filter.{' '}
                  <button
                    onClick={() => dispatch({ type: 'clear-filters' })}
                    className="cursor-pointer text-link underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                'Nothing here yet.'
              )}
            </TableCell>
          </TableRow>
        )}
        {rows.map((row) => {
          const isPicked = selected.includes(row.id)
          const running = deploy?.queue[0] === row.id
          const status: Status = running ? 'deploying' : row.status
          return (
            <TableRow
              key={row.id}
              data-state={isPicked ? 'selected' : undefined}
              /* A selected row wears the accent *wash* plus an accent-strong
                 edge — the wash alone is too quiet to read as a state. */
              className="group/row data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground"
            >
              <TableCell className="w-8 border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-accent-strong">
                <Checkbox
                  id={`row-${row.id}-${uid}`}
                  aria-label={`Select ${row.id}`}
                  checked={isPicked}
                  onCheckedChange={() => dispatch({ type: 'toggle-row', id: row.id })}
                />
              </TableCell>
              <TableCell className="font-medium">
                <button
                  onClick={() => dispatch({ type: 'open', id: row.id })}
                  className="project-link cursor-pointer rounded-sm text-link underline decoration-link/40 underline-offset-2 outline-none hover:decoration-link focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {row.id}
                </button>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <StatusBadge status={status} />
                  {running && deploy && (
                    <div className="row-progress h-1 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent-strong motion-safe:transition-[width] motion-safe:duration-100"
                        style={{ width: `${deploy.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden @xl:table-cell">{row.owner}</TableCell>
              <TableCell className="hidden text-right tabular-nums text-muted-foreground @lg:table-cell">
                {row.uptime}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function ProjectDetail({
  project,
  deploying,
  progress,
  dispatch,
}: {
  project: Project | undefined
  deploying: boolean
  progress: number | null
  dispatch: Dispatch<Action>
}) {
  if (!project) {
    return (
      <Card className="shadow-[shadow:var(--elevation-1)]">
        <CardContent className="py-6 text-muted-foreground">
          That project was archived.{' '}
          <button
            onClick={() => dispatch({ type: 'close-detail' })}
            className="cursor-pointer text-link underline underline-offset-2"
          >
            Back to all projects
          </button>
        </CardContent>
      </Card>
    )
  }
  const history: Array<[Level, string, string]> = [
    ['ok', '14:02', 'production · 42 checks'],
    ['warn', '11:20', 'staging · 2 warnings'],
    ['ok', '09:41', 'production · 42 checks'],
    ['error', '08:03', 'staging · build failed'],
  ]
  return (
    <Card className="project-detail shadow-[shadow:var(--elevation-1)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="grid gap-1">
          <button
            onClick={() => dispatch({ type: 'close-detail' })}
            className="detail-back flex w-fit cursor-pointer items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" /> All projects
          </button>
          <CardTitle className="flex items-center gap-2">
            {project.id} <StatusBadge status={progress !== null ? 'deploying' : project.status} />
          </CardTitle>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={deploying}
            title={deploying ? 'A deploy is already running' : `Deploy ${project.id}`}
            onClick={() => dispatch({ type: 'deploy', ids: [project.id] })}
          >
            <Rocket className="size-4" /> Deploy
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => dispatch({ type: 'logs', key: project.id })}
          >
            <ScrollText className="size-4" /> View logs
          </Button>
          {/* No network in a mockup — say so rather than open a dead tab. */}
          <Button
            size="sm"
            variant="ghost"
            disabled
            aria-disabled
            title="External links are stubbed in this preview"
          >
            <ExternalLink className="size-4" /> Open site
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {progress !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent-strong motion-safe:transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Owner', project.owner],
            ['Uptime, 30d', project.uptime],
            ['Region', 'eu-west-1'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-2">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="font-medium">{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Recent deploys</div>
          <ul className="grid">
            {history.map(([level, at, text]) => (
              <li
                key={at}
                className="flex items-center gap-2 border-b border-border py-1.5 last:border-0"
              >
                <LevelDot level={level} />
                <span className="flex-1">{text}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{at}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The log drawer docks over the main column instead of portaling: it belongs to
 * the fake app's window, not the page. Level 3 — it is a slide-over that takes
 * the frame's right edge — but deliberately *no* scrim: it does not block
 * interaction. The app behind it stays live (the toast stack shifts aside
 * rather than being covered), and a scrim would claim a modality this drawer
 * does not have. The `border-l` still does the separating under `flat`.
 */
function LogDrawer({ logKey, onClose }: { logKey: string; onClose: () => void }) {
  const { title, lines } = logsFor(logKey)
  const tone: Record<Level, string> = {
    ok: 'text-success',
    info: 'text-muted-foreground',
    // The warning TEXT step, not the fill: the fill lightens at raised contrast
    // levels to carry its own dark label, which would fade a line drawn in it.
    warn: 'text-warning-subtle-foreground',
    error: 'text-destructive',
  }
  return (
    <aside
      className="log-drawer absolute inset-y-0 right-0 z-30 flex w-72 max-w-[60%] flex-col border-l border-border bg-card text-card-foreground shadow-[shadow:var(--elevation-3)] motion-safe:animate-in motion-safe:slide-in-from-right-4 motion-safe:duration-150"
      aria-label="Logs"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ScrollText className="size-4 shrink-0 text-muted-foreground" />
          <strong className="truncate text-sm">{title}</strong>
        </div>
        <Button size="icon-sm" variant="ghost" className="drawer-close" onClick={onClose} title="Close logs">
          <X className="size-4" />
          <span className="sr-only">Close logs</span>
        </Button>
      </div>
      <ul className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-5">
        {lines.map(([level, at, text], i) => (
          <li key={i} data-level={level} className="log-line flex gap-2">
            <span className="shrink-0 text-muted-foreground">{at}</span>
            <span className={`w-10 shrink-0 uppercase ${tone[level]}`}>{level}</span>
            <span className={level === 'info' ? 'text-foreground' : tone[level]}>{text}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {lines.length} lines · live tail
      </div>
    </aside>
  )
}

function ToastStack({
  toasts,
  shifted,
  dispatch,
}: {
  toasts: Toast[]
  shifted: boolean
  dispatch: Dispatch<Action>
}) {
  if (toasts.length === 0) return null
  return (
    <div
      className={`toast-stack absolute bottom-3 z-40 flex w-72 flex-col gap-2 ${
        shifted ? 'right-[19.5rem]' : 'right-3'
      }`}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          /* Level 2: a toast is transient and floats over the page without
             taking it over — the same weight a menu gets, not a dialog's. */
          className="app-toast flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-[shadow:var(--elevation-2)] motion-safe:animate-in motion-safe:slide-in-from-bottom-2"
        >
          {t.level === 'ok' ? (
            <CircleCheck className="size-4 shrink-0 text-success-strong" />
          ) : t.level === 'error' ? (
            <CircleAlert className="size-4 shrink-0 text-destructive-strong" />
          ) : t.level === 'warn' ? (
            <TriangleAlert className="size-4 shrink-0 text-warning-strong" />
          ) : (
            <Archive className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 text-xs">{t.text}</span>
          {t.action === 'view-logs' && (
            <Button
              size="xs"
              variant="outline"
              className="toast-action"
              onClick={() => dispatch({ type: 'logs', key: 'failure' })}
            >
              Logs
            </Button>
          )}
          {(t.action === 'undo-archive' || t.action === 'undo-delete') && (
            <Button size="xs" variant="outline" className="toast-action" onClick={() => dispatch({ type: 'undo' })}>
              <Undo2 className="size-3" /> Undo
            </Button>
          )}
          <button
            onClick={() => dispatch({ type: 'dismiss', id: t.id })}
            title="Dismiss"
            className="cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      ))}
    </div>
  )
}

function NewProjectDialog({
  uid,
  vars,
  taken,
  onCreate,
}: {
  uid: string
  vars: CSSProperties
  taken: string[]
  onCreate: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-')
  const clash = slug !== '' && taken.includes(slug)
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(!!v)
        if (!v) setName('')
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" className="act-new">
            <Plus className="size-4" /> New project
          </Button>
        }
      />
      {/* Level 3: a modal takes over the frame. Portaled, so the effects ride
          along in `style` beside the tokens. The scrim behind it belongs to
          the primitive's own Backdrop, which this file cannot reach — see the
          note on DeleteTeamDialog. */}
      <DialogContent style={vars} className="shadow-[shadow:var(--elevation-3)]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Give it a name — you can change everything later.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`np-${uid}`}>Project name</Label>
          <Input
            id={`np-${uid}`}
            value={name}
            aria-invalid={clash}
            placeholder="acme-website"
            onChange={(e) => setName(e.target.value)}
          />
          <p className={`text-xs ${clash ? 'text-destructive' : 'text-muted-foreground'}`}>
            {clash ? `${slug} already exists.` : slug ? `Deploys to ${slug}.acme.dev` : 'Lowercase, no spaces.'}
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            className="act-create"
            disabled={slug === '' || clash}
            title={slug === '' ? 'Name the project first' : clash ? 'That name is taken' : `Create ${slug}`}
            onClick={() => {
              onCreate(slug)
              setOpen(false)
              setName('')
            }}
          >
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Type-to-confirm: the confirm button stays dead until the name matches. */
function DeleteTeamDialog({
  uid,
  vars,
  count,
  onConfirm,
}: {
  uid: string
  vars: CSSProperties
  count: number
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const armed = typed.trim() === TEAM_NAME
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(!!v)
        if (!v) setTyped('')
      }}
    >
      <DialogTrigger
        render={
          <Button variant="destructive" className="act-delete">
            <Trash2 className="size-4" /> Delete team
          </Button>
        }
      />
      {/* Level 3, and the one dialog that blocks the user to ask a question
          they cannot take back — exactly what `--scrim` is for. The scrim is
          NOT applied here: `DialogContent` renders its own
          `DialogPrimitive.Backdrop` internally (`bg-black/10`, hardcoded) and
          exposes no way to style or replace it from a call site. Fixing that
          means editing `ui/dialog.tsx`, which is out of this file's scope, so
          the miss is reported rather than papered over. */}
      <DialogContent style={vars} className="shadow-[shadow:var(--elevation-3)]">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete {TEAM_NAME}?</DialogTitle>
          <DialogDescription>
            This removes {count} projects and every deploy history with them.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`del-${uid}`}>
            Type <span className="font-mono text-foreground">{TEAM_NAME}</span> to confirm
          </Label>
          <Input
            id={`del-${uid}`}
            value={typed}
            placeholder={TEAM_NAME}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Keep team</Button>} />
          <Button
            variant="destructive"
            /* The one solid destructive fill in the app. Every other danger
               affordance here is the subtle pairing (`destructive/10` +
               `destructive` ink), which means the `destructive` /
               `destructive-foreground` pair the engine solves and contrast-
               checks would otherwise never be drawn for the user to judge.
               Composed locally rather than by editing the Button variant:
               this is the last click before something is destroyed, and it
               is the only place that weight is earned. */
            className="act-confirm-delete bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/90"
            disabled={!armed}
            title={armed ? `Delete ${TEAM_NAME}` : `Type “${TEAM_NAME}” exactly to enable this`}
            onClick={() => {
              onConfirm()
              setOpen(false)
              setTyped('')
            }}
          >
            Delete team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
