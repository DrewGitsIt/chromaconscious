import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Bookmark, Flag, Heart, Mountain, Pause, Play, RotateCcw, Search, Square } from 'lucide-react'
import type { TokenSpaceProps } from '../mockups'
import { TokenPhoto } from './TokenPhoto'
import canyon from '../assets/trail/canyon.jpg'
import forest from '../assets/trail/forest.jpg'
import lake from '../assets/trail/lake.jpg'
import meadow from '../assets/trail/meadow.jpg'
import ridge from '../assets/trail/ridge.jpg'
import './Trail.css'

/**
 * A showcase mockup in the realistic register: a hiking app, three phones on
 * a field. Explore lists trails, the middle phone is one trail, the right one
 * records a hike. Every control works, and the phones are one app: save a
 * trail on either of the first two and both hearts fill; start the trail and
 * the third phone starts recording.
 *
 * Honesty, as in the magazine: text sits only on a surface whose pair the
 * contrast report checks, never on a photograph or the map. Difficulty
 * badges use the status pairs (success, warning, destructive subtle), which
 * the report checks too. e2e/mockup-trail.spec.ts holds it to that.
 *
 * Sizes are cqi of the field, so the trio scales with the frame.
 */
export function Trail({ tokens, mode, uid, effects, budget = 'full' }: TokenSpaceProps) {
  const vars = {
    ...Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v])),
    ...effects,
  } as CSSProperties
  const [saved, setSaved] = useState<Set<string>>(() => new Set(['North ridge']))
  const toggleSaved = (name: string) =>
    setSaved((s) => {
      const next = new Set(s)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const rec = useRecording()
  const photo = (t: TrailInfo, where: string, className: string) => (
    <TokenPhoto
      id={`trl-${where}-${t.photo}-${uid}`}
      src={PHOTOS[t.photo]}
      stops={['foreground', 'primary', 'background']}
      tokens={tokens}
      budget={budget}
      contrast={1.15}
      position={t.position}
      className={className}
      alt={t.alt}
    />
  )

  return (
    <div className={`preview-root trl ${mode === 'dark' ? 'dark' : ''}`} style={vars}>
      <div className="trl-wall">
        <div className="trl-field">
          <Contours className="showcase-art trl-backdrop" seed={3} />
          <Phone label="Explore">
            <Explore saved={saved} toggleSaved={toggleSaved} photo={photo} uid={uid} />
          </Phone>
          <Phone label="Trail" raised>
            <Detail
              trail={FEATURED}
              saved={saved.has(FEATURED.name)}
              toggleSaved={() => toggleSaved(FEATURED.name)}
              start={rec.start}
              recording={rec.state !== 'done' && rec.state !== 'paused'}
              photo={photo}
              uid={uid}
            />
          </Phone>
          <Phone label="Recording">
            <Record rec={rec} />
          </Phone>
        </div>
      </div>
    </div>
  )
}

type Level = 'Easy' | 'Moderate' | 'Hard'
interface TrailInfo {
  name: string
  kind: string
  km: number
  gain: number
  hours: string
  level: Level
  photo: keyof typeof PHOTOS
  position?: string
  alt: string
}

const PHOTOS = { forest, ridge, lake, meadow, canyon }

const TRAILS: TrailInfo[] = [
  {
    name: 'Meadow traverse',
    kind: 'Point to point',
    km: 8.4,
    gain: 380,
    hours: '3 h',
    level: 'Moderate',
    photo: 'meadow',
    alt: 'An open meadow between stands of conifers',
  },
  {
    name: 'North ridge',
    kind: 'Out and back',
    km: 11.8,
    gain: 910,
    hours: '5 h 30',
    level: 'Hard',
    photo: 'ridge',
    alt: 'Layered mountain ridges in haze',
  },
  {
    name: 'Cedar hollow',
    kind: 'Loop',
    km: 6.2,
    gain: 240,
    hours: '2 h',
    level: 'Easy',
    photo: 'forest',
    alt: 'A dirt path running into fog under thin trees',
  },
  {
    name: 'Lakeshore path',
    kind: 'Loop',
    km: 4.5,
    gain: 60,
    hours: '1 h 15',
    level: 'Easy',
    photo: 'lake',
    alt: 'Rocky peaks mirrored in a still lake',
  },
  {
    name: 'The narrows',
    kind: 'Out and back',
    km: 9.1,
    gain: 520,
    hours: '4 h',
    level: 'Moderate',
    photo: 'canyon',
    alt: 'The ribbed sandstone walls of a slot canyon',
  },
]
const FEATURED = TRAILS[0]

const LEVEL_CLASS: Record<Level, string> = {
  Easy: 'trl-easy',
  Moderate: 'trl-moderate',
  Hard: 'trl-hard',
}

type PhotoFn = (t: TrailInfo, where: string, className: string) => ReactNode

/** Device hardware: the bezel is the phone's, not the palette's. */
function Phone({ label, raised = false, children }: { label: string; raised?: boolean; children: ReactNode }) {
  return (
    <section className={`trl-phone ${raised ? 'trl-raised' : ''}`} aria-label={`Phone: ${label}`}>
      <div className="trl-screen">
        <div className="trl-status" aria-hidden>
          <span>9:41</span>
          <span className="trl-status-icons">
            <i />
            <i />
            <i />
          </span>
        </div>
        {children}
      </div>
    </section>
  )
}

function Badge({ level }: { level: Level }) {
  return <span className={`trl-badge ${LEVEL_CLASS[level]}`}>{level}</span>
}

function SaveButton({
  on,
  name,
  toggle,
  className = '',
}: {
  on: boolean
  name: string
  toggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`trl-save ${className}`}
      aria-pressed={on}
      aria-label={on ? `remove ${name} from saved` : `save ${name}`}
      onClick={toggle}
    >
      <Heart aria-hidden fill={on ? 'currentColor' : 'none'} />
    </button>
  )
}

/* ------------------------------------------------------------- explore */

function Explore({
  saved,
  toggleSaved,
  photo,
  uid,
}: {
  saved: Set<string>
  toggleSaved: (name: string) => void
  photo: PhotoFn
  uid: string
}) {
  const [tab, setTab] = useState<'explore' | 'saved'>('explore')
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<Level | null>(null)
  const shown = TRAILS.filter(
    (t) =>
      (tab === 'explore' || saved.has(t.name)) &&
      (level == null || t.level === level) &&
      t.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <>
      <div className="trl-body">
        <h2 className="trl-h font-heading">{tab === 'explore' ? 'Trails near you' : 'Saved trails'}</h2>
        <label className="trl-search">
          <Search aria-hidden />
          <input
            id={`trl-q-${uid}`}
            type="search"
            placeholder="Search trails"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="trl-chips" role="group" aria-label="difficulty">
          {(['Easy', 'Moderate', 'Hard'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className="trl-chip"
              aria-pressed={level === l}
              onClick={() => setLevel(level === l ? null : l)}
            >
              {l}
            </button>
          ))}
        </div>
        <ul className="trl-list">
          {shown.map((t) => (
            <li key={t.name} className="trl-item">
              {photo(t, 'list', 'trl-thumb')}
              <div className="trl-item-text">
                <h3>{t.name}</h3>
                <p>
                  {t.km} km · {t.gain} m up
                </p>
                <Badge level={t.level} />
              </div>
              <SaveButton on={saved.has(t.name)} name={t.name} toggle={() => toggleSaved(t.name)} />
            </li>
          ))}
          {shown.length === 0 && (
            <li className="trl-empty">
              {tab === 'saved' && saved.size === 0 ? 'Nothing saved yet.' : 'No trails match.'}
            </li>
          )}
        </ul>
      </div>
      <nav className="trl-tabs" aria-label="sections">
        <button type="button" aria-current={tab === 'explore' ? 'page' : undefined} onClick={() => setTab('explore')}>
          <Mountain aria-hidden />
          Explore
        </button>
        <button type="button" aria-current={tab === 'saved' ? 'page' : undefined} onClick={() => setTab('saved')}>
          <Bookmark aria-hidden />
          Saved
          <span className="trl-count">{saved.size}</span>
        </button>
      </nav>
    </>
  )
}

/* -------------------------------------------------------------- detail */

function Detail({
  trail,
  saved,
  toggleSaved,
  start,
  recording,
  photo,
  uid,
}: {
  trail: TrailInfo
  saved: boolean
  toggleSaved: () => void
  start: () => void
  recording: boolean
  photo: PhotoFn
  uid: string
}) {
  const [view, setView] = useState<'elevation' | 'map'>('elevation')
  return (
    <div className="trl-body trl-detail">
      {photo(trail, 'hero', 'trl-hero')}
      <div className="trl-title-row">
        <div>
          <h2 className="trl-h font-heading">{trail.name}</h2>
          <p className="trl-sub">
            {trail.kind} · <Badge level={trail.level} />
          </p>
        </div>
        <SaveButton on={saved} name={trail.name} toggle={toggleSaved} className="trl-save-lg" />
      </div>
      <dl className="trl-stats">
        <div>
          <dt>Length</dt>
          <dd>{trail.km} km</dd>
        </div>
        <div>
          <dt>Climb</dt>
          <dd>{trail.gain} m</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{trail.hours}</dd>
        </div>
      </dl>
      <div className="trl-seg" role="tablist" aria-label="trail view">
        {(['elevation', 'map'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            id={`trl-tab-${v}-${uid}`}
            aria-selected={view === v}
            aria-controls={`trl-panel-${uid}`}
            onClick={() => setView(v)}
          >
            {v === 'elevation' ? 'Elevation' : 'Map'}
          </button>
        ))}
      </div>
      <div className="trl-panel" id={`trl-panel-${uid}`} role="tabpanel" aria-labelledby={`trl-tab-${view}-${uid}`}>
        {view === 'elevation' ? <Profile /> : <RouteMap progress={1} />}
        <p className="trl-panel-cap">
          {view === 'elevation' ? `Highest point ${PEAK} m, at ${PEAK_KM} km` : 'From the south trailhead to the north'}
        </p>
      </div>
      <button type="button" className="trl-btn trl-btn-primary trl-go" onClick={start} disabled={recording}>
        {recording ? 'Recording' : 'Start this trail'}
      </button>
    </div>
  )
}

/* ----------------------------------------------------------- recording */

type RecState = 'ready' | 'running' | 'paused' | 'done'
/** Walking pace for the readouts, metres a second. */
const PACE = 1.3
const TOTAL_S = Math.round((FEATURED.km * 1000) / PACE)

function useRecording() {
  // Opens paused partway along, so the phone has something to show.
  const [state, setState] = useState<RecState>('paused')
  const [seconds, setSeconds] = useState(2538)
  const [marks, setMarks] = useState<string[]>(
    ['Footbridge', 'Viewpoint'].map((n, i) => `${n} · ${[1.2, 2.9][i].toFixed(1)} km`),
  )
  useEffect(() => {
    if (state !== 'running') return
    const t = setInterval(() => setSeconds((s) => Math.min(s + 1, TOTAL_S)), 1000)
    return () => clearInterval(t)
  }, [state])
  const km = (seconds * PACE) / 1000
  return {
    state,
    seconds,
    km,
    marks,
    start: () => {
      setSeconds(0)
      setMarks([])
      setState('running')
    },
    toggle: () => setState((s) => (s === 'running' ? 'paused' : 'running')),
    mark: () => setMarks((m) => [...m, `Waypoint ${m.length + 1} · ${km.toFixed(1)} km`]),
    finish: () => setState('done'),
  }
}

const clock = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function Record({ rec }: { rec: ReturnType<typeof useRecording> }) {
  const progress = Math.min(rec.km / FEATURED.km, 1)
  const climbed = Math.round(climbTo(progress))
  // seconds per km, rounded whole, so it never reads 12:60
  const pace = rec.km > 0 ? Math.round(rec.seconds / rec.km) : 0
  const label = {
    ready: 'Ready',
    running: 'Recording',
    paused: 'Paused',
    done: 'Finished',
  }[rec.state]
  return (
    <div className="trl-body trl-rec">
      <div className="trl-rec-head">
        <h2 className="trl-h font-heading">{FEATURED.name}</h2>
        <span className={`trl-state trl-state-${rec.state}`} role="status">
          {label}
        </span>
      </div>
      <div className="trl-rec-map">
        <RouteMap progress={progress} />
      </div>
      <div className="trl-readout">
        <p className="trl-time font-heading" aria-label="time">
          {clock(rec.seconds)}
        </p>
        <dl className="trl-stats">
          <div>
            <dt>Distance</dt>
            <dd>{rec.km.toFixed(2)} km</dd>
          </div>
          <div>
            <dt>Climb</dt>
            <dd>{climbed} m</dd>
          </div>
          <div>
            <dt>Pace /km</dt>
            <dd>{pace ? clock(pace) : '–'}</dd>
          </div>
        </dl>
      </div>
      <ol className="trl-marks" aria-label="waypoints">
        {rec.marks.map((m) => (
          <li key={m}>
            <Flag aria-hidden />
            {m}
          </li>
        ))}
      </ol>
      {rec.state === 'done' ? (
        <div className="trl-controls">
          <p className="trl-done">
            {rec.km.toFixed(2)} km in {clock(rec.seconds)}
          </p>
          <button type="button" className="trl-btn" onClick={rec.start}>
            <RotateCcw aria-hidden />
            Again
          </button>
        </div>
      ) : (
        <div className="trl-controls">
          <button type="button" className="trl-btn" onClick={rec.mark} disabled={rec.state !== 'running'}>
            <Flag aria-hidden />
            Mark
          </button>
          <button
            type="button"
            className="trl-btn trl-btn-primary trl-btn-round"
            aria-label={rec.state === 'running' ? 'pause' : 'resume'}
            onClick={rec.toggle}
          >
            {rec.state === 'running' ? <Pause aria-hidden /> : <Play aria-hidden />}
          </button>
          <button type="button" className="trl-btn" onClick={rec.finish}>
            <Square aria-hidden />
            Finish
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- art */

/** The featured trail's elevation, metres, one sample per 0.2 km. */
const ELEVATION = Array.from({ length: 43 }, (_, i) => {
  const x = i / 42
  return Math.round(420 + 260 * Math.sin(x * 2.6) + 70 * Math.sin(x * 9 + 1) + 30 * Math.sin(x * 23))
})
const PEAK = Math.max(...ELEVATION)
const PEAK_KM = ((ELEVATION.indexOf(PEAK) / 42) * FEATURED.km).toFixed(1)

/** Metres climbed by a fraction of the way along. */
function climbTo(fraction: number) {
  const end = Math.round(fraction * (ELEVATION.length - 1))
  let up = 0
  for (let i = 1; i <= end; i++) up += Math.max(0, ELEVATION[i] - ELEVATION[i - 1])
  return up
}

function Profile() {
  const lo = Math.min(...ELEVATION) - 40
  const hi = PEAK + 30
  const pts = ELEVATION.map((e, i) => `${(i / 42) * 100},${40 - ((e - lo) / (hi - lo)) * 40}`)
  return (
    <svg className="showcase-art trl-chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,40 ${pts.join(' ')} 100,40`} style={{ fill: 'var(--accent)' }} />
      <polyline
        points={pts.join(' ')}
        style={{ fill: 'none', stroke: 'var(--primary)', strokeWidth: 1.2 }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const ROUTE = 'M12 86 C22 74 18 62 30 58 S44 62 50 50 S48 30 62 28 S80 34 86 16'

/** An invented map: contour lines, a lake, the route and how far along it you are. */
function RouteMap({ progress }: { progress: number }) {
  const at = useMemo(() => {
    if (typeof document === 'undefined') return null
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', ROUTE)
    if (typeof p.getTotalLength !== 'function') return null
    const len = p.getTotalLength()
    return len ? p.getPointAtLength(len * progress) : null
  }, [progress])
  return (
    <svg className="showcase-art trl-map" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="100" height="100" style={{ fill: 'var(--secondary)' }} />
      <ContourPaths seed={11} cx={64} cy={30} rings={6} scale={5.5} stroke="var(--border)" />
      <ContourPaths seed={5} cx={26} cy={70} rings={4} scale={5} stroke="var(--border)" />
      <path d="M72 70 C80 62 94 66 92 78 S76 92 70 84 S66 76 72 70Z" style={{ fill: 'var(--accent)' }} />
      <path
        d={ROUTE}
        pathLength={100}
        style={{
          fill: 'none',
          stroke: 'var(--border)',
          strokeWidth: 2.2,
          strokeLinecap: 'round',
        }}
      />
      <path
        d={ROUTE}
        pathLength={100}
        style={{
          fill: 'none',
          stroke: 'var(--primary)',
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          strokeDasharray: `${progress * 100} 100`,
        }}
      />
      <circle
        cx="12"
        cy="86"
        r="2.4"
        style={{
          fill: 'var(--background)',
          stroke: 'var(--primary)',
          strokeWidth: 1.2,
        }}
      />
      {at && (
        <circle
          cx={at.x}
          cy={at.y}
          r="3"
          style={{
            fill: 'var(--accent-strong)',
            stroke: 'var(--background)',
            strokeWidth: 1.2,
          }}
        />
      )}
    </svg>
  )
}

/** Wobbly concentric rings about a summit: a hill on a topographic map. */
function ContourPaths({
  seed,
  cx,
  cy,
  rings,
  scale,
  stroke,
}: {
  seed: number
  cx: number
  cy: number
  rings: number
  scale: number
  stroke: string
}) {
  const paths = []
  for (let k = 1; k <= rings; k++) {
    const pts = []
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const r = k * scale * (1 + 0.16 * Math.sin(3 * a + seed) + 0.08 * Math.sin(5 * a + seed * 2 + k * 0.3))
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a) * 0.8).toFixed(2)}`)
    }
    paths.push(<polygon key={k} points={pts.join(' ')} style={{ fill: 'none', stroke, strokeWidth: 0.6 }} />)
  }
  return <>{paths}</>
}

/** The field behind the phones: the same map language, at the scale of the wall. */
function Contours({ className, seed }: { className: string; seed: number }) {
  return (
    <svg className={className} viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="160" height="90" style={{ fill: 'var(--secondary)' }} />
      <ContourPaths seed={seed} cx={40} cy={62} rings={9} scale={6} stroke="var(--border)" />
      <ContourPaths seed={seed + 4} cx={128} cy={22} rings={8} scale={6.5} stroke="var(--border)" />
      <circle cx="128" cy="22" r="10" style={{ fill: 'var(--primary)' }} />
      <path d="M0 90 L0 70 C30 60 50 84 80 76 S130 60 160 70 L160 90Z" style={{ fill: 'var(--accent)' }} />
    </svg>
  )
}
