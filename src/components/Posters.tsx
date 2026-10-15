import type { CSSProperties, ReactNode } from 'react'
import type { TokenSpaceProps } from '../mockups'
import { TokenPhoto } from './TokenPhoto'
import fern from '../assets/poster/fern.jpg'
import './Posters.css'

/**
 * A showcase mockup in the abstract register: one concert season's printed
 * matter on a wall. Three posters, a season listing and two tickets. Print,
 * so no controls.
 *
 * The art is generated, not drawn: each poster's shapes come from a seeded
 * random walk over a few tokens, so the composition is fixed (a theme always
 * gets the same poster) and only the colours are the theme's. Shapes fill
 * with `var(--token)`, so locate mode dims them like a card.
 *
 * Honesty, as in the magazine: text sits only on a surface whose pair the
 * contrast report checks, never on art. The art is `.showcase-art` and the
 * photograph a TokenPhoto, and e2e/mockup-posters.spec.ts fails any text
 * that overlaps either.
 */
export function Posters({ tokens, mode, uid, effects }: TokenSpaceProps) {
  const vars = {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
    ...effects,
  } as CSSProperties

  return (
    <div className={`preview-root pst ${mode === 'dark' ? 'dark' : ''}`} style={vars}>
      <div className="pst-wall">
        <div className="pst-board">
          <div className="pst-row">
            {/* ---------------------------------------------- quarter circles */}
            <Poster label="Poster: Music for 18 Musicians">
              <PosterHead />
              <Tiles seed={7} cols={4} rows={4} />
              <div className="pst-bill">
                <p className="pst-date">
                  <b className="font-heading">14</b>
                  <span>
                    Thursday
                    <br />
                    November, 8 pm
                  </span>
                </p>
                <h2 className="pst-title font-heading">Music for 18 Musicians</h2>
                <p className="pst-who">Steve Reich · played by the Hall Nine Ensemble</p>
              </div>
            </Poster>

            {/* ----------------------------------------------- disc and bands */}
            <Poster label="Poster: Tabula Rasa" className="pst-on-secondary">
              <PosterHead />
              <Bands />
              <div className="pst-bill">
                <p className="pst-date">
                  <b className="font-heading">28</b>
                  <span>
                    Thursday
                    <br />
                    November, 8 pm
                  </span>
                </p>
                <h2 className="pst-title font-heading">Tabula Rasa</h2>
                <p className="pst-who">Arvo Pärt · two violins, prepared piano and strings</p>
              </div>
            </Poster>

            {/* ---------------------------------------------------- photograph */}
            <Poster label="Poster: Cello Suites" className="pst-photo-poster">
              <PosterHead />
              <TokenPhoto
                id={`pst-fern-${uid}`}
                src={fern}
                stops={['foreground', 'primary', 'background']}
                tokens={tokens}
                contrast={1.2}
                position="50% 25%"
                className="pst-photo"
                alt="A fern frond, printed as a cyanotype"
              />
              <div className="pst-block">
                <p className="pst-date">
                  <b className="font-heading">12</b>
                  <span>
                    Thursday
                    <br />
                    December, 8 pm
                  </span>
                </p>
                <h2 className="pst-title font-heading">Cello Suites 1–3</h2>
                <p className="pst-who">J. S. Bach · solo cello</p>
                <p className="pst-credit">Fern: Anna Atkins, cyanotype, about 1853</p>
              </div>
            </Poster>
          </div>

          <div className="pst-row pst-row-2">
            {/* ------------------------------------------------ season listing */}
            <section className="pst-listing" aria-label="Season listing">
              <p className="pst-kicker">Hall Nine · Autumn concerts</p>
              <h2 className="pst-listing-title font-heading">Four Thursdays</h2>
              <table>
                <tbody>
                  {SEASON.map((c) => (
                    <tr key={c.date}>
                      <td className="pst-listing-date">{c.date}</td>
                      <td>
                        <b>{c.work}</b> {c.composer}
                      </td>
                      <td className="pst-listing-price">{c.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pst-listing-foot">
                Doors 7.30 pm. Tickets at the door or <span className="pst-link">hallnine.example</span>
              </p>
            </section>

            {/* ------------------------------------------------------- tickets */}
            <div className="pst-tickets">
              {TICKETS.map((t) => (
                <article key={t.seat} className="pst-ticket" aria-label={`Ticket, ${t.work}`}>
                  <div className="pst-ticket-main">
                    <p className="pst-kicker">Hall Nine</p>
                    <p className="pst-ticket-work font-heading">{t.work}</p>
                    <p>{t.date}</p>
                  </div>
                  <div className="pst-ticket-stub">
                    <span>Seat</span>
                    <b className="font-heading">{t.seat}</b>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const SEASON = [
  {
    date: '14 Nov',
    work: 'Music for 18 Musicians',
    composer: 'Reich',
    price: '€18',
  },
  { date: '28 Nov', work: 'Tabula Rasa', composer: 'Pärt', price: '€18' },
  { date: '12 Dec', work: 'Cello Suites 1–3', composer: 'Bach', price: '€14' },
  { date: '19 Dec', work: 'In C', composer: 'Riley', price: '€14' },
]

const TICKETS = [
  { work: 'Tabula Rasa', date: 'Thu 28 Nov, 8 pm', seat: 'F12' },
  { work: 'Cello Suites', date: 'Thu 12 Dec, 8 pm', seat: 'B04' },
]

function Poster({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <article className={`pst-poster ${className}`} aria-label={label}>
      {children}
    </article>
  )
}

function PosterHead() {
  return (
    <p className="pst-head">
      <span>Hall Nine</span>
      <span>Autumn concerts</span>
    </p>
  )
}

/** A small seeded PRNG (mulberry32): the same seed draws the same poster. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fill = (token: string): CSSProperties => ({ fill: `var(--${token})` })

/** The poster palette: the brand's colours and the page's two ends. */
const TILE_INKS = ['primary', 'accent-strong', 'link', 'foreground', 'accent', 'background']

/**
 * Quarter circles, half discs and dots on a grid, the oldest trick in Swiss
 * posters. Each tile is a ground and a figure in two different inks.
 */
function Tiles({ seed, cols, rows }: { seed: number; cols: number; rows: number }) {
  const r = rng(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const tiles: ReactNode[] = []
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const ground = pick(TILE_INKS)
      let figure = pick(TILE_INKS)
      while (figure === ground) figure = pick(TILE_INKS)
      const turn = Math.floor(r() * 4) * 90
      const kind = r()
      const shape =
        kind < 0.5 ? (
          <path d="M0 0H1A1 1 0 0 1 0 1Z" style={fill(figure)} />
        ) : kind < 0.75 ? (
          <path d="M0 0H1A.5 .5 0 0 1 0 0Z" style={fill(figure)} />
        ) : kind < 0.9 ? (
          <circle cx=".5" cy=".5" r=".32" style={fill(figure)} />
        ) : (
          <>
            <path d="M0 0H.5A.5 .5 0 0 1 0 .5Z" style={fill(figure)} />
            <path d="M1 1H.5A.5 .5 0 0 1 1 .5Z" style={fill(figure)} />
          </>
        )
      tiles.push(
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${turn} .5 .5)`}>
          <rect width="1" height="1" style={fill(ground)} />
          {shape}
        </g>,
      )
    }
  return (
    <svg className="showcase-art pst-art" viewBox={`0 0 ${cols} ${rows}`} aria-hidden>
      {tiles}
    </svg>
  )
}

/** A low sun behind a field of bands, cut by the poster's own ground. */
function Bands() {
  const bands = ['accent-strong', 'link', 'primary', 'foreground']
  return (
    <svg className="showcase-art pst-art" viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" style={fill('accent')} />
      <circle cx="20" cy="22" r="13" style={fill('primary')} />
      {bands.map((t, i) => (
        <rect key={t} x="0" y={24 + i * 4} width="40" height="4" style={fill(t)} />
      ))}
      {/* Cuts in the poster's ground, widening toward the horizon. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="0" y={11 + i * 2.6} width="40" height={0.25 + i * 0.22} style={fill('accent')} />
      ))}
    </svg>
  )
}
