import type { CSSProperties } from 'react'
import type { ThemeResult } from '../engine'
import { resolveBrand } from '../engine'
import './BrandBoard.css'

interface Props {
  result: ThemeResult
  mode: 'light' | 'dark'
  /** Unused here (no portaled ids), part of the shared mockup contract. */
  uid: string
}

/**
 * A brand-identity board for the fictional Acme brand: logo lockups, type
 * specimen, color system, proportions, business cards. Speaks the brand
 * adapter's paper/ink vocabulary — not shadcn tokens — because a brand sheet
 * has figure and ground, not surface stacks. Everything inside is mockup.
 */
export function BrandBoard({ result, mode }: Props) {
  const b = resolveBrand(result, mode)
  const ramp = result[mode].ramps.primary
  const vars = {
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
