/**
 * Split on whitespace and commas that sit OUTSIDE parentheses, so functional
 * colour syntaxes survive being pasted next to each other.
 *
 * A plain `.split(/[\s,]+/)` shredded `oklch(0.7 0.12 250)` — the syntax this
 * field's own placeholder advertises — into three fragments. Two failed to
 * parse and were dropped in silence; the third, `124` out of
 * `rgb(91, 124, 250)`, parses as the three-digit hex `#124`. So typing a light
 * blue added a dark navy, which is worse than refusing it.
 */
export function tokenizeColors(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && /[\s,]/.test(ch)) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
