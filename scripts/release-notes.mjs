#!/usr/bin/env node
/**
 * Write a release's notes from the commits since the previous tag.
 *
 *   node scripts/release-notes.mjs v0.2.0 [--worker <cloudflare version id>]
 *
 * GitHub's generated notes list merged pull requests, and this repo commits to
 * main, so they come out empty. The commit subjects are the changelog: each
 * names its area first (`engine: …`), and that area decides the section.
 * release.yml runs this on every tag; run it by hand to rewrite old notes
 * (`… | gh release edit vX.Y.Z --notes-file -`).
 */
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const tag = args[0]
const worker = args.includes('--worker') ? args[args.indexOf('--worker') + 1] : ''
if (!tag) {
  console.error('usage: node scripts/release-notes.mjs <tag> [--worker <id>]')
  process.exit(1)
}

const REPO = `https://github.com/${process.env.GITHUB_REPOSITORY ?? 'DrewGitsIt/chromaconscious'}`
const SITE = 'https://drewkidwell.com/chromaconscious/'
// Areas a user of the app or API never sees.
const MAINTENANCE = new Set(['tests', 'ci', 'repo', 'docs', 'golden', 'deploy', 'rename', 'release'])

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const previous = (() => {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`)
  } catch {
    return '' // the first release
  }
})()

const commits = git('log', '--no-merges', '--format=%h%x09%s', previous ? `${previous}..${tag}` : tag)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [hash, subject] = line.split('\t')
    const m = /^([a-z][a-z0-9 /-]*): (.*)$/i.exec(subject)
    return { hash, area: m?.[1].toLowerCase() ?? '', text: m?.[2] ?? subject }
  })
  // the version bump itself is not a change
  .filter((c) => !(c.area === 'release' && /^v\d/.test(c.text)))

const item = (c) => `- ${c.area ? `**${c.area}:** ` : ''}${c.text} ([${c.hash}](${REPO}/commit/${c.hash}))`
const section = (title, list) => (list.length ? [`## ${title}`, '', ...list.map(item), ''] : [])

const sha = git('rev-list', '-n', '1', tag).slice(0, 7)
const out = [
  `Live at ${SITE}, deployed from [\`${sha}\`](${REPO}/commit/${sha})${worker ? ` as Cloudflare Worker version \`${worker}\`` : ''}.`,
  '',
  ...section('Changes', commits.filter((c) => !MAINTENANCE.has(c.area))),
  ...section('Maintenance', commits.filter((c) => MAINTENANCE.has(c.area))),
  previous
    ? `**Full changelog:** [${previous}...${tag}](${REPO}/compare/${previous}...${tag})`
    : `**Full history:** [${tag}](${REPO}/commits/${tag})`,
]
console.log(out.join('\n'))
