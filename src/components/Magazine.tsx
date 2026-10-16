import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { TokenSpaceProps } from '../mockups'
import { TokenPhoto } from './TokenPhoto'
import type { TokenPhotoProps } from './TokenPhoto'
import dunes from '../assets/magazine/dunes.jpg'
import salk from '../assets/magazine/salk.jpg'
import stairwell from '../assets/magazine/stairwell.jpg'
import vase from '../assets/magazine/vase.jpg'
import windowPhoto from '../assets/magazine/window.jpg'
import './Magazine.css'

/**
 * The first showcase mockup: a quarterly magazine, five spreads. Print, so it
 * has no controls; what it demonstrates is the palette at the scale of a page.
 *
 * It keeps the token space's two promises the way the app mockups do:
 *
 * - Text sits only on a surface whose pair the contrast report checks — each
 *   surface with its own foreground, and `link` on the page or a card — never
 *   on a photograph. e2e/mockup-magazine.spec.ts walks every text node to hold
 *   it to that.
 * - Photographs are part of the palette: each is recoloured by a gradient map
 *   whose stops are tokens (TokenPhoto.tsx), so locate mode dims a photo exactly as
 *   it dims a card.
 *
 * Sizes are in `cqi` of the spread, so the composition scales with the frame
 * as print does. Photographs are public domain or CC0
 * (src/assets/magazine/SOURCES.md).
 */
export function Magazine({ tokens, mode, uid, effects, budget = 'full' }: TokenSpaceProps) {
  const vars = {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
    ...effects,
  } as CSSProperties
  const photo = (
    name: string,
    src: string,
    stops: string[],
    rest: Omit<TokenPhotoProps, 'id' | 'src' | 'stops' | 'tokens' | 'className'>,
  ) => <TokenPhoto id={`mag-${name}-${uid}`} src={src} stops={stops} tokens={tokens} budget={budget} className="mag-photo" {...rest} />

  return (
    <div className={`preview-root mag ${mode === 'dark' ? 'dark' : ''}`} style={vars}>
      {/* ------------------------------------------------ cover + contents */}
      <Spread label="Cover and contents">
        <article className="mag-page mag-cover">
          <Masthead font={effects['--font-heading']}>Meridian</Masthead>
          <div className="mag-cover-meta">
            <span>No. 14</span>
            <span>The light issue</span>
            <span>Autumn 2026</span>
          </div>
          {photo('dunes', dunes, ['foreground', 'primary', 'background'], {
            contrast: 1.25,
            alt: 'Sand dunes under a clear sky',
          })}
          <div className="mag-cover-lines">
            <p className="mag-kicker">Inside</p>
            <p className="mag-display font-heading">Concrete, porcelain, paint</p>
            <ul>
              <li><b>06</b><span>The Salk Institute at sixty</span></li>
              <li><b>18</b><span>A Song dynasty vase</span></li>
              <li><b>24</b><span>Mara Vell on painting at night</span></li>
            </ul>
          </div>
        </article>
        <article className="mag-page mag-contents">
          <p className="mag-kicker">Contents</p>
          <h2 className="mag-display font-heading">
            In this
            <br />
            issue
          </h2>
          <ol className="mag-toc">
            {CONTENTS.map((c, i) => (
              <li key={c.title}>
                <span className="mag-n font-heading">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{c.title}</h3>
                  <p>{c.deck}</p>
                </div>
                <span className="mag-pg">p. {c.page}</span>
              </li>
            ))}
          </ol>
          <div className="mag-editor">
            {photo('editor', salk, ['foreground', 'link', 'background'], { position: '70% 50%', alt: '' })}
            <div>
              <p>
                This issue looks at how light changes what we see: a building over one day, a glaze under a
                lamp, a painting made after dark.
              </p>
              <p>— The editors</p>
            </div>
          </div>
          <span className="mag-folio mag-r">Meridian · 02</span>
        </article>
      </Spread>

      {/* ---------------------------------------------------------- feature */}
      <Spread label="Feature">
        <article className="mag-page mag-bleed mag-feature-img">
          {photo('salk', salk, ['primary', 'background'], {
            contrast: 1.15,
            alt: 'The concrete towers of the Salk Institute against the sky',
          })}
          <div className="mag-plate">
            <b>The Salk Institute, La Jolla</b>
            Photograph: Carol M. Highsmith, Library of Congress
          </div>
        </article>
        <article className="mag-page mag-feature">
          <p className="mag-kicker">Architecture · 06</p>
          <h2 className="mag-display font-heading">
            The light falls in <span className="mag-link">blocks.</span>
          </h2>
          <p className="mag-deck">
            Louis Kahn's laboratory in La Jolla opened in 1965. Sixty years later, we spent a day in its courtyard.
          </p>
          <p className="mag-byline">Words by Ines Okafor</p>
          <div className="mag-body">
            <p>
              At eleven the courtyard is almost all light. By two, the shadow of the west wing covers half of it,
              and by five the whole floor is in shade.
            </p>
            <p>
              The walls are concrete, cast against wooden formwork, and up close you can still see the grain of
              the boards. From the far end of the courtyard they read as one surface.
            </p>
            <blockquote className="mag-pull font-heading">
              “The building stays the same. The light on it changes all day.”
            </blockquote>
            <p>
              A narrow channel of water runs down the middle of the courtyard toward the Pacific. The building
              stays the same. The light on it changes all day.
            </p>
          </div>
          <span className="mag-folio mag-r">07</span>
        </article>
      </Spread>

      {/* ----------------------------------------------------- object study */}
      <Spread label="Object study">
        <article className="mag-page mag-on-secondary mag-object">
          <p className="mag-kicker">
            <span>Object study</span>
            <span>No. 07</span>
          </p>
          {photo('vase', vase, ['foreground', 'link', 'secondary'], {
            contrast: 1.4,
            alt: 'A pale porcelain vase on a plain background',
          })}
          <span className="mag-folio mag-l">18</span>
        </article>
        <article className="mag-page mag-study">
          <p className="mag-kicker">Collection</p>
          <h2 className="mag-display font-heading">Qingbai</h2>
          <p className="mag-sub">A vase, Jingdezhen, eleventh to twelfth century</p>
          <dl className="mag-specs">
            <dt>Period</dt>
            <dd>Northern Song dynasty</dd>
            <dt>Material</dt>
            <dd>Porcelain, bluish-white glaze</dd>
            <dt>Decoration</dt>
            <dd>Incised, under the glaze</dd>
            <dt>Held</dt>
            <dd>The Metropolitan Museum of Art</dd>
          </dl>
          <p className="mag-note">
            “Qingbai” means bluish white, the colour the glaze takes where it pools. The decoration is incised
            into the clay under the glaze, so it shows best in low, raking light and almost disappears under a
            ceiling lamp.
          </p>
          <p className="mag-credit">Photograph: The Metropolitan Museum of Art, public domain</p>
          <span className="mag-folio mag-r">19</span>
        </article>
      </Spread>

      {/* -------------------------------------------------------- interview */}
      <Spread label="Interview">
        <article className="mag-page mag-on-primary mag-quote-page">
          <p className="mag-kicker">Conversation · 24</p>
          <p className="mag-display font-heading">“I paint with the lights off, and fix it in the morning.”</p>
          <div className="mag-who">
            <span>Mara Vell, painter</span>
            <span>Interview by Teo Brandt</span>
          </div>
        </article>
        <article className="mag-page mag-qa">
          {photo('window', windowPhoto, ['foreground', 'primary', 'background'], {
            contrast: 1.1,
            position: '50% 62%',
            alt: 'A figure in silhouette before a tall window',
          })}
          <dl>
            {INTERVIEW.map(([q, a]) => (
              <div key={q}>
                <dt>{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>
          <span className="mag-folio mag-r">25</span>
        </article>
      </Spread>

      {/* ------------------------------------------------------- back cover */}
      <Spread label="Back cover">
        <article className="mag-page mag-bleed mag-back">
          {photo('stairwell', stairwell, ['foreground', 'link', 'background'], {
            contrast: 1.2,
            alt: 'Looking down a stairwell',
          })}
          <div className="mag-colophon">Meridian · Quarterly · Est. 2013</div>
          <div className="mag-sub-card">
            <p className="mag-kicker">Subscribe</p>
            <p className="mag-display font-heading">Four issues a year</p>
            <p>Printed on uncoated paper and posted at the start of each season.</p>
            <div className="mag-sub-row">
              <span className="mag-price font-heading">
                €64<small>per year</small>
              </span>
              {/* Print: an address, not a button. */}
              <span className="mag-stamp">meridian.example/subscribe</span>
            </div>
          </div>
          {/* The printer's colour bar: the surfaces this issue was printed in. */}
          <div className="mag-colorbar" aria-hidden>
            {COLOR_BAR.map((t) => (
              <i key={t} style={{ background: `var(--${t})` }} />
            ))}
          </div>
        </article>
      </Spread>
    </div>
  )
}

const CONTENTS = [
  { title: "Editor's letter", deck: 'Why this issue is about light.', page: '03' },
  { title: 'The Salk Institute at sixty', deck: "Louis Kahn's laboratory, and the courtyard between its two wings.", page: '06' },
  { title: 'Object study: qingbai', deck: 'A porcelain vase from Jingdezhen, 11th–12th century.', page: '18' },
  { title: 'Painting at night', deck: 'Mara Vell on working without daylight.', page: '24' },
]

const INTERVIEW: Array<[string, string]> = [
  ['Why work in the dark?', 'Because colour lies in daylight. In the dark I only have value, light against dark, and if the painting works there, it works.'],
  ['And in the morning?', "I find out which reds went brown. Usually all of them. That's the job: keep the values, fix the hues."],
  ['Do you still pick colours by eye?', 'I pick two by eye and mix the rest from them, so everything on the canvas is related to those two.'],
  ['What are you working on now?', 'A series of paintings of one window, each made at a different hour.'],
]

const COLOR_BAR = ['background', 'secondary', 'accent', 'link', 'primary', 'chart-1', 'chart-2', 'chart-3', 'foreground']

function Spread({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mag-spread" aria-label={label}>
      {children}
    </section>
  )
}

/**
 * The masthead fills its page edge to edge in whatever face the theme sets.
 * Measured rather than guessed: the same word is half again as wide in
 * Barlow Condensed's opposite. Refits when the page resizes (split view) and
 * when a face finishes loading.
 */
function Masthead({ font, children }: { font: string | undefined; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const page = el?.parentElement
    if (!el || !page) return
    const fit = () => {
      const pad = parseFloat(getComputedStyle(page).paddingLeft) || 0
      const room = page.clientWidth - 2 * pad
      el.style.fontSize = '100px'
      if (room > 0 && el.scrollWidth > 0) el.style.fontSize = `${(100 * room) / el.scrollWidth}px`
    }
    fit()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(page)
    document.fonts?.addEventListener?.('loadingdone', fit)
    return () => {
      ro?.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', fit)
    }
  }, [font])
  return (
    <h1 ref={ref} className="mag-mast font-heading">
      {children}
    </h1>
  )
}
