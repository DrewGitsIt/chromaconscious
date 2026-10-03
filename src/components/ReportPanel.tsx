import type { ColorCandidate, ThemeResult } from '../engine'
import { toHex } from '../engine'
import './ReportPanel.css'

interface Props {
  result: ThemeResult
  /** Input candidates, for showing which raw color seeded each role. */
  candidates?: ColorCandidate[]
}

export function ReportPanel({ result, candidates }: Props) {
  return (
    <div className="report">
      <div className="report-mode">
        <h3>role assignments</h3>
        <table>
          <thead>
            <tr>
              <th>role</th>
              <th>seed</th>
              <th>source</th>
              <th>drift</th>
            </tr>
          </thead>
          <tbody>
            {result.assignments.map((a) => (
              <tr key={a.role}>
                <td>{a.role}</td>
                <td>
                  <span className="sample" style={{ background: toHex(a.seed) }}>
                    &nbsp;&nbsp;
                  </span>{' '}
                  {toHex(a.seed)}
                </td>
                <td>
                  {a.candidateIndex != null
                    ? (candidates?.[a.candidateIndex]?.raw ?? `candidate ${a.candidateIndex + 1}`)
                    : result.monoBase != null
                      ? 'synthesized · mono (lightness of base)'
                      : 'synthesized'}
                </td>
                <td>{a.candidateIndex != null && a.deltaE > 0.02 ? `ΔE ${a.deltaE.toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.repairs.length > 0 && (
        <div className="report-mode">
          <h3>unresolved pairings</h3>
          <p className="report-note">
            These colors are too similar, but fidelity is set too high to move them. Lower
            fidelity, or change one of the inputs.
          </p>
          <table>
            <thead>
              <tr>
                <th>pair</th>
                <th>ΔE</th>
                <th>needs</th>
                <th>why</th>
              </tr>
            </thead>
            <tbody>
              {result.repairs.map((r) => (
                <tr key={`${r.a}-${r.b}`} className="fail">
                  <td>
                    {r.a} ↔ {r.b}
                  </td>
                  <td>{r.deltaE.toFixed(3)}</td>
                  <td>{r.required.toFixed(2)}</td>
                  <td>{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(['light', 'dark'] as const).map((mode) => (
        <div key={mode} className="report-mode">
          <h3>{mode} contrast</h3>
          <table>
            <thead>
              <tr>
                <th>token</th>
                <th>on</th>
                <th>sample</th>
                <th>WCAG</th>
                <th>APCA Lc</th>
                <th>req</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {result[mode].report.map((r) => (
                <tr key={`${r.token}-${r.background}`} className={r.pass ? '' : 'fail'}>
                  <td>{r.token}</td>
                  <td>{r.background}</td>
                  <td>
                    <span className="sample" style={{ background: r.bg, color: r.fg }}>
                      Aa
                    </span>
                  </td>
                  <td>{r.wcag.toFixed(2)}</td>
                  <td>{r.apca.toFixed(0)}</td>
                  <td>
                    {r.requiredWcag}
                    {r.requiredLc != null && ` · Lc ${r.requiredLc}`}
                  </td>
                  <td
                    title={
                      r.unreachable
                        ? 'unreachable: the engine pushed this colour as far as its hue goes on this surface — only a different colour fixes it'
                        : undefined
                    }
                  >
                    {r.pass ? '✓' : r.unreachable ? '✗ ceiling' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
