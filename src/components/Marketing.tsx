import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Gauge,
  GitBranch,
  Layers,
  Menu,
  Minus,
  Plus,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TokenSpaceProps } from '../mockups'

type Billing = 'monthly' | 'annual'

interface Tier {
  id: string
  name: string
  blurb: string
  monthly: number
  /** Exactly 20% off the monthly rate, so the toggle's claim is checkable. */
  annual: number
  popular?: boolean
  features: string[]
}

/** Static so the two split panes render byte-identical copy — no render-time randomness. */
const TIERS: Tier[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'One builder, one product, everything that matters.',
    monthly: 15,
    annual: 12,
    features: ['1 workspace', '3 themes', 'Light + dark export', 'Community support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    blurb: 'A design team that ships to production every week.',
    monthly: 45,
    annual: 36,
    popular: true,
    features: [
      'Unlimited themes',
      'Contrast audit on every save',
      'Figma + Tailwind export',
      'Shared brand library',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    blurb: 'Many brands, many teams, one system of record.',
    monthly: 95,
    annual: 76,
    features: [
      'Everything in Growth',
      'Multi-brand token sets',
      'SSO + SCIM provisioning',
      'Audit log & retention policy',
    ],
  },
]

const FEATURES = [
  {
    icon: Zap,
    title: 'Solved, not sampled',
    body: 'Every pair on the page is contrast-solved before you see it. No eyeballing a hex against a background and hoping.',
  },
  {
    icon: Layers,
    title: 'Both modes, one pass',
    body: 'Light and dark come out of the same seed. Change the brand color and both re-solve together.',
  },
  {
    icon: ShieldCheck,
    title: 'Audited on save',
    body: 'Forty contrast checks run on every change, and the ones that fail tell you which pair broke.',
  },
  {
    icon: GitBranch,
    title: 'Versioned like code',
    body: 'Themes live in your repo as CSS variables. Diff them, review them, roll them back.',
  },
  {
    icon: Gauge,
    title: 'Fast enough to play',
    body: 'A full re-solve takes under a frame, so dragging the brand hue is a conversation, not a build step.',
  },
  {
    icon: Users,
    title: 'One vocabulary',
    body: 'Designers and engineers name the same colors the same way. The handoff stops being a translation.',
  },
]

const LOGOS = ['Halcyon', 'ARDENT', 'Basalt', 'RIVERBED', 'Nomad', 'Kestrel']

const QUOTES = [
  {
    name: 'Ana Duarte',
    role: 'Design lead, Halcyon',
    quote:
      'We stopped arguing about hexes in review. The palette arrives already legal, and the conversation moved up a level.',
    chart: 'chart-1',
  },
  {
    name: 'Sam Okonkwo',
    role: 'Staff engineer, Basalt',
    quote:
      'Dark mode used to be a second project. Now it falls out of the same seed and I never touch it twice.',
    chart: 'chart-3',
  },
  {
    name: 'Kai Lindqvist',
    role: 'Founder, Riverbed',
    quote:
      'I rebranded on a Tuesday afternoon. One color in, the whole product out, and nothing failed an audit.',
    chart: 'chart-4',
  },
]

const FAQS = [
  {
    id: 'billing',
    q: 'What happens when I switch to annual?',
    a: 'The annual rate is 20% below the monthly one and is charged once for the year. Switching mid-term prorates what you have already paid, so you are never billed twice for the same month.',
  },
  {
    id: 'export',
    q: 'What do I actually get out of it?',
    a: 'A set of CSS custom properties, a Tailwind theme block, and a JSON token file — the same values, three shapes. Nothing is locked behind a runtime; the output is plain text you commit.',
  },
  {
    id: 'contrast',
    q: 'How are the contrast ratios decided?',
    a: 'Every foreground is solved against the surface it will actually sit on, targeting 4.5:1 for body text and 3:1 for non-text marks. When a pair cannot reach its target the theme reports it instead of quietly shipping it.',
  },
  {
    id: 'cancel',
    q: 'Can I leave?',
    a: 'Any time, from the billing page, without talking to anyone. Your exported themes are files you already own, so nothing stops working when the subscription does.',
  },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type SignupState = 'idle' | 'empty' | 'invalid' | 'sent'

/**
 * A marketing landing page — the mockup that fills LARGE fields with the brand
 * color. The app dashboard and brand board only ever show `primary` in small
 * doses (a button, a nav pill); a primary that reads fine at button scale can
 * be unbearable across half a viewport, and this page is where that shows up.
 *
 * Three sizes of brand field on purpose: the hero (a full-bleed section), the
 * closing CTA band (a horizontal stripe), and the popular pricing tier (a
 * card). Every one of them pairs `primary` with `primary-foreground`, because
 * that is the pair the engine actually solved — putting `foreground` on a
 * `primary` fill would hide the very failure this page exists to expose.
 *
 * All state is local: split view mounts two of these and they must not share.
 * Every id carries `uid` for the same reason.
 *
 * Elevation is assigned by what a surface *means*. Level 1 rests: the feature
 * cards, the testimonials, the FAQ panel, the signup card, the hero's product
 * shot, and the two ordinary pricing tiers. Level 2 is summoned: the product
 * menu, the compact nav panel — and the "most popular" tier, which a pricing
 * table has always lifted above its neighbours and which now has a level to
 * say so in instead of an ad-hoc border. Level 3 and `--scrim` are unused
 * here on purpose: nothing on a landing page takes the screen over, and there
 * is no modality to wash out behind.
 *
 * It is strictly additive. Every surface below keeps the border it already
 * had, because `separation: 'flat'` makes `--elevation-1` the literal string
 * `none` and buys the separation back in hairlines instead.
 */
export function Marketing({ tokens, mode, uid, effects }: TokenSpaceProps) {
  // The effects are already CSS-ready strings (whole `box-shadow` values, an
  // `rgb(… / …)` scrim) serialized by the engine, so the preview and the CSS
  // export cannot drift. They ride in the same `style` as the tokens.
  const vars = {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
    ...effects,
  } as CSSProperties

  const [navOpen, setNavOpen] = useState(false)
  const [billing, setBilling] = useState<Billing>('monthly')
  const [plan, setPlan] = useState('growth')
  const [openFaqs, setOpenFaqs] = useState<string[]>(['billing'])
  const [email, setEmail] = useState('')
  const [signup, setSignup] = useState<SignupState>('idle')
  const [sentTo, setSentTo] = useState('')

  const annual = billing === 'annual'
  const priceOf = (t: Tier) => (annual ? t.annual : t.monthly)
  const chosen = TIERS.find((t) => t.id === plan) ?? TIERS[0]
  const saving = (chosen.monthly - chosen.annual) * 12

  const sectionId = (name: string) => `mkt-${name}-${uid}`

  const toggleFaq = (id: string) =>
    setOpenFaqs((open) => (open.includes(id) ? open.filter((x) => x !== id) : [...open, id]))

  const submitEmail = (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return setSignup('empty')
    if (!EMAIL_RE.test(value)) return setSignup('invalid')
    setSentTo(value)
    setSignup('sent')
  }

  /* Hand-rolled controls get the same focus treatment the shadcn primitives
     ship with, spelled as an outline so it never disturbs layout: the `ring`
     token, two pixels, offset off the control. Three variants because the ring
     has to be visible against three different grounds — `ring` is solved
     against `background`, so on the brand field it borrows the pair that was
     solved there instead, and inside a clipped container it turns inward.
     No `outline-none` here on purpose: in Tailwind v4 it pins --tw-outline-style
     to none, and the focus-visible width then paints a 2px outline of nothing. */
  const focus =
    'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'
  const focusInset =
    'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring'
  const focusOnBrand =
    'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-primary-foreground'

  return (
    <div
      className={`preview-root @container flex min-h-[680px] flex-col bg-background text-sm text-foreground ${
        mode === 'dark' ? 'dark' : ''
      }`}
      style={vars}
    >
      {/* ---------------------------------------------------------------- nav */}
      {/* Positioned so the compact panel's level-2 shadow lands *on* the hero.
          Non-positioned block backgrounds paint in tree order, so without this
          the very next section would paint straight over the shadow. */}
      <header className="relative z-10 border-b border-border bg-background/95">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-3">
          <a
            href={`#${sectionId('top')}`}
            className={`mkt-wordmark flex items-center gap-2 rounded-md text-base font-semibold tracking-tight ${focus}`}
          >
            {/* The mark is brand-filled at the smallest size on the page, so the
                same solved pair gets judged at every scale from 24px up. */}
            <span className="grid size-6 place-items-center rounded-md bg-primary">
              <Sparkles className="size-3.5 text-primary-foreground" aria-hidden />
            </span>
            Northwind
          </a>

          <nav className="ml-4 hidden items-center gap-1 @2xl:flex">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className={`mkt-product-trigger flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground ${focus}`}
                  >
                    Product
                    <ChevronDown className="size-3.5" aria-hidden />
                  </button>
                }
              />
              {/* Portaled: mounts outside .preview-root, so it needs the vars
                  itself — tokens AND effects. A portal whose subtree never saw
                  `--elevation-2` renders shadowless and reports nothing. The
                  menu is summoned, so level 2; the `ring-1` shadcn already put
                  on it stays, and `flat` never empties level 2 anyway.

                  The `shadow:` type hint is load-bearing here. `shadow-[var(…)]`
                  compiles, but tailwind-merge cannot tell a bare `var()` from a
                  shadow *colour*, so it keeps the primitive's own `shadow-md`
                  and that hardcoded shadow wins — measured: reach 6px, not the
                  20px the level-2 value asks for. */}
              <DropdownMenuContent
                style={vars}
                className="mkt-product-menu w-56 shadow-[shadow:var(--elevation-2)]"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Platform</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Theme forge</DropdownMenuItem>
                  <DropdownMenuItem>Contrast audit</DropdownMenuItem>
                  <DropdownMenuItem>Token export</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled
                    className="mkt-menu-soon"
                    title="Brand sync ships in the Q3 release — nothing to open yet"
                  >
                    Brand sync
                    <span className="ml-auto text-xs text-muted-foreground">soon</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {[
              ['Features', 'features'],
              ['Pricing', 'pricing'],
              ['Customers', 'customers'],
            ].map(([label, target]) => (
              <a
                key={target}
                href={`#${sectionId(target)}`}
                className={`rounded-md px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${focus}`}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <a
              href={`#${sectionId('signup')}`}
              className={`mkt-signin hidden rounded-md px-2 py-1.5 font-medium text-link underline-offset-4 hover:underline @xl:inline-block ${focus}`}
            >
              Sign in
            </a>
            <a
              href={`#${sectionId('pricing')}`}
              className={`mkt-nav-cta inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 ${focus}`}
            >
              Start free
            </a>
            <button
              type="button"
              aria-expanded={navOpen}
              aria-controls={`mkt-navpanel-${uid}`}
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setNavOpen((o) => !o)}
              className={`mkt-nav-toggle grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground @2xl:hidden ${focus}`}
            >
              {navOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        {/* Summoned, so level 2 — the same standing as the product menu it
            replaces at this width. The top hairline stays: under `flat` that
            border is the only thing separating it from the hero. */}
        {navOpen && (
          <div
            id={`mkt-navpanel-${uid}`}
            className="mkt-nav-panel border-t border-border bg-card px-6 py-3 shadow-[shadow:var(--elevation-2)] @2xl:hidden"
          >
            <ul className="grid gap-1">
              {[
                ['Features', 'features'],
                ['Pricing', 'pricing'],
                ['Customers', 'customers'],
                ['Questions', 'faq'],
              ].map(([label, target]) => (
                <li key={target}>
                  <a
                    href={`#${sectionId(target)}`}
                    onClick={() => setNavOpen(false)}
                    className={`block rounded-md px-2 py-1.5 font-medium text-card-foreground hover:bg-muted ${focus}`}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {/* --------------------------------------------------------------- hero */}
      {/* The point of this mockup: primary across a whole section, with the
          only foreground the engine guaranteed against it.

          Note what is NOT here — a quiet second text tier. The engine solves
          primary/primary-foreground to roughly 4.5:1 exactly, so the usual
          landing-page move of a subhead at 80% opacity lands near 4.3:1 and
          fails AA. On a brand field there is no muted-foreground sibling to
          fall back to, so hierarchy here is made of size and weight only;
          every glyph on the fill is full-strength primary-foreground. */}
      <section
        id={sectionId('top')}
        className="mkt-hero relative overflow-hidden bg-primary text-primary-foreground"
      >
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 @3xl:grid-cols-[1.05fr_0.95fr] @3xl:items-center @3xl:py-20">
          <div>
            <span className="mkt-eyebrow inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-2.5 py-1 text-xs font-medium">
              <Sparkles className="size-3" aria-hidden />
              v4 — themes that audit themselves
            </span>
            <h1 className="mt-5 text-3xl leading-[1.08] font-semibold tracking-tight text-balance @3xl:text-5xl">
              Ship the interface. Skip the argument about the blue.
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-primary-foreground @3xl:text-lg">
              Northwind turns one brand color into a complete, contrast-checked UI
              theme — light and dark, tokens and exports — before the first
              component is written.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {/* Inverting the solved pair keeps the same guaranteed ratio: the
                  CTA is primary-foreground filled with primary text. */}
              <a
                href={`#${sectionId('signup')}`}
                className={`mkt-hero-cta inline-flex h-10 items-center gap-2 rounded-lg bg-primary-foreground px-5 font-medium text-primary transition-opacity hover:opacity-90 ${focusOnBrand}`}
              >
                Start free trial
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <a
                href={`#${sectionId('features')}`}
                className={`mkt-hero-cta2 inline-flex h-10 items-center rounded-lg border border-primary-foreground px-5 font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10 ${focusOnBrand}`}
              >
                See how it works
              </a>
            </div>
            <p className="mt-5 text-xs text-primary-foreground">
              No card required · 14-day trial · SOC 2 Type II
            </p>
          </div>

          {/* A real surface sitting on the brand field — card-on-primary is the
              adjacency that goes wrong first when the brand is too light. It
              rests on the field rather than being summoned onto it, so level 1;
              the frame keeps its own border either way. */}
          <div className="mkt-shot rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-2.5 shadow-[shadow:var(--elevation-1)]">
            <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="size-2 rounded-full bg-destructive" aria-hidden />
                <span className="size-2 rounded-full bg-warning" aria-hidden />
                <span className="size-2 rounded-full bg-success" aria-hidden />
                <span className="ml-2 truncate text-xs text-muted-foreground">
                  northwind.app / palette
                </span>
              </div>
              <div className="grid grid-cols-[auto_1fr]">
                <div className="w-24 shrink-0 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
                  <div className="mb-2 text-[0.65rem] font-semibold tracking-wide text-sidebar-primary uppercase">
                    Palette
                  </div>
                  {['Brand', 'Accent', 'Neutral'].map((row, i) => (
                    <div
                      key={row}
                      className={`mb-1 rounded-[calc(var(--radius)*0.4)] px-1.5 py-1 text-[0.7rem] ${
                        i === 0
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/80'
                      }`}
                    >
                      {row}
                    </div>
                  ))}
                </div>
                <div className="p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium">Contrast audit</span>
                    <Badge className="bg-success text-success-foreground">40 pass</Badge>
                  </div>
                  <div className="mt-3 flex h-16 items-end gap-1.5">
                    {[52, 74, 41, 88, 63, 96, 70, 58].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm"
                        style={{
                          height: `${h}%`,
                          background: `var(--chart-${(i % 5) + 1})`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 grid gap-1.5">
                    {[
                      ['primary / primary-fg', '7.1:1'],
                      ['card / card-fg', '15.4:1'],
                      ['muted-fg / background', '4.8:1'],
                    ].map(([pair, ratio]) => (
                      <div key={pair} className="flex items-center justify-between text-[0.7rem]">
                        <span className="truncate text-muted-foreground">{pair}</span>
                        <span className="font-medium tabular-nums">{ratio}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stat band, still inside the brand field — it makes the field taller
            on purpose, which is the whole test. */}
        <div className="border-t border-primary-foreground/20">
          <dl className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-8 @xl:grid-cols-3">
            {[
              ['40', 'contrast checks per save'],
              ['2', 'modes solved from one seed'],
              ['11k', 'themes forged last quarter'],
            ].map(([n, label]) => (
              <div key={label}>
                <dt className="text-2xl font-semibold tabular-nums @3xl:text-3xl">{n}</dt>
                <dd className="mt-1 text-xs text-primary-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------- social proof */}
      <section className="border-b border-border bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            Trusted by teams at
          </span>
          {LOGOS.map((name) => (
            <span
              key={name}
              className="text-sm font-semibold tracking-tight text-muted-foreground/80"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- features */}
      <section id={sectionId('features')} className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="max-w-xl">
          <span className="text-xs font-semibold tracking-wide text-link uppercase">
            Why Northwind
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance @3xl:text-3xl">
            Color decisions that survive contact with production
          </h2>
          <p className="mt-3 text-muted-foreground">
            The palette is not a mood board. It is a set of pairs, each one solved
            against the surface it lands on.
          </p>
        </div>
        <div className="mt-9 grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="mkt-feature rounded-xl border border-border bg-card p-5 text-card-foreground shadow-[shadow:var(--elevation-1)]"
            >
              {/* accent is the ramp's step 2 — a wash. It is the right ground for
                  a quiet icon tile, and accent-foreground is its solved mate. */}
              <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ pricing */}
      <section
        id={sectionId('pricing')}
        className="border-y border-border bg-muted/30 px-6 py-16"
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <span className="text-xs font-semibold tracking-wide text-link uppercase">
              Pricing
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance @3xl:text-3xl">
              Pick a plan, change it whenever
            </h2>
            <p className="mt-3 text-muted-foreground">
              Annual billing takes 20% off every tier. Nothing here needs a call.
            </p>
          </div>

          <div className="mt-7 flex flex-col items-center gap-3">
            <div
              role="group"
              aria-label="Billing period"
              className="mkt-billing inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
            >
              {(['monthly', 'annual'] as Billing[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={billing === period}
                  onClick={() => setBilling(period)}
                  className={`mkt-billing-${period} flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${focus} ${
                    billing === period
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {period}
                  {period === 'annual' && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${
                        billing === 'annual'
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-success-subtle text-success-subtle-foreground'
                      }`}
                    >
                      −20%
                    </span>
                  )}
                </button>
              ))}
              {/* Deliberately dead, and dressed as dead: no self-serve path exists
                  for multi-year terms, so the control says so instead of eating
                  the click. Pointer events stay on so the title can surface. */}
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Two-year terms are written by hand — talk to sales, there is no self-serve path yet"
                className="mkt-billing-2y cursor-not-allowed rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground/50 line-through decoration-muted-foreground/40"
              >
                2 years
              </button>
            </div>
            <p className="mkt-plan-summary text-xs text-muted-foreground">
              {chosen.name} selected ·{' '}
              {annual ? `billed annually, saving $${saving} a year` : 'billed monthly'}
            </p>
          </div>

          <div className="mt-8 grid items-start gap-4 @3xl:grid-cols-3">
            {TIERS.map((tier) => {
              const selected = tier.id === plan
              const brandFilled = tier.popular
              return (
                /* Elevation lives on a wrapper, never on the button, because
                   the button also wears a selection `ring`. Tailwind composes
                   ring and shadow into ONE box-shadow list, and under
                   `separation: 'flat'` --elevation-1 is the literal string
                   `none` — illegal inside a shadow list, which would
                   invalidate the whole declaration and take the ring with it.
                   Two boxes, two declarations, and selection survives all
                   three separation settings.

                   The popular tier is deliberately a level above its
                   neighbours: a pricing table has always lifted that card, and
                   a level is an honest way to say so. The `-mt-3` moves with
                   the shadow — a shadow drawn on a box the card no longer
                   fills would sit visibly off its edges. */
                <div
                  key={tier.id}
                  className={`mkt-tier-lift rounded-xl ${
                    tier.popular
                      ? 'mkt-tier-lift-2 shadow-[shadow:var(--elevation-2)] @3xl:-mt-3'
                      : 'shadow-[shadow:var(--elevation-1)]'
                  }`}
                >
                  <button
                    type="button"
                    data-tier={tier.id}
                    aria-pressed={selected}
                    onClick={() => setPlan(tier.id)}
                    className={`mkt-tier relative flex w-full flex-col rounded-xl border p-5 text-left transition-colors ${focus} ${
                      brandFilled
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-card-foreground hover:border-accent-strong/60'
                    } ${
                      /* Selection speaks in the accent's voice — accent-strong is
                         a non-text mark, which is the job it was solved for, and
                         it keeps selection from sounding like the brand.
                         On the brand-filled tier it cannot: accent-strong was
                         solved against `background`, not against `primary`, and
                         on palettes where the two sit close (a blue brand with a
                         blue accent) the ring vanishes into the card. There the
                         ring uses primary-foreground, the one value guaranteed to
                         separate from that fill. */
                      selected
                        ? brandFilled
                          ? 'mkt-tier-selected ring-2 ring-primary-foreground'
                          : 'mkt-tier-selected ring-2 ring-accent-strong'
                        : ''
                    } ${tier.popular ? '@3xl:pb-8' : ''}`}
                  >
                    {tier.popular && (
                      <span className="mkt-popular absolute -top-2.5 left-5 rounded-full bg-primary-foreground px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-primary uppercase">
                        Most popular
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold tracking-tight">{tier.name}</h3>
                      {selected && (
                        <span
                          className={`mkt-tier-check inline-flex items-center gap-1 text-xs font-medium ${
                            brandFilled ? 'text-primary-foreground' : 'text-link'
                          }`}
                        >
                          <Check className="size-3.5" aria-hidden />
                          Selected
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-1 text-xs ${
                        brandFilled ? 'text-primary-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {tier.blurb}
                    </p>
                    <div className="mt-5 flex items-baseline gap-1.5">
                      <span className="mkt-price text-3xl font-semibold tabular-nums">
                        ${priceOf(tier)}
                      </span>
                      <span
                        className={`text-xs ${
                          brandFilled ? 'text-primary-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        /seat /mo
                      </span>
                    </div>
                    <p
                      className={`mkt-price-note mt-1 text-xs ${
                        brandFilled ? 'text-primary-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {annual
                        ? `billed annually · was $${tier.monthly}`
                        : 'billed monthly · save 20% annually'}
                    </p>
                    <ul className="mt-5 grid gap-2">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs">
                          <Check
                            className={`mt-0.5 size-3.5 shrink-0 ${
                              brandFilled ? 'text-primary-foreground' : 'text-accent-strong'
                            }`}
                            aria-hidden
                          />
                          <span className={brandFilled ? '' : 'text-muted-foreground'}>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <span
                      className={`mt-6 inline-flex h-9 w-full items-center justify-center rounded-lg text-xs font-medium ${
                        brandFilled
                          ? 'bg-primary-foreground text-primary'
                          : selected
                            ? 'bg-secondary text-secondary-foreground'
                            : 'border border-border text-foreground'
                      }`}
                    >
                      {selected ? 'Current selection' : `Choose ${tier.name}`}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- testimonials */}
      <section id={sectionId('customers')} className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-8 @4xl:grid-cols-[0.9fr_1.1fr] @4xl:items-center">
          <div>
            <span className="text-xs font-semibold tracking-wide text-link uppercase">
              Customers
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance @3xl:text-3xl">
              The palette stopped being a meeting
            </h2>
            <div className="mt-4 flex items-center gap-2">
              <span className="flex" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-warning text-warning" />
                ))}
              </span>
              <span className="text-xs text-muted-foreground">
                4.9 average across 320 reviews
              </span>
            </div>
            <blockquote className="mkt-quote-lead mt-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-[shadow:var(--elevation-1)]">
              <Quote className="size-5 text-accent-strong" aria-hidden />
              <p className="mt-3 text-lg leading-relaxed text-balance">
                “We handed the brand color to Northwind and got back a system nobody
                had to defend. Two designers, one afternoon, zero contrast bugs in
                the audit.”
              </p>
              <footer className="mt-5 flex items-center gap-3">
                {/* Initials are text, so the circle uses a solved pair rather
                    than a chart color — chart tokens are only solved as marks. */}
                <span
                  className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                  aria-hidden
                >
                  MR
                </span>
                <span>
                  <span className="block font-medium">Mira Rahman</span>
                  <span className="block text-xs text-muted-foreground">
                    Head of design, Ardent
                  </span>
                </span>
              </footer>
            </blockquote>
          </div>
          <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-1">
            {QUOTES.map((q) => (
              <figure
                key={q.name}
                className="mkt-quote rounded-xl border border-border bg-card p-5 text-card-foreground shadow-[shadow:var(--elevation-1)]"
              >
                <blockquote className="leading-relaxed">“{q.quote}”</blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <span
                    className="size-8 shrink-0 rounded-full"
                    style={{ background: `var(--${q.chart})` }}
                    aria-hidden
                  />
                  <span>
                    <span className="block text-xs font-medium">{q.name}</span>
                    <span className="block text-xs text-muted-foreground">{q.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- faq */}
      <section
        id={sectionId('faq')}
        className="border-y border-border bg-muted/30 px-6 py-16"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-8 @4xl:grid-cols-[0.8fr_1.2fr]">
          <div>
            <span className="text-xs font-semibold tracking-wide text-link uppercase">
              Questions
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance @3xl:text-3xl">
              Before you ask sales
            </h2>
            <p className="mt-3 text-muted-foreground">
              Open as many as you like. Anything missing, the answer is a reply away.
            </p>
          </div>
          <div className="mkt-faq-card divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[shadow:var(--elevation-1)]">
            {FAQS.map(({ id, q, a }) => {
              const open = openFaqs.includes(id)
              return (
                <div key={id} className="mkt-faq-item" data-faq={id} data-open={open}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`mkt-faq-${id}-${uid}`}
                    id={`mkt-faqbtn-${id}-${uid}`}
                    onClick={() => toggleFaq(id)}
                    className={`mkt-faq-btn flex w-full items-center gap-4 px-5 py-4 text-left font-medium text-card-foreground transition-colors hover:bg-muted/60 ${focusInset}`}
                  >
                    <span className="flex-1">{q}</span>
                    {open ? (
                      <Minus className="size-4 shrink-0 text-accent-strong" aria-hidden />
                    ) : (
                      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </button>
                  {open && (
                    <div
                      id={`mkt-faq-${id}-${uid}`}
                      role="region"
                      aria-labelledby={`mkt-faqbtn-${id}-${uid}`}
                      className="mkt-faq-panel px-5 pb-4 leading-relaxed text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
                    >
                      {a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- closing CTA + email */}
      {/* The second brand field: a band rather than a section, so the same pair
          gets judged at a different size on the same page. */}
      <section
        id={sectionId('signup')}
        className="mkt-cta-band bg-primary px-6 py-14 text-primary-foreground"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-8 @4xl:grid-cols-[1fr_0.9fr] @4xl:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-balance @3xl:text-3xl">
              Start on {chosen.name} today
            </h2>
            <p className="mt-3 max-w-prose text-primary-foreground">
              {chosen.name} is ${priceOf(chosen)} per seat per month
              {annual ? `, billed annually — $${saving} less a year than monthly.` : '.'} Fourteen
              days free, and the export is yours either way.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={`#${sectionId('pricing')}`}
                className={`mkt-plan-cta inline-flex h-10 items-center gap-2 rounded-lg bg-primary-foreground px-5 font-medium text-primary transition-opacity hover:opacity-90 ${focusOnBrand}`}
              >
                Start {chosen.name} — ${priceOf(chosen)}/mo
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <span className="text-xs text-primary-foreground">
                Change plan any time from billing
              </span>
            </div>
          </div>

          {/* The form sits on a card so the destructive/success states get judged
              against the surface they actually ship on, not against the brand. */}
          <form
            noValidate
            onSubmit={submitEmail}
            className="mkt-signup-card rounded-xl border border-border bg-card p-5 text-card-foreground shadow-[shadow:var(--elevation-1)]"
          >
            <label htmlFor={`mkt-email-${uid}`} className="block font-medium">
              Get the setup guide
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              One email, the ten-minute version, no drip sequence.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                id={`mkt-email-${uid}`}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                aria-invalid={signup === 'empty' || signup === 'invalid'}
                aria-describedby={`mkt-email-msg-${uid}`}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (signup !== 'idle') setSignup('idle')
                }}
                className="mkt-email h-9"
              />
              <Button type="submit" size="lg" className="mkt-email-submit shrink-0">
                Send it
              </Button>
            </div>
            <div id={`mkt-email-msg-${uid}`} className="mkt-email-msg mt-3 min-h-5 text-xs">
              {signup === 'empty' && (
                <p role="alert" className="mkt-email-error flex items-center gap-1.5 text-destructive">
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                  Enter an email address first.
                </p>
              )}
              {signup === 'invalid' && (
                <p role="alert" className="mkt-email-error flex items-center gap-1.5 text-destructive">
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                  That is not a valid email address — check for a missing @ or domain.
                </p>
              )}
              {signup === 'sent' && (
                <p
                  role="status"
                  className="mkt-email-ok flex items-start gap-1.5 rounded-lg border border-success bg-success-subtle px-2.5 py-2 text-success-subtle-foreground"
                >
                  <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden />
                  <span>
                    Sent — check <strong className="font-medium">{sentTo}</strong> for the guide.
                  </span>
                </p>
              )}
              {signup === 'idle' && (
                <p className="text-muted-foreground">Unsubscribe in one click.</p>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* ------------------------------------------------------------- footer */}
      <footer className="border-t border-border bg-background px-6 pt-12 pb-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-8 @xl:grid-cols-2 @4xl:grid-cols-[1.2fr_repeat(3,1fr)]">
            <div>
              <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
                <span className="grid size-6 place-items-center rounded-md bg-primary">
                  <Sparkles className="size-3.5 text-primary-foreground" aria-hidden />
                </span>
                Northwind
              </span>
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Contrast-solved color systems for teams who would rather argue
                about something else.
              </p>
            </div>
            {[
              ['Product', ['Theme forge', 'Contrast audit', 'Exports', 'Changelog']],
              ['Company', ['About', 'Careers', 'Press kit', 'Contact']],
              ['Resources', ['Docs', 'Token guide', 'Status', 'Privacy']],
            ].map(([heading, links]) => (
              <div key={heading as string}>
                <h3 className="text-xs font-semibold tracking-wide text-foreground uppercase">
                  {heading as string}
                </h3>
                <ul className="mt-3 grid gap-2">
                  {(links as string[]).map((l) => (
                    <li key={l}>
                      <a
                        href={`#${sectionId('top')}`}
                        className={`rounded-[calc(var(--radius)*0.4)] text-xs text-muted-foreground transition-colors hover:text-link ${focus}`}
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
            <span>© 2026 Northwind Labs, Inc.</span>
            <span className="flex items-center gap-4">
              <a href={`#${sectionId('top')}`} className={`rounded-[calc(var(--radius)*0.4)] hover:text-link ${focus}`}>
                Terms
              </a>
              <a href={`#${sectionId('top')}`} className={`rounded-[calc(var(--radius)*0.4)] hover:text-link ${focus}`}>
                Privacy
              </a>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                All systems normal
              </span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
