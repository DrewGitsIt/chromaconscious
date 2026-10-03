import { Select } from '@base-ui/react/select'
import { ChevronDown } from 'lucide-react'
import type { CSSProperties, ReactElement } from 'react'
import type { PageFontGroup, PageSettings } from '../pageSettings'
import { PAGE_FONTS, RADIUS_DEFAULT, RADIUS_MAX, RADIUS_MIN, pageFontById } from '../pageSettings'
import './PageSettings.css'

export interface PageSettingsGroupProps {
  page: PageSettings
  onRadius: (px: number) => void
  onFont: (id: string) => void
  /** False when the active frame shows a mockup that keeps its own type and corners (the brand board). */
  applies: boolean
}

/** One tick per px; majors every 5, the detent at shadcn's default. */
const TICKS = Array.from({ length: RADIUS_MAX - RADIUS_MIN + 1 }, (_, i) => i + RADIUS_MIN)

const GROUPS: PageFontGroup[] = ['interface', 'character', 'serif', 'mono']

/**
 * The dropdown's specimens (fontSpecimens.ts) arrive in one lazy chunk the
 * first time the trigger is hovered, focused or opened. Until then — and for
 * the faces with no specimen — each name falls back to its own full stack,
 * which is loaded anyway for the face in use.
 */
let specimens: Promise<unknown> | null = null
const loadSpecimens = () => {
  specimens ??= import('../fontSpecimens').then((m) => m.registerSpecimens())
}

/** The system stack and Geist (the chrome's own face) need no specimen. */
const NO_SPECIMEN = new Set(['system', 'geist'])

const faceStyle = (id: string): CSSProperties => {
  const f = pageFontById(id)
  const spec = NO_SPECIMEN.has(f.id) ? '' : `'cc-specimen-${f.id}', `
  return { fontFamily: spec + f.stack, fontWeight: f.weight }
}

/**
 * The tuning section's "page" group: corners and type for the preview only.
 * View state, like the vision filter — it rides the share link and never
 * reaches the theme, the API or an export (pageSettings.ts).
 */
export function PageSettingsGroup({ page, onRadius, onFont, applies }: PageSettingsGroupProps): ReactElement {
  const font = pageFontById(page.font)
  const isDefault = page.radius === RADIUS_DEFAULT
  const pct = ((page.radius - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 100
  return (
    <div className="pg" role="group" aria-labelledby="pg-head">
      <div className="pg-head">
        <b id="pg-head">page</b>
        <span>preview only · rides the share link · not exported</span>
      </div>

      <div className="pg-row">
        <div className="pg-read">
          <span className="pg-name">corners</span>
          <span className="pg-value">{page.radius}px</span>
        </div>
        <div className="pg-track-wrap" style={{ '--v': `${pct}%` } as CSSProperties}>
          <span className="pg-ticks" aria-hidden>
            {TICKS.map((i) => (
              <i key={i} className={i === RADIUS_DEFAULT ? 'detent' : i % 5 === 0 ? 'major' : undefined} />
            ))}
          </span>
          <input
            type="range"
            className="pg-slider"
            aria-label="corners"
            aria-valuetext={`${page.radius}px${isDefault ? ', default' : page.radius === 0 ? ', sharp' : ''}`}
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={1}
            value={page.radius}
            onChange={(e) => onRadius(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="pg-ends" aria-hidden>
          <span className={page.radius === RADIUS_MIN ? 'on' : undefined}>
            <i className="pg-corner sharp" />
            sharp
          </span>
          <span className={isDefault ? 'on' : undefined}>default</span>
          <span className={page.radius === RADIUS_MAX ? 'on' : undefined}>
            round
            <i className="pg-corner round" />
          </span>
        </div>
      </div>

      <div className="pg-row">
        <div className="pg-read">
          <span className="pg-name">type</span>
        </div>
        <Select.Root
          value={page.font}
          onValueChange={(v) => {
            if (typeof v === 'string') onFont(v)
          }}
          onOpenChange={(open) => {
            if (open) loadSpecimens()
          }}
        >
          <Select.Trigger
            className="pg-font"
            aria-label={`type: ${font.name}, ${font.use}`}
            onPointerEnter={loadSpecimens}
            onFocus={loadSpecimens}
          >
            <span className="pg-fn" style={faceStyle(font.id)}>
              {font.name}
            </span>
            <span className="pg-fu">{font.use}</span>
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="pg-font-pos" side="bottom" align="start" sideOffset={4} alignItemWithTrigger={false}>
              <Select.Popup className="pg-font-pop">
                <Select.List>
                  {GROUPS.map((g) => (
                    <Select.Group key={g}>
                      <Select.GroupLabel className="pg-fgroup">{g}</Select.GroupLabel>
                      {PAGE_FONTS.filter((f) => f.group === g).map((f) => (
                        <Select.Item key={f.id} value={f.id} className="pg-fopt" label={f.name}>
                          <Select.ItemText className="pg-fn" style={faceStyle(f.id)}>
                            {f.name}
                          </Select.ItemText>
                          <span className="pg-fu">{f.use}</span>
                          <span className="pg-fcheck" aria-hidden>
                            {f.id === page.font ? '✓' : ''}
                          </span>
                        </Select.Item>
                      ))}
                    </Select.Group>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>

      {!applies && <p className="pg-note">the brand board is print: it keeps its own corners and type</p>}
    </div>
  )
}
