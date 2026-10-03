#!/usr/bin/env node
/**
 * Rename themesmith → ChromaConscious, mechanically and re-runnably.
 *
 *   node scripts/rename-chromaconscious.mjs [repoDir] [--dry]
 *
 * repoDir defaults to the current directory. It works on this repo and on
 * drewkidwell-site. Run it twice and the second run changes nothing.
 *
 * It only covers the mechanical part. The judgment edits (the "smith" persona,
 * the "forge" copy, the API and route aliases) live in their own commits, and
 * anything that has to keep the old name is protected here:
 *   - any line containing the word "legacy" (the alias code, the old routes,
 *     and doc lines that mention the old prefix) is left alone;
 *   - paths to sibling checkouts (../themesmith, ../themesmith-phase1) are left
 *     alone, because the local directories are renamed separately;
 *   - e2e/visual-parity.spec.ts-snapshots/ is skipped. Re-baseline it with
 *     Playwright on a production build. Don't sed it.
 *
 * Spelling: display name `ChromaConscious`, slug/package/path `chromaconscious`,
 * env and secret prefix `CHROMACONSCIOUS_`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const repo = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.')
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' })

const SLUG = 'chromaconscious'
const DISPLAY = 'ChromaConscious'
const SELF = 'scripts/rename-chromaconscious.mjs'
const SKIP_DIRS = ['e2e/visual-parity.spec.ts-snapshots/']
const KEEP_LINE = /legacy/i
// Sibling checkouts: the local directories move later, by hand.
const KEEP_SPANS = [
  /\.\.\/themesmith(?:-[a-z0-9]+)?/g,
  /-home-drew-repo-themesmith/g,
  // The Worker keeps its name (no new script), so its workers.dev host stays.
  /themesmith\.(?:<account>|drewkidwell)\.workers\.dev/g,
]
/** Per-file lines that keep the old name: the Worker's own name. */
const KEEP_IN_FILE = { 'wrangler.jsonc': /^\s*"name": "themesmith"/ }

/** Exact spellings the context rule below would get wrong, applied first. */
const EXACT = [
  [/^name: themesmith$/gm, `name: ${SLUG}`], // skill frontmatter
  [/\bname: "themesmith"/g, `name: "${DISPLAY}"`], // site card title (slug: stays a slug)
  [/title="themesmith"/g, `title="${DISPLAY}"`],
  [/text: "themesmith"/g, `text: "${DISPLAY}"`], // site link label
  [/\{ themesmith: \{/g, `{ ${SLUG}: {`], // $extensions key in code
  [/const themesmith = /g, `const ${SLUG} = `],
  [/(['"]): themesmith\b/g, `$1: ${SLUG}`], // proxy table values
  [/`themesmith \$\{/g, '`' + DISPLAY + ' ${'], // export header: `themesmith ${id} · …`
]

/**
 * `themesmith` reads as the display name in prose ("themesmith forges…",
 * `<title>themesmith</title>`) and as the slug everywhere else (paths, URLs,
 * identifiers, package names, object keys).
 */
function swapWord(text) {
  return text.replace(/themesmith/g, (m, i, s) => {
    const before = s[i - 1] ?? ''
    const after = s.slice(i + m.length, i + m.length + 2)
    const proseBefore = before === '' || /[\s>*]/.test(before)
    const proseAfter = after === '' || /^(?:[\s<',)]|[.:](?:\s|$)|$)/.test(after)
    return proseBefore && proseAfter ? DISPLAY : SLUG
  })
}

function renameText(src, file) {
  const keepInFile = KEEP_IN_FILE[path.basename(file)]
  return src
    .split('\n')
    .map((line) => {
      if (!/themesmith/i.test(line) || KEEP_LINE.test(line) || keepInFile?.test(line)) return line
      // Park protected spans behind placeholders, swap, then restore them.
      const kept = []
      let out = line
      for (const re of KEEP_SPANS) out = out.replace(re, (m) => `\uE000${kept.push(m) - 1}\uE000`)
      for (const [re, to] of EXACT) out = out.replace(re, to)
      out = out.replaceAll('THEMESMITH', 'CHROMACONSCIOUS').replaceAll('Themesmith', DISPLAY)
      out = swapWord(out)
      return out.replace(/\uE000(\d+)\uE000/g, (_, n) => kept[+n])
    })
    .join('\n')
}

const tracked = () => git('ls-files', '-z').split('\0').filter(Boolean)
const skipped = (f) => f === SELF || SKIP_DIRS.some((d) => f.startsWith(d))
const log = (...a) => console.log(dry ? '[dry]' : '', ...a)

// 1. The stray log that was committed with the skill.
for (const f of ['.claude/skills/run-themesmith/nohup.out', '.claude/skills/run-chromaconscious/nohup.out']) {
  if (tracked().includes(f)) {
    log('rm', f)
    if (!dry) git('rm', '-q', f)
  }
}

// 2. Paths: move every tracked file whose path carries the old name.
for (const f of tracked()) {
  if (skipped(f) || !/themesmith/i.test(f)) continue
  const to = f.replace(/themesmith/g, SLUG).replace(/Themesmith/g, DISPLAY)
  log('mv', f, '→', to)
  if (!dry) {
    execFileSync('mkdir', ['-p', path.dirname(path.join(repo, to))])
    git('mv', f, to)
  }
}

// 3. Contents.
let changed = 0
for (const f of tracked()) {
  if (skipped(f)) continue
  const abs = path.join(repo, f)
  if (!existsSync(abs)) continue
  const buf = readFileSync(abs)
  if (buf.includes(0)) continue // binary
  const before = buf.toString('utf8')
  if (!/themesmith/i.test(before)) continue
  const after = renameText(before, f)
  if (after === before) continue
  changed++
  log('edit', f)
  if (!dry) writeFileSync(abs, after)
}
log(`${changed} file(s) edited in ${repo}`)
