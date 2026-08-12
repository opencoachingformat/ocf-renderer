# Source-Faithful Four-Frame Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source-faithful four-frame OCF play alongside the existing interpretation and make `around_player` produce deterministic curved routes that can be compared visually with the supplied four-panel source image.

**Architecture:** Extend the existing pure action-path resolver so `MoveStep.around_player` inserts one obstacle-clearing waypoint before the existing Catmull-Rom and arc-length pipeline. Add a separate four-frame fixture using a mix of named and free coordinates, then expose both fixtures through the existing example navigation without changing the existing interpretation.

**Tech Stack:** TypeScript, Three.js, Vitest, existing OCF validator CLI, static HTML example page.

## Global Constraints

- Keep `src/__fixtures__/continuous-ball-screen.json` unchanged in meaning.
- The new source-faithful fixture has exactly four frames and five offense entities; do not add defenders absent from the source image.
- Use named positions for stable landmarks and free coordinates for screen locations, penetration points, and curved-path control anchors.
- `around_player` uses the referenced player's frame-start position; no time-based moving-obstacle simulation is added.
- The inserted waypoint must clear the obstacle symbol radius plus the existing `avoidCollisions` margin.
- Unknown `around_player` references throw an error containing the missing reference.
- Existing `npm run test`, `npm run build`, and the checked-in validator CLI must remain passing.

---

### Task 1: Implement `around_player` route expansion

**Files:**
- Modify: `src/actions/resolve-action-path.ts`
- Test: `src/actions/resolve-action-path.test.ts`

**Interfaces:**
- Consumes `Action`, `ResolvedFrameState`, and `CoordinateTransformer` already used by `resolveActionPath`.
- Produces the same `THREE.Vector3[] | null` return type from `resolveActionPath`.

- [ ] **Step 1: Write failing tests**

Add tests to `src/actions/resolve-action-path.test.ts` using a transformer for `{ ruleset: "fiba", type: "half_court" }` and a state with `offense_1` at `{ x: 0, y: 5 }` and `defense_1` at `{ x: 0, y: 8 }`:

```ts
it("inserts an obstacle-clearing waypoint for around_player", () => {
  const action: Action = {
    type: "cut",
    player: "offense_1",
    moves: [{ to: { x: 0, y: 11 }, around_player: "defense_1" }],
  };
  const path = resolveActionPath(action, startState, transformer)!;
  expect(path.length).toBe(3);
  expect(path[0].equals(transformer.resolveToWorld({ x: 0, y: 5 }))).toBe(true);
  expect(path[2].equals(transformer.resolveToWorld({ x: 0, y: 11 }))).toBe(true);
  expect(path[1].x).not.toBeCloseTo(0, 5);
});

it("routes around the obstacle on a deterministic side for collinear points", () => {
  const action: Action = {
    type: "move",
    player: "offense_1",
    moves: [{ to: { x: 0, y: 11 }, around_player: "defense_1" }],
  };
  const first = resolveActionPath(action, startState, transformer)!;
  const second = resolveActionPath(action, startState, transformer)!;
  expect(first[1].equals(second[1])).toBe(true);
});

it("throws when around_player cannot be resolved", () => {
  const action: Action = {
    type: "cut",
    player: "offense_1",
    moves: [{ to: { x: 0, y: 11 }, around_player: "missing" }],
  };
  expect(() => resolveActionPath(action, startState, transformer)).toThrow(/missing/);
});
```

Use the existing `Action`, `FrameState`/`ResolvedFrameState`, and resolver test fixtures already present in the file; adapt only the state literal shape if the current test file has been updated to the upstream v1 flat state model.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`

Expected: the new `around_player` tests fail because the current resolver returns only `[start, destination]` and does not inspect `around_player`.

- [ ] **Step 3: Implement minimal route expansion**

Add a local helper in `src/actions/resolve-action-path.ts` with this behavior:

```ts
function expandMoveSteps(
  action: Extract<Action, { type: "move" | "cut" | "dribble" }>,
  startState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): THREE.Vector3[] {
  const points = [entityWorldPos(startState, action.player, transformer)];
  let current = points[0];

  for (const move of action.moves) {
    if (!move.to) continue;
    const destination = transformer.resolveToWorld(move.to);
    if (move.around_player) {
      const obstacle = entityWorldPos(startState, move.around_player, transformer);
      const direction = new THREE.Vector3().subVectors(destination, current).setY(0);
      const length = direction.length();
      if (length < 1e-8) {
        points.push(destination);
        current = destination;
        continue;
      }
      direction.normalize();
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      const obstacleDelta = new THREE.Vector3().subVectors(obstacle, current).setY(0);
      if (side.dot(obstacleDelta) > 0) side.negate();
      const waypoint = obstacle.clone().addScaledVector(side, 0.6);
      points.push(waypoint);
    }
    points.push(destination);
    current = destination;
  }

  return points;
}
```

Use `expandMoveSteps` for `move`, `cut`, and `dribble`. The `0.6` meter offset is the existing offense-symbol radius (`0.5`) plus the existing collision margin (`0.1`) and is the minimum deterministic route clearance for this v1 helper. The later `avoidCollisions` stage remains responsible for the final sampled path.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run src/actions/resolve-action-path.test.ts && npm run test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/resolve-action-path.ts src/actions/resolve-action-path.test.ts
git commit -m "feat: route move steps around referenced players"
```

---

### Task 2: Add source-faithful four-frame fixture

**Files:**
- Create: `src/__fixtures__/source-four-frame-ball-screen.json`
- Test: `src/__fixtures__/fixtures.test.ts`

**Interfaces:**
- Consumes the v1 document shape in `src/types/ocf.ts` and the action resolver from Task 1.
- Produces a validator-valid four-frame document consumed by `composeFrame` and the example page.

- [ ] **Step 1: Write the fixture smoke test first**

Extend `src/__fixtures__/fixtures.test.ts` so the fixture list includes `source-four-frame-ball-screen`, then assert it has exactly four frames:

```ts
it("includes the source-faithful four-frame play", async () => {
  const doc = await loadFixture("source-four-frame-ball-screen");
  expect(doc.frames).toHaveLength(4);
  expect(doc.entities.filter((entity) => entity.type === "offense")).toHaveLength(5);
});
```

Use the existing fixture loader and test style in that file.

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `npx vitest run src/__fixtures__/fixtures.test.ts`

Expected: FAIL because `source-four-frame-ball-screen.json` does not exist.

- [ ] **Step 3: Create the four-frame OCF document**

Create a UUID-based document with five offense entities numbered 1–5, one carried ball, and exactly these frame actions:

- Frame 1: `pass` player 1 to player 2; `cut` player 1 to `right_corner`; `screen` player 5 for player 2 with a free-coordinate `at` point.
- Frame 2: `dribble` player 2 through a free-coordinate penetration point; `cut` player 5 to `right_block`; `move` player 1 to `right_wing`; retain players 3 and 4 as weak-side spacers.
- Frame 3: `pass` player 2 to player 3; `cut` player 2 to `left_corner`; `screen` player 4 for player 3 with a free-coordinate `at` point.
- Frame 4: `dribble` player 3 with a move step containing `around_player` referencing player 4 and a free-coordinate destination in the paint; `cut` player 4 to `left_block`; retain players 2 and 1 on the left and right perimeter.

Use explicit end states for every player whose position changes, plus the ball carrier after each pass. Use the existing entity reference convention (`offense_1` through `offense_5`). Choose source-like coordinates inside the half court and keep all endpoints at least 0.5 meters apart so the validator's distinct-position rule passes.

- [ ] **Step 4: Run validator and fixture tests**

Run:

```bash
node /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/ocf-validator/packages/ts/dist/cli.js src/__fixtures__/source-four-frame-ball-screen.json
npx vitest run src/__fixtures__/fixtures.test.ts
```

Expected: validator prints `ok`; fixture tests pass.

- [ ] **Step 5: Verify all four frames compose**

Add a test that loads the fixture and calls `composeFrame(doc, frameIndex)` for indices `0` through `3`, asserting each result contains `entities` and `actions` groups.

Run: `npx vitest run src/__fixtures__/fixtures.test.ts`

Expected: all four frames compose without throwing.

- [ ] **Step 6: Commit**

```bash
git add src/__fixtures__/source-four-frame-ball-screen.json src/__fixtures__/fixtures.test.ts
git commit -m "test: add source-faithful four-frame ball-screen fixture"
```

---

### Task 3: Expose comparison fixtures and verify rendered output

**Files:**
- Modify: `examples/index.html`
- Modify: `examples/render-fixture.html` only if frame navigation needs a bounded-frame guard
- Test: `tests/visual/tactical-print.spec.ts`

**Interfaces:**
- Consumes both `continuous-ball-screen.json` and `source-four-frame-ball-screen.json`.
- Produces direct links and Playwright screenshots for the four source-faithful frames.

- [ ] **Step 1: Add example links**

Add a comparison section to `examples/index.html` with links for:

```html
<li><a href="render-fixture.html?fixture=continuous-ball-screen&frame=0">continuous-ball-screen<code>original interpretation</code></a></li>
<li><a href="render-fixture.html?fixture=source-four-frame-ball-screen&frame=0">source-four-frame-ball-screen<code>source-faithful four-frame interpretation</code></a></li>
```

The existing frame navigation automatically exposes frames 1–4 after opening either multi-frame fixture.

- [ ] **Step 2: Add visual test coverage**

Extend `tests/visual/tactical-print.spec.ts` with the four source-faithful frame URLs:

```ts
for (let frame = 0; frame < 4; frame += 1) {
  test(`source-faithful ball screen frame ${frame + 1}`, async ({ page }) => {
    await page.goto(`/examples/render-fixture.html?fixture=source-four-frame-ball-screen&frame=${frame}`);
    await page.waitForSelector("canvas[data-rendered='true']");
    await expect(page.locator("canvas")).toHaveScreenshot(`source-four-frame-ball-screen-${frame + 1}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
```

Record new baselines only after manually checking the four rendered images against the supplied source image.

- [ ] **Step 3: Run build and all tests**

Run:

```bash
npm run build
npm run test
npx tsc --noEmit
```

Expected: build succeeds, all Vitest tests pass, and TypeScript reports no errors.

- [ ] **Step 4: Run the visual suite and inspect output**

Run: `npx playwright test tests/visual/tactical-print.spec.ts --update-snapshots`

Open the generated screenshots and compare corresponding panels against the supplied source. Check specifically: four-frame ordering, right/left wing placement, screen bars, roll paths, the curved around-player dribble, and the absence of defenders.

- [ ] **Step 5: Commit**

```bash
git add examples/index.html examples/render-fixture.html tests/visual/tactical-print.spec.ts tests/visual/tactical-print.spec.ts-snapshots
git commit -m "test: add visual comparison for source-faithful four-frame play"
```

---

## Verification checklist

- [ ] Existing `continuous-ball-screen.json` remains present and semantically unchanged.
- [ ] New fixture validates with `ocf-validator`.
- [ ] `around_player` produces an intermediate route point and descriptive missing-reference errors.
- [ ] New fixture has exactly four frames and composes all frames.
- [ ] `npm run build` passes.
- [ ] `npm run test` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] Four visual screenshots have been manually compared against the supplied source image.
