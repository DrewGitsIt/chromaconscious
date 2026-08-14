import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeResult, TokenAncestor } from '../engine'
import {
  brandAncestors,
  effectVars,
  locateMuted,
  locateTokens,
  resolveBrand,
  sameAncestor,
} from '../engine'
import './BrandBoard.css'

interface Props {
  result: ThemeResult
  mode: 'light' | 'dark'
  /** Unused here (no portaled ids), part of the shared mockup contract. */
  uid: string
  /** Locate mode: the seat whose descendants stay lit; null = normal render. */
  locateTarget?: TokenAncestor | null
}

/**
 * A brand-identity board for the fictional Acme brand: logo lockups, type
 * specimen, color system, proportions, business cards. Speaks the brand
 * adapter's paper/ink vocabulary — not shadcn tokens — because a brand sheet
 * has figure and ground, not surface stacks. Everything inside is mockup.
 *
 * **Elevation here is one deliberate exception, not a policy.** The sheet and
 * its panels get none: `.bb-card` is a region of a printed page delimited by a
 * hairline, not a surface floating over another surface, and shadowing those
 * would turn a brand sheet into a dashboard — the exact confusion the
 * paper/ink vocabulary exists to prevent. There is likewise no level 2 or 3
 * and no scrim: nothing on a sheet is summoned, and nothing takes it over.
 *
 * The business-card specimens are different in kind. They are depicted
 * *objects* — printed cards lying on the sheet — and every real brand manual
 * photographs them that way. That is figure on ground, which is the board's
 * own grammar, so they take level 1 and nothing else does. It degrades
 * correctly under `separation: 'flat'`, where level 1 is `none`: the front
 * card is still a brand-filled rectangle and the back card still has its
 * hairline, exactly as they read today.
 */
export function BrandBoard({ result, mode, locateTarget = null }: Props) {
  // Locate mode reuses the app mockup's ancestry logic through the brand
  // adapter's own name → role mapping: non-descendant colors go muted.
  const b = useMemo(() => {
    const resolved = resolveBrand(result, mode)
    return locateTarget == null
      ? resolved
      : locateTokens(resolved, brandAncestors(), locateTarget, resolved.paper)
  }, [result, mode, locateTarget])
  // The ramp strip renders raw primary-ramp steps, so it mutes as a unit
  // whenever the located seat isn't the primary.
  const rawRamp = result[mode].ramps.primary
  const ramp =
    locateTarget == null || sameAncestor({ kind: 'role', role: 'primary' }, locateTarget)
      ? rawRamp
      : rawRamp.map((hex) => locateMuted(hex, b.paper))
  // BrandBoard takes the whole result, not TokenSpaceProps, so it serializes
  // the effects itself — same engine function the exporter uses, so the sheet
  // cannot drift from the CSS. Only `--elevation-1` is consumed (see above);
  // the rest ride along because they cost nothing and the next specimen that
  // earns one shouldn't have to re-wire this.
  const effects = useMemo(() => effectVars(result[mode].effects), [result, mode])
  const vars = {
    ...effects,
    '--bb-paper': b.paper,
    '--bb-ink': b.ink,
    '--bb-ink-subtle': b.inkSubtle,
    '--bb-line': b.line,
    '--bb-wash': b.wash,
    '--bb-brand': b.brand,
    '--bb-brand-ink': b.brandInk,
    '--bb-accent': b.accent,
    '--bb-accent-ink': b.accentInk,
  } as CSSProperties

  const chips: Array<[string, string]> = [
    ['Brand', b.brand],
    ['Accent', b.accent],
    ['Ink', b.ink],
    ['Paper', b.paper],
  ]

  return (
    <div className="brand-board" style={vars}>
      <header>
        <span className="bb-wordmark">Acme</span>
        <span className="bb-meta">Brand guidelines · v2.1</span>
      </header>

      <div className="bb-grid">
        <section className="bb-card bb-logo-primary">
          <div className="bb-mark">A</div>
          <div>
            <div className="bb-lockup">Acme</div>
            <div className="bb-sub">design tools</div>
          </div>
        </section>

        <section className="bb-card bb-logo-reversed">
          <div className="bb-mark bb-mark-reversed">A</div>
          <div className="bb-lockup">Acme</div>
        </section>

        <section className="bb-card bb-type">
          <div className="bb-glyph">Aa</div>
          <div className="bb-alphabet">AaBbCcDdEeFfGgHhIiJjKk 0123456789</div>
          <p>
            Acme builds tools that stay out of the way. Clear when you read it,
            quiet when you don&apos;t — the voice is confident, never loud.
          </p>
        </section>

        <section className="bb-card bb-colors">
          <h3>Color</h3>
          <div className="bb-chips">
            {chips.map(([name, hex]) => (
              <div key={name} className="bb-chip">
                <div className="bb-chip-fill" style={{ background: hex }} />
                <div className="bb-chip-name">{name}</div>
                <div className="bb-chip-hex">{hex}</div>
              </div>
            ))}
          </div>
          <div className="bb-ramp">
            {ramp.map((hex, i) => (
              <div key={i} style={{ background: hex }} title={`brand ${i + 1} · ${hex}`} />
            ))}
          </div>
        </section>

        <section className="bb-card bb-proportion">
          <h3>Proportion</h3>
          <div className="bb-prop-bar">
            <div style={{ flexBasis: '60%', background: b.wash }} />
            <div style={{ flexBasis: '30%', background: b.brand }} />
            <div style={{ flexBasis: '10%', background: b.accent }} />
          </div>
          <div className="bb-prop-legend">
            <span>60 field</span>
            <span>30 brand</span>
            <span>10 accent</span>
          </div>
        </section>

        <section className="bb-card bb-cards">
          <div className="bb-bizcard bb-bizcard-front">
            <div className="bb-mark bb-mark-reversed bb-mark-sm">A</div>
            <div className="bb-biz-name">Ana Reyes</div>
            <div className="bb-biz-role">Principal Designer</div>
          </div>
          <div className="bb-bizcard bb-bizcard-back">
            <div className="bb-biz-rule" />
            <div className="bb-biz-line">ana@acme.example</div>
            <div className="bb-biz-line">+1 555 010 4242</div>
            <div className="bb-biz-line">acme.example</div>
          </div>
        </section>
      </div>
    </div>
  )
}
