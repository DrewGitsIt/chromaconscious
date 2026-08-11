/** The dot-row that lets a preset demo its palette wherever it's offered. */
export function PresetDots({ colors }: { colors: string[] }) {
  return (
    <span className="preset-dots" aria-hidden>
      {colors.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  )
}
