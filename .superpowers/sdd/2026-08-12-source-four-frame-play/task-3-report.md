# Task 3 Report: Expose comparison fixtures and verify rendered output

## Status

COMPLETE — Task 3 implementation and verification completed.

## Files changed

- `examples/index.html`
  - Added a Ball-screen comparison section with direct links for the original `continuous-ball-screen` fixture and the source-faithful four-frame fixture.
- `examples/render-fixture.html`
  - Added bounded frame-index handling after fixture loading, preventing invalid frame query values from reaching the renderer.
- `src/__fixtures__/continuous-ball-screen.json`
  - Included the existing original interpretation fixture unchanged because it was present as an untracked parent-workspace fixture but absent from the Task 2 worktree; no fixture content was rewritten.
- `tests/visual/tactical-print.spec.ts`
  - Added four Playwright visual tests for source-faithful frames 1–4 using the required fixture URLs and screenshot names.
- `tests/visual/tactical-print.spec.ts-snapshots/source-four-frame-ball-screen-{1,2,3,4}-chromium-darwin.png`
  - Added four generated Chromium screenshot baselines.
- `.superpowers/sdd/2026-08-12-source-four-frame-play/task-3-report.md`
  - Added this report.

Unrelated pre-existing `package-lock.json` changes were not staged or committed.

## Exact commands and outputs

### Build

Command:

```bash
npm run build
```

Output:

```text
> ocf-renderer@0.0.0 build
> tsup src/index.ts --format esm,cjs --dts

CLI Building entry: src/index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Target: es2020
ESM Build start
CJS Build start
DTS Build start
ESM dist/index.js 27.96 KB
ESM ⚡️ Build success in 547ms
CJS dist/index.cjs 29.74 KB
CJS ⚡️ Build success in 547ms
DTS ⚡️ Build success in 1392ms
DTS dist/index.d.ts  6.42 KB
DTS dist/index.d.cts 6.42 KB
```

### Typecheck

Command:

```bash
npx tsc --noEmit
```

Output:

```text
(no output — exit code 0)
```

### Unit tests

Command:

```bash
npm run test
```

Output summary:

```text
Test Files  28 passed (28)
Tests       117 passed (117)
```

### Visual suite with new baselines

Command:

```bash
npx playwright test tests/visual/tactical-print.spec.ts --update-snapshots
```

Output summary:

```text
Running 13 tests using 4 workers
13 passed (9.0s)
```

The suite reported four missing snapshots and wrote the four new source-faithful baselines. Existing visual baselines also passed.

### Existing fixture comparison check

The original `continuous-ball-screen.json` was read from the parent workspace and copied without content changes because it was not present in the feature worktree. Its content remains the original five-frame interpretation and was not modified by Task 3.

## Screenshot baseline status

Baseline status: four new baselines created and passing:

- `source-four-frame-ball-screen-1-chromium-darwin.png`
- `source-four-frame-ball-screen-2-chromium-darwin.png`
- `source-four-frame-ball-screen-3-chromium-darwin.png`
- `source-four-frame-ball-screen-4-chromium-darwin.png`

The four tests use `maxDiffPixelRatio: 0.01`, matching the Task 3 brief. The original visual tests retain their existing `0.001` threshold.

## Manual visual observations

- Frame ordering is correct: the screenshots show the right-side pass/cut/screen first, right-side penetration and roll second, left-side reversal third, and left-side around-player dribble and roll fourth.
- Screen bars appear on the intended side in frames 1 and 3, and the roll/screen action remains visible in frames 2 and 4.
- The around-player route is visible in frame 4 as an intermediate path around player 4 before the destination in the paint.
- All five offensive players are present in the new fixture screenshots; no defenders are rendered.
- Ball markers follow the carrier across the sequence: player 2 after frame 1 and frame 2, then player 3 after frame 3 and frame 4.
- The court remains at the existing 800×600 canvas dimensions, allowing direct comparison with the original example output.
- The top-left frame navigation appears for the multi-frame fixture and correctly disables the previous/next control at the sequence boundaries.

## Self-review

- Only Task 3 behavior was added to the renderer example and visual-test surfaces; renderer implementation code was not changed.
- The new visual URLs use the exact `/examples/render-fixture.html?fixture=...&frame=...` navigation requested by the brief.
- The four visual tests wait for `canvas[data-rendered='true']` before screenshot capture.
- Baselines were generated only after the page rendered successfully.
- Existing fixture content was not rewritten. The original fixture was included unchanged solely to make the required comparison link resolve in this worktree.
- Unrelated pre-existing worktree modifications were left unstaged.

## Concerns

1. The supplied source image is not stored as a repository file, so manual comparison was performed against the rendered screenshot media available during the visual run rather than an automated image-to-source comparison.
2. `continuous-ball-screen.json` was untracked in the parent workspace and absent from the Task 2 feature worktree. Including it unchanged is necessary for the new comparison link to work, but indicates the earlier fixture setup did not leave the original fixture tracked on this branch.
3. The checked-in validator reports a pre-existing `END_STATE_DISAGREE` for `continuous-ball-screen.json` frame 5 / `offense_5`; this fixture was not changed because Task 3 explicitly requires preserving the original interpretation. The new source-faithful fixture and all required build, typecheck, unit, and visual checks remain unaffected.
3. The brief permits changing `examples/render-fixture.html` only if frame navigation needs a bounded-frame guard. The guard is defensive and does not affect valid frame 0–3 navigation; invalid or non-finite query values are clamped to a valid frame range.
