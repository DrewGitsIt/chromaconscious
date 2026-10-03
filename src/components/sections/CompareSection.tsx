import type { ReactElement } from 'react'
import type { Role } from '../../engine'
import './sections.css'

/**
 * Section 4 — exists only while the stage is split. The verbs that make and
 * close the split stay on the frames' label rows; this section reads the
 * difference and lets you take a seat's colour from the other frame.
 */
export interface CompareSectionBodyProps {
  /** The frame your edits go to. */
  editing: 'A' | 'B'
  /** Seats whose colour differs between the frames, in role order. */
  rows: Array<{ role: Role; mine: string; theirs: string }>
  /** Take the other frame's colour into this seat (it lands locked, as typed). */
  onTake: (role: Role, hex: string) => void
}

export function CompareSectionBody({ editing, rows, onTake }: CompareSectionBodyProps): ReactElement {
  const other = editing === 'A' ? 'B' : 'A'
  return (
    <div className="cmp">
      <p className="cmp-note">
        editing {editing}.{' '}
        {rows.length
          ? `Take a color from ${other} to lock it here.`
          : 'A and B match; riff or tune either and the differences list here.'}
      </p>
      {rows.length > 0 && (
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col">seat</th>
              <th scope="col">{editing}</th>
              <th scope="col">{other}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.role}>
                <th scope="row">{r.role}</th>
                <td>
                  <span className="cmp-side">
                    <i style={{ background: r.mine }} aria-hidden="true" />
                    {r.mine}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="cmp-side cmp-take"
                    onClick={() => onTake(r.role, r.theirs)}
                    title={`take ${r.theirs} from ${other} into ${r.role} (locks it)`}
                  >
                    <i style={{ background: r.theirs }} aria-hidden="true" />
                    {r.theirs}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
