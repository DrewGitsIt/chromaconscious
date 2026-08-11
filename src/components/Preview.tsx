import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  BarChart3,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Settings,
  Share,
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

export type ExportFormat = 'css' | 'tailwind' | 'json'

interface Props {
  tokens: Record<string, string>
  mode: 'light' | 'dark'
  /** Stable per-frame id suffix so element ids stay unique across panes. */
  uid: string
}

type Page = 'dashboard' | 'projects' | 'settings'

const NAV: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'settings', label: 'Settings', icon: Settings },
]

/**
 * A dense fake app built from real shadcn/ui components, rendered entirely
 * from the generated CSS variables — the visual test bench for the algorithm.
 * Everything inside is mockup set dressing; real controls (mode, export)
 * live in the app toolbar. `vars` is also passed to portaled content
 * (dialogs, menus, selects) because portals mount outside this wrapper.
 */
export function Preview({ tokens, mode, uid }: Props) {
  const vars = Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [`--${k}`, v]),
  ) as CSSProperties
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <div
      className={`preview-root flex min-h-[680px] bg-background text-sm text-foreground ${mode === 'dark' ? 'dark' : ''}`}
      style={vars}
    >
        {/* rail */}
        <div className="flex w-44 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
          <div className="mb-4 px-2 text-base font-bold text-sidebar-primary">Acme</div>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ id, label: navLabel, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  page === id
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <Icon className="size-4" />
                {navLabel}
              </button>
            ))}
          </nav>
          <div className="mt-auto px-2 text-xs text-muted-foreground">v2.4.1</div>
        </div>

        {/* main */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <header className="flex items-center justify-between">
            <strong className="text-base capitalize">{page}</strong>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="sm">
                      <Share className="size-4" /> Export
                    </Button>
                  }
                />
                <DropdownMenuContent style={vars}>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Export as</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>PDF report</DropdownMenuItem>
                    <DropdownMenuItem>CSV</DropdownMenuItem>
                    <DropdownMenuItem>Share link</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Dialog>
                <DialogTrigger
                  render={
                    <Button size="sm">
                      <Plus className="size-4" /> New project
                    </Button>
                  }
                />
                <DialogContent style={vars}>
                  <DialogHeader>
                    <DialogTitle>New project</DialogTitle>
                    <DialogDescription>
                      Give it a name — you can change everything later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2">
                    <Label htmlFor={`np-${uid}`}>Project name</Label>
                    <Input id={`np-${uid}`} placeholder="acme-website" />
                  </div>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline">Cancel</Button>} />
                    <DialogClose render={<Button>Create project</Button>} />
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </header>

          {page === 'dashboard' && (
            <>
              <Alert className="border-success bg-success-subtle text-success-subtle-foreground">
                <AlertTitle>Deploy succeeded</AlertTitle>
                <AlertDescription className="text-success-subtle-foreground/90">
                  All 42 checks passed on production.
                </AlertDescription>
              </Alert>
              <Alert className="border-warning bg-warning-subtle text-warning-subtle-foreground">
                <AlertTitle>Certificate expires in 12 days</AlertTitle>
              </Alert>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Revenue', '$48,210', '+4.2%', 'chart-1'],
                  ['Active users', '3,842', '+12.1%', 'chart-2'],
                  ['Churn', '2.1%', '-0.4%', 'chart-3'],
                ].map(([title, value, delta, chart]) => (
                  <Card key={title}>
                    <CardHeader>
                      <CardDescription>{title}</CardDescription>
                      <CardTitle className="text-2xl">{value}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex h-9 items-end gap-1">
                        {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t-sm"
                            style={{ height: `${h}%`, background: `var(--${chart})` }}
                          />
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {delta} vs. last month
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Tabs defaultValue="activity">
                <TabsList>
                  <TabsTrigger value="activity">
                    <BarChart3 className="size-4" /> Activity
                  </TabsTrigger>
                  <TabsTrigger value="alerts">Alerts</TabsTrigger>
                </TabsList>
                <TabsContent value="activity">
                  <ServiceTable />
                </TabsContent>
                <TabsContent value="alerts">
                  <Alert className="border-destructive bg-destructive-subtle text-destructive-subtle-foreground">
                    <AlertTitle>Build failed on main</AlertTitle>
                    <AlertDescription className="text-destructive-subtle-foreground/90">
                      2 test errors in billing-service. <a className="cursor-pointer underline">View logs</a>
                    </AlertDescription>
                  </Alert>
                </TabsContent>
              </Tabs>
            </>
          )}

          {page === 'projects' && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>All projects</CardTitle>
                <Button variant="secondary" size="sm">
                  Filter
                </Button>
              </CardHeader>
              <CardContent>
                <ServiceTable />
                <div className="mt-3 flex gap-2">
                  <Button size="sm">Deploy all</Button>
                  <Button variant="destructive" size="sm">
                    Archive selected
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {page === 'settings' && (
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Team settings</CardTitle>
                <CardDescription>Invite teammates and set defaults.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={`email-${uid}`}>Email</Label>
                  <Input id={`email-${uid}`} placeholder="name@example.com" />
                </div>
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Select defaultValue="editor">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={vars}>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor={`notif-${uid}`}>Email notifications</Label>
                  <Switch id={`notif-${uid}`} defaultChecked />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id={`tos-${uid}`} defaultChecked />
                  <Label htmlFor={`tos-${uid}`} className="text-muted-foreground">
                    Apply to existing projects
                  </Label>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button variant="outline">Cancel</Button>
                  <Button>Save changes</Button>
                  <Button variant="destructive">Delete team</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
    </div>
  )
}

function ServiceTable() {
  const rows = [
    ['marketing-site', 'live', 'ana', '99.98%'],
    ['billing-service', 'degraded', 'drew', '97.20%'],
    ['legacy-importer', 'down', 'sam', '61.05%'],
    ['docs-portal', 'live', 'kai', '99.99%'],
  ] as const
  const badge = (status: string) =>
    status === 'live' ? (
      <Badge className="bg-success text-success-foreground">live</Badge>
    ) : status === 'degraded' ? (
      <Badge className="bg-warning text-warning-foreground">degraded</Badge>
    ) : (
      <Badge variant="destructive">down</Badge>
    )
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-right">Uptime</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([name, status, owner, uptime]) => (
          <TableRow key={name}>
            <TableCell className="font-medium">{name}</TableCell>
            <TableCell>{badge(status)}</TableCell>
            <TableCell>{owner}</TableCell>
            <TableCell className="text-right text-muted-foreground">{uptime}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
