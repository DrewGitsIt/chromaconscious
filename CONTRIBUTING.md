# Contributing to ChromaConscious

Thanks for helping. Whether you found a bug, want a feature, or want to send code, **start with a [GitHub issue](https://github.com/DrewGitsIt/chromaconscious/issues/new/choose).** That's where a problem gets agreed on before anyone spends time on a fix, and it's the record of why things changed.

## Reporting a bug

A good report lets someone else see the problem without asking you anything. The [bug form](https://github.com/DrewGitsIt/chromaconscious/issues/new?template=bug_report.yml) asks for each of these:

| Field | What to put there |
|---|---|
| **Title** | What's wrong and where, in one line. *"Danger seat ignores lock after riff in dark mode"*, not *"lock broken"*. |
| **Summary** | One or two sentences: what happened, and why it matters. |
| **Theme link** | In the app, open **Export → Share link** and copy it. It carries the whole theme, so it reopens exactly what you saw. For the API, paste the request URL and the `theme t_…` line of the response. |
| **Steps to reproduce** | Numbered, starting from that link or from an empty page. One action per step. |
| **Expected result** | What you thought would happen. |
| **Actual result** | What happened instead. Include exact text, hex values, or the error. |
| **Environment** | Web app or API; browser and version; OS; light or dark; any colorblind filter. |
| **Impact** | Who it affects and how badly: blocks you, has a workaround, or cosmetic. |
| **Evidence** | Screenshots, a screen recording, or console output. |

One bug per issue. If you aren't sure whether it's a bug, open it anyway and say so.

### Contrast and color-vision reports

Name the pair: which text, on which surface, in which mode, with the contrast the report panel shows. For colorblind collisions, give the filter type and strength (e.g. *deutan · 60%*) and the two seats that look alike.

## Requesting a feature

The [feature form](https://github.com/DrewGitsIt/chromaconscious/issues/new?template=feature_request.yml) asks for:

- **The problem**, written as a user story: *As a [who], I want [what], so that [why].* Start from the problem, not the solution.
- **Acceptance criteria**: a checklist of observable outcomes that say when it's done.
- **Alternatives** you considered, including tools that already do it.

## Working on the code

You'll need Node 22.12 or newer (`.nvmrc` pins the version CI uses).

```sh
npm ci
npm run dev          # the app at http://localhost:5173
npm run dev:cf       # the app and the API together, in workerd, with local KV
```

Before opening a pull request, run what CI runs:

```sh
npm run lint
npm run typecheck
npm test             # unit tests (vitest)
npm run e2e          # end-to-end (Playwright; uses your installed Chrome)
```

How the repository is laid out:

| Path | What's there |
|---|---|
| `src/engine/` | The theme engine: seat casting, OKLCH ramps, contrast, color-vision simulation. Pure functions, no DOM. |
| `src/api/` | The Cloudflare Worker: HTTP API, state links, exports. |
| `src/components/`, `src/App.tsx` | The web app. |
| `src/mockups.tsx` | The mockups a theme is shown on. |
| `e2e/` | Playwright specs. |
| `docs/` | Design specs: [the remote API](docs/remote-api-spec.md), [the colorblind view](docs/colorblind-spec.md). |
| `public/docs.md`, `public/skill/SKILL.md` | The published API reference and agent skill. |

### Engine changes

The engine is deterministic: the same inputs must produce the same theme, because theme IDs and share links depend on it. `src/engine/golden.test.ts` hashes engine output over thousands of configurations.

- If your change should **not** alter output (a refactor, a speedup), the golden test must still pass unchanged.
- If it **should**, update the golden hashes in the same pull request and explain the visible difference.

For UI refactors, `e2e/visual-parity.spec.ts` is a pixel-level safety net. Record a baseline on the commit you trust, make your change, then compare:

```sh
npx playwright test e2e/visual-parity.spec.ts --update-snapshots   # before
npx playwright test e2e/visual-parity.spec.ts                      # after
```

CI doesn't run it, because intended design changes move every pixel.

### Pull requests

- Link the issue it resolves (`Fixes #12`).
- Keep it to one change. Separate refactors from behavior changes.
- Commit subjects name the area first, the way the history does: `engine: …`, `api: …`, `tests: …`, `docs: …`. The release notes are built from them.

## Releases

Every release is a deploy, and every deploy is a release. On a clean `main`:

```sh
npm version minor    # or patch / major
```

This bumps `package.json`, commits `release: vX.Y.Z`, tags it, and pushes. The tag starts [the release workflow](.github/workflows/release.yml), which:

1. runs the full CI suite on the tagged commit,
2. deploys that commit to Cloudflare, labelling the Worker version with the tag,
3. checks that the app and API respond,
4. only then publishes the [GitHub Release](https://github.com/DrewGitsIt/chromaconscious/releases), with notes generated from the commits since the last tag.

If any step fails, nothing is published. To redeploy an existing release, run the workflow by hand from the Actions tab and pick the tag under *Use workflow from*.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
