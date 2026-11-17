// usage: node cc-dump.mjs <bundle> <out.json>; 50 riff hops per brand, mapped onto Huemint's bootstrap-basic slots
const [bundle, out] = process.argv.slice(2)
const { generateTheme, candidatesFromList } = await import(bundle)
const fs = await import('node:fs')
const brands = ['1f6feb', 'e63946', '2a9d8f', 'f4a261', '6a4c93', '606c38', 'ff5c1f', '0f172a']
const res = {}
for (const b of brands) {
  res[b] = []
  for (let seed = 0; seed < 50; seed++) {
    const r = generateTheme({ candidates: candidatesFromList(['#' + b]).map(c => ({ ...c, locked: true })), fidelity: 0.5, seed })
    const t = r.light.tokens
    res[b].push({ seed, palette: [t.background, t.card, t.foreground, t.primary, t['accent-strong'], t['chart-2']],
      extra: { accent: t.accent, chart: [1,2,3,4,5].map(i => t['chart-' + i]), danger: t.destructive, success: t.success, warning: t.warning, border: t.border, muted: t.muted },
      dark: [r.dark.tokens.background, r.dark.tokens.card, r.dark.tokens.foreground, r.dark.tokens.primary, r.dark.tokens['accent-strong'], r.dark.tokens['chart-2']],
      judge: r.judge.score })
  }
}
fs.writeFileSync(out, JSON.stringify(res))
console.log('ok', Object.keys(res).length)
