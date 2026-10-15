import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Minus, Plus, RotateCcw, ShoppingBag, Star, Truck } from 'lucide-react'
import type { TokenSpaceProps } from '../mockups'
import { TokenPhoto } from './TokenPhoto'
import pitcher from '../assets/shop/pitcher.jpg'
import sugarBowl from '../assets/shop/sugar-bowl.jpg'
import teapotBack from '../assets/shop/teapot-back.jpg'
import teapot from '../assets/shop/teapot.jpg'
import vase from '../assets/shop/vase.jpg'
import './Shop.css'

/**
 * A showcase mockup in the realistic register: one product page of a small
 * homewares shop. Every control works: the gallery, the finish, quantity,
 * the bag, the tabs, the quick-adds below.
 *
 * The finishes are the palette's own: each is a gradient map of the product
 * photographs through tokens (TokenPhoto), so picking "primary enamel" shows
 * the teapot in this theme's primary, and locate mode reaches it.
 *
 * Honesty, as in the magazine: text sits only on a surface whose pair the
 * contrast report checks, never on a photograph. e2e/mockup-shop.spec.ts
 * holds it to that in every state the controls reach.
 */
export function Shop({ tokens, mode, uid, effects }: TokenSpaceProps) {
  const vars = {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
    ...effects,
  } as CSSProperties
  const [view, setView] = useState(0)
  const [finish, setFinish] = useState<Finish>(FINISHES[1])
  const [qty, setQty] = useState(1)
  const [bag, setBag] = useState<Record<string, number>>({})
  const [bagOpen, setBagOpen] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('details')

  const add = (name: string, n: number) => {
    setBag((b) => ({ ...b, [name]: (b[name] ?? 0) + n }))
    setAdded(`Added ${n} × ${name} to your bag.`)
  }
  const count = Object.values(bag).reduce((a, b) => a + b, 0)
  const total = Object.entries(bag).reduce((sum, [name, n]) => sum + n * PRICES[name], 0)
  const productName = `Dome teapot, ${finish.name.toLowerCase()}`

  const photo = (name: string, src: string, stops: string[], className: string, alt: string) => (
    <TokenPhoto
      id={`shp-${name}-${uid}`}
      src={src}
      stops={stops}
      tokens={tokens}
      contrast={1.1}
      className={className}
      alt={alt}
    />
  )

  return (
    <div className={`preview-root shp ${mode === 'dark' ? 'dark' : ''}`} style={vars}>
      <p className="shp-promo">Free delivery on orders over €60</p>
      <header className="shp-header">
        <span className="shp-mark font-heading">ladle</span>
        <nav className="shp-nav" aria-label="departments">
          <span>Kitchen</span>
          <span>Table</span>
          <span>Lighting</span>
        </nav>
        <div className="shp-bag-wrap">
          <button
            type="button"
            className="shp-bag-btn"
            aria-expanded={bagOpen}
            aria-controls={`shp-bag-${uid}`}
            onClick={() => setBagOpen((o) => !o)}
          >
            <ShoppingBag aria-hidden />
            Bag
            <span className="shp-count" aria-label={`${count} items`}>
              {count}
            </span>
          </button>
          {bagOpen && (
            <div className="shp-bag" id={`shp-bag-${uid}`} role="region" aria-label="bag">
              {count === 0 ? (
                <p>Your bag is empty.</p>
              ) : (
                <>
                  <ul>
                    {Object.entries(bag).map(([name, n]) => (
                      <li key={name}>
                        <span>
                          {n} × {name}
                        </span>
                        <span>€{n * PRICES[name]}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="shp-bag-total">
                    <span>Total</span>
                    <span>€{total}</span>
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="shp-main">
        <p className="shp-crumbs">Kitchen / Teapots / Dome teapot</p>
        <div className="shp-product">
          <div className="shp-gallery">
            {VIEWS.map((v, i) =>
              i === view ? (
                <div key={v.name} className="shp-stage">
                  {photo(`view-${v.name}`, v.src, finish.stops, `shp-main-photo ${v.className}`, v.alt)}
                </div>
              ) : null,
            )}
            <div className="shp-thumbs" role="group" aria-label="views">
              {VIEWS.map((v, i) => (
                <button
                  key={v.name}
                  type="button"
                  className="shp-thumb"
                  aria-pressed={i === view}
                  aria-label={`show ${v.name}`}
                  onClick={() => setView(i)}
                >
                  {photo(`thumb-${v.name}`, v.src, finish.stops, v.className, '')}
                </button>
              ))}
            </div>
          </div>

          <div className="shp-info">
            <h1 className="shp-title font-heading">Dome teapot</h1>
            <div className="shp-rating">
              <span className="shp-stars" aria-label="4.8 out of 5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} aria-hidden fill="currentColor" />
                ))}
              </span>
              <span>4.8</span>
              <button type="button" className="shp-link" onClick={() => setTab('reviews')}>
                126 reviews
              </button>
            </div>
            <p className="shp-price">€{PRICES['Dome teapot']}</p>
            <p className="shp-desc">
              A low, domed pot with a long straight spout and a wooden handle set high over the lid, so it stays cool.
              Holds one litre, about four cups.
            </p>

            <fieldset className="shp-finish">
              <legend>
                Finish: <b>{finish.name}</b>
              </legend>
              <div className="shp-swatches">
                {FINISHES.map((f) => (
                  <label key={f.name} className="shp-swatch" title={f.name}>
                    <input
                      type="radio"
                      name={`shp-finish-${uid}`}
                      checked={f.name === finish.name}
                      onChange={() => setFinish(f)}
                      aria-label={f.name}
                    />
                    <i style={{ background: `var(--${f.swatch})` }} />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="shp-buy">
              <div className="shp-qty" role="group" aria-label="quantity">
                <button type="button" aria-label="one fewer" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>
                  <Minus aria-hidden />
                </button>
                <output aria-live="polite">{qty}</output>
                <button type="button" aria-label="one more" disabled={qty >= 9} onClick={() => setQty((q) => q + 1)}>
                  <Plus aria-hidden />
                </button>
              </div>
              <button type="button" className="shp-btn shp-btn-primary" onClick={() => add(productName, qty)}>
                Add to bag
              </button>
            </div>
            {added && (
              <p className="shp-added" role="status">
                {added}
              </p>
            )}
            <ul className="shp-promises">
              <li>
                <Truck aria-hidden />
                Ships in 2–3 working days
              </li>
              <li>
                <RotateCcw aria-hidden />
                Free returns within 30 days
              </li>
            </ul>
          </div>
        </div>

        <section className="shp-tabs-wrap" aria-label="product information">
          <div className="shp-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`shp-tab-${t.id}-${uid}`}
                aria-selected={tab === t.id}
                aria-controls={`shp-tabpanel-${uid}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            className="shp-tabpanel"
            id={`shp-tabpanel-${uid}`}
            role="tabpanel"
            aria-labelledby={`shp-tab-${tab}-${uid}`}
          >
            {tab === 'details' && (
              <dl className="shp-specs">
                {DETAILS.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {tab === 'care' && (
              <div className="shp-care">
                <p>Rinse with warm water after use and dry it straight away. No dishwasher.</p>
                <p>Not for the hob: warm it with hot water before you brew.</p>
                <p>Polish the body with a soft dry cloth. Oil the handle once a year.</p>
              </div>
            )}
            {tab === 'reviews' && (
              <div className="shp-reviews">
                <div className="shp-dist" aria-label="ratings">
                  {DIST.map(([stars, n]) => (
                    <div key={stars} className="shp-dist-row">
                      <span>{stars} ★</span>
                      <span className="shp-bar" aria-hidden>
                        <i style={{ width: `${(n / 126) * 100}%` }} />
                      </span>
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
                <div className="shp-review-list">
                  {REVIEWS.map((r) => (
                    <article key={r.who} className="shp-review">
                      <p className="shp-review-head">
                        <b>{r.title}</b>
                        <span>
                          {r.who} · {r.stars} ★
                        </span>
                      </p>
                      <p>{r.text}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="shp-related" aria-label="goes with">
          <h2 className="shp-h2 font-heading">Goes with</h2>
          <div className="shp-cards">
            {RELATED.map((r) => (
              <article key={r.name} className="shp-card">
                {photo(`rel-${r.id}`, r.src, ['foreground', 'muted-foreground', 'card'], 'shp-card-photo', r.alt)}
                <div className="shp-card-row">
                  <div>
                    <h3>{r.name}</h3>
                    <p>€{PRICES[r.name]}</p>
                  </div>
                  <button
                    type="button"
                    className="shp-quick"
                    aria-label={`add ${r.name}`}
                    onClick={() => add(r.name, 1)}
                  >
                    <Plus aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="shp-footer">
        <span>ladle · homewares</span>
        <span>Product photographs: The Metropolitan Museum of Art, public domain</span>
      </footer>
    </div>
  )
}

interface Finish {
  name: string
  /** Gradient-map stops for the product photographs. */
  stops: string[]
  /** The token the swatch shows. */
  swatch: string
}

/** Three finishes, each the palette's own. */
const FINISHES: Finish[] = [
  { name: 'Steel', stops: ['foreground', 'muted-foreground', 'background'], swatch: 'muted-foreground' },
  { name: 'Primary enamel', stops: ['foreground', 'primary', 'background'], swatch: 'primary' },
  { name: 'Accent enamel', stops: ['foreground', 'accent-strong', 'background'], swatch: 'accent-strong' },
]

const VIEWS = [
  { name: 'front', src: teapot, className: '', alt: 'A domed teapot with a straight spout and a raised wooden handle' },
  {
    name: 'back',
    src: teapotBack,
    className: '',
    alt: 'The teapot from the other side, the handle arching over the lid',
  },
  { name: 'handle', src: teapot, className: 'shp-zoom', alt: 'Close up of the wooden handle' },
]

const PRICES: Record<string, number> = {
  'Dome teapot': 148,
  'Dome teapot, steel': 148,
  'Dome teapot, primary enamel': 148,
  'Dome teapot, accent enamel': 148,
  'Cream jug': 64,
  'Sugar bowl': 58,
  'Bud vase': 42,
}

const RELATED = [
  { id: 'pitcher', name: 'Cream jug', src: pitcher, alt: 'A small jug' },
  { id: 'sugar', name: 'Sugar bowl', src: sugarBowl, alt: 'A lidded sugar bowl' },
  { id: 'vase', name: 'Bud vase', src: vase, alt: 'A small vase' },
]

type Tab = 'details' | 'care' | 'reviews'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'care', label: 'Care' },
  { id: 'reviews', label: 'Reviews (126)' },
]

const DETAILS: Array<[string, string]> = [
  ['Capacity', '1 litre, about four cups'],
  ['Body', 'Steel, polished or enamelled'],
  ['Handle', 'Wood, oiled'],
  ['Size', '24 × 14 × 18 cm'],
  ['Weight', '780 g'],
]

const DIST: Array<[number, number]> = [
  [5, 104],
  [4, 15],
  [3, 4],
  [2, 2],
  [1, 1],
]

const REVIEWS = [
  {
    who: 'Hana',
    stars: 5,
    title: 'Pours without dripping',
    text: 'The spout is long and straight and stops clean. The handle stays cool.',
  },
  {
    who: 'Ruben',
    stars: 4,
    title: 'Lovely, but small',
    text: 'One litre is four small cups. I wish I had bought two.',
  },
]
