# Sequential Action Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve each action's path from the acting player's *previous* action endpoint (not the frame-start position), route passes to the receiver's frame-end position, track ball possession through pass/dribble/pickup/rebound/shoot, and fix the `around_player` apex hook.

**Architecture:** A new pure module walks a frame's ordered actions maintaining an entity cursor and a ball cursor, and returns per-action start/end overrides. `resolveActionPath` gains optional overrides; `compose-frame` feeds them in. The `around_player` apex geometry is corrected to project along the start→destination heading so the detour never backtracks.

**Tech Stack:** TypeScript, three.js (Vector3 math only in the resolver), vitest.

**Design:** `docs/superpowers/specs/2026-08-31-sequential-action-resolution-design.md`

---

## Key facts an implementer needs (verified against current code)

- **Positions** resolve via `CoordinateTransformer` (`src/court/coordinate-transformer.ts`): `resolveToWorld(coord)` → `THREE.Vector3(x, 0, -y)`. Court +y maps to world -z.
- **Frame state** via `resolveFrameState(doc, frameIndex, "start" | "end")` (`src/parser/resolve-frame-state.ts`) → `{ positions: Record<ref, Coordinate>, balls: Record<id, BallState> }`. Positions are `Coordinate`, NOT world vectors — resolve with the transformer.
- **`entityWorldPos(state, ref, transformer)`** (`src/actions/resolve-action-path.ts`) throws if a ref has no resolved position.
- **Action fields** (from `src/types/ocf.generated.ts`): every action has `player: EntityRef`. `pass` has `to_player`. `dribble`/`move`/`cut` have `moves: MoveStep[]` where `MoveStep` has optional `to?: Coordinate` and `around_player?`. `pickup` has `ball_id` (required), `rebound`/`shoot` have `ball_id?`. `screen` has `for_player`/`at`.
- **Action processing today** (`src/scene/compose-frame.ts:103-137`): loops `doc.frames[frameIndex].actions`, skips `defend`/`rebound`/`pickup` (continue), handles `shoot` specially (buildShootGlyph), else calls `resolveActionPath(action, startState, transformer)` then smooth/resample/avoidCollisions, then dispatches by type.
- **`resolveActionPath`** returns `THREE.Vector3[] | null`. For `move/cut/dribble` it calls `expandMoveSteps`; for `pass` it returns `[entityWorldPos(passer), entityWorldPos(to_player)]`.
- **Tests** run with `npx vitest run <path>`. Full suite baseline: **157 passing** (after the arrowhead+defender commit e6bc462). Snapshot tests live in `src/scene/compose-frame.snapshot.test.ts`.

---

## File Structure

- **Create:** `src/actions/frame-action-anchors.ts` — pure resolver. Walks ordered actions, maintains `entityCursor` + `ballCursor`, returns `AnchoredAction[]` (`{ action, startOverride, endOverride? }`). No three.js scene / DOM; Vector3 math only.
- **Create:** `src/actions/frame-action-anchors.test.ts` — unit tests for the resolver.
- **Modify:** `src/actions/resolve-action-path.ts` — add optional `startOverride`/`endOverride` to `resolveActionPath` and thread `startOverride` into `expandMoveSteps`; fix `around_player` apex geometry.
- **Modify:** `src/scene/compose-frame.ts` — call the resolver once per frame; pass overrides into `resolveActionPath`.
- **Test (update):** `src/scene/compose-frame.snapshot.test.ts` snapshots — regenerate after wiring.

---

### Task 1: Anchor resolver — entity cursor chaining (move/cut/dribble)

**Files:**
- Create: `src/actions/frame-action-anchors.ts`
- Test: `src/actions/frame-action-anchors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { resolveFrameActionAnchors } from "./frame-action-anchors";
import type { OcfDocument } from "../types/ocf";

// #1 dribbles to (0,0) then passes to #2; the pass must start where the dribble
// ended, not at #1's frame-start position.
const doc = {
  meta: { title: "chain" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: -3, y: 6 },
    { type: "offense", nr: 2, x: 3, y: 6 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [
    {
      id: "f1",
      actions: [
        { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }] },
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      ],
      end_state: { offense_1: { x: 0, y: 0 } },
    },
  ],
} as unknown as OcfDocument;

describe("resolveFrameActionAnchors — entity cursor chaining", () => {
  it("starts a follow-up action at the previous action's endpoint, not the frame start", () => {
    const t = new CoordinateTransformer(doc.court);
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t);

    // dribble starts at #1's frame-start position (-3, y->-6 in world z)
    expect(anchored[0].startOverride.x).toBeCloseTo(-3, 5);
    expect(anchored[0].startOverride.z).toBeCloseTo(-6, 5);

    // pass starts where the dribble ended: (0,0)
    expect(anchored[1].startOverride.x).toBeCloseTo(0, 5);
    expect(anchored[1].startOverride.z).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: FAIL — `resolveFrameActionAnchors` is not defined (module missing).

- [ ] **Step 3: Write minimal implementation**

Create `src/actions/frame-action-anchors.ts`:

```typescript
import * as THREE from "three";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { entityWorldPos } from "./resolve-action-path";

/** An action plus the world-space points the renderer should draw it between.
 *  `startOverride` replaces the acting player's frame-start position;
 *  `endOverride` (passes only) replaces the target lookup. */
export interface AnchoredAction {
  action: Action;
  startOverride: THREE.Vector3;
  endOverride?: THREE.Vector3;
}

/** Final destination of a move/cut/dribble action in world space: the last
 *  move step that carries a `to`. Returns null if no step has a destination. */
function lastDestination(
  action: Extract<Action, { moves: unknown }>,
  transformer: CoordinateTransformer,
): THREE.Vector3 | null {
  let dest: THREE.Vector3 | null = null;
  for (const move of action.moves) {
    if (move.to) dest = transformer.resolveToWorld(move.to);
  }
  return dest;
}

/** Walk a frame's actions in order, chaining each action's start point to the
 *  acting player's previous action endpoint (the "possession relay"). See
 *  docs/superpowers/specs/2026-08-31-sequential-action-resolution-design.md. */
export function resolveFrameActionAnchors(
  actions: Action[],
  startState: ResolvedFrameState,
  endState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): AnchoredAction[] {
  const entityCursor = new Map<string, THREE.Vector3>();
  const cursorFor = (ref: string): THREE.Vector3 => {
    const existing = entityCursor.get(ref);
    if (existing) return existing;
    const seeded = entityWorldPos(startState, ref, transformer);
    entityCursor.set(ref, seeded);
    return seeded;
  };

  const result: AnchoredAction[] = [];
  for (const action of actions) {
    const startOverride = cursorFor(action.player).clone();
    const anchored: AnchoredAction = { action, startOverride };

    if (action.type === "move" || action.type === "cut" || action.type === "dribble") {
      const dest = lastDestination(action, transformer);
      if (dest) entityCursor.set(action.player, dest);
    }

    result.push(anchored);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/actions/frame-action-anchors.ts src/actions/frame-action-anchors.test.ts
git commit -m "feat(renderer): frame action anchor resolver — entity cursor chaining"
```

---

### Task 2: Pass endpoint = receiver's frame-end position

**Files:**
- Modify: `src/actions/frame-action-anchors.ts`
- Test: `src/actions/frame-action-anchors.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/actions/frame-action-anchors.test.ts`:

```typescript
describe("resolveFrameActionAnchors — pass endpoint", () => {
  // #2 runs from (3,6) to (5,8); #1 passes to #2. Pass must END at #2's
  // frame-END position (5,8), regardless of action order.
  const passDoc = {
    meta: { title: "pass-to-mover" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [
      { type: "offense", nr: 1, x: -3, y: 6 },
      { type: "offense", nr: 2, x: 3, y: 6 },
    ],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [
      {
        id: "f1",
        actions: [
          { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
          { player: "offense_2", type: "move", moves: [{ to: { x: 5, y: 8 } }] },
        ],
        end_state: { offense_2: { x: 5, y: 8 } },
      },
    ],
  } as unknown as import("../types/ocf").OcfDocument;

  it("routes a pass to the receiver's frame-end position even when the pass precedes the run", () => {
    const t = new CoordinateTransformer(passDoc.court);
    const start = resolveFrameState(passDoc, 0, "start");
    const end = resolveFrameState(passDoc, 0, "end");
    const anchored = resolveFrameActionAnchors(passDoc.frames[0].actions!, start, end, t);

    const pass = anchored[0];
    expect(pass.action.type).toBe("pass");
    expect(pass.endOverride).toBeDefined();
    expect(pass.endOverride!.x).toBeCloseTo(5, 5); // #2's end x
    expect(pass.endOverride!.z).toBeCloseTo(-8, 5); // #2's end y -> world z
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: FAIL — `pass.endOverride` is undefined (not yet implemented).

- [ ] **Step 3: Write minimal implementation**

In `src/actions/frame-action-anchors.ts`, inside the action loop, after building `anchored` and before the move/cut/dribble block, add pass handling:

```typescript
    if (action.type === "pass") {
      // Ball is caught where the receiver finishes the frame — a player cannot
      // run while holding the ball, so they must arrive before receiving.
      anchored.endOverride = entityWorldPos(endState, action.to_player, transformer);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: PASS (2 test groups).

- [ ] **Step 5: Commit**

```bash
git add src/actions/frame-action-anchors.ts src/actions/frame-action-anchors.test.ts
git commit -m "feat(renderer): route passes to receiver frame-end position"
```

---

### Task 3: Ball cursor — pickup / rebound advance possession without a path

**Files:**
- Modify: `src/actions/frame-action-anchors.ts`
- Test: `src/actions/frame-action-anchors.test.ts`

**Context:** `pickup`/`rebound` draw no path but transfer possession, so a subsequent `dribble` by that player must start where they gained the ball. Since the acting player's `entityCursor` already reflects their current position, a following dribble by the *same* player already chains correctly via Task 1. This task adds an explicit `ballCursor` so the model is complete and testable, and so the ball's holder/position is available to callers later. It does not change drawn paths for pickup/rebound (they remain path-less).

- [ ] **Step 1: Write the failing test**

Append to `src/actions/frame-action-anchors.test.ts`:

```typescript
import { ballCursorAfter } from "./frame-action-anchors";

describe("resolveFrameActionAnchors — ball cursor", () => {
  // #1 has no ball at start; picks up a loose ball at their spot, then dribbles.
  const doc = {
    meta: { title: "pickup" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [{ type: "offense", nr: 1, x: -2, y: 5 }],
    balls: [{ id: "ball_1", at: { x: -2, y: 5 } }],
    frames: [
      {
        id: "f1",
        actions: [
          { player: "offense_1", type: "pickup", ball_id: "ball_1" },
          { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 1 } }] },
        ],
        end_state: { offense_1: { x: 0, y: 1 } },
      },
    ],
  } as unknown as import("../types/ocf").OcfDocument;

  it("sets the ball holder to the picker-up and its position to their cursor", () => {
    const t = new CoordinateTransformer(doc.court);
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t);
    const ball = ballCursorAfter("ball_1");
    expect(ball?.holder).toBe("offense_1");
    // dribble then carried the ball to (0,1)
    expect(ball?.pos.x).toBeCloseTo(0, 5);
    expect(ball?.pos.z).toBeCloseTo(-1, 5);
  });
});
```

Note: `ballCursorAfter` is a small helper that exposes the last computed ball cursors from the most recent `resolveFrameActionAnchors` call, for test observability. Implement it via a module-level `Map` written at the end of each resolve.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: FAIL — `ballCursorAfter` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/actions/frame-action-anchors.ts`:

Add near the top (after imports):

```typescript
export interface BallCursor {
  holder: string | null;
  pos: THREE.Vector3;
}

// Last-computed ball cursors, keyed by ball id — exposed for test observability.
const lastBallCursors = new Map<string, BallCursor>();

/** The ball cursor (holder + world position) after the most recent
 *  resolveFrameActionAnchors() call. Test/introspection helper. */
export function ballCursorAfter(ballId: string): BallCursor | undefined {
  return lastBallCursors.get(ballId);
}
```

Inside `resolveFrameActionAnchors`, add a ball-cursor map seeded from `startState.balls`, update it as actions are processed, and publish it at the end. Full body of the loop becomes:

```typescript
  const ballCursor = new Map<string, BallCursor>();
  const ballIdFor = (action: Action): string | undefined =>
    "ball_id" in action ? (action.ball_id as string | undefined) : undefined;
  // Seed ball cursors from the frame-start ball states.
  for (const [id, state] of Object.entries(startState.balls)) {
    if ("carried_by" in state) {
      ballCursor.set(id, { holder: state.carried_by, pos: cursorFor(state.carried_by).clone() });
    } else if ("at" in state) {
      ballCursor.set(id, { holder: null, pos: transformer.resolveToWorld(state.at) });
    }
  }

  const result: AnchoredAction[] = [];
  for (const action of actions) {
    const startOverride = cursorFor(action.player).clone();
    const anchored: AnchoredAction = { action, startOverride };

    if (action.type === "pass") {
      anchored.endOverride = entityWorldPos(endState, action.to_player, transformer);
      const id = ballIdFor(action);
      if (id) ballCursor.set(id, { holder: action.to_player, pos: anchored.endOverride.clone() });
    } else if (action.type === "pickup" || action.type === "rebound") {
      const id = ballIdFor(action);
      if (id) ballCursor.set(id, { holder: action.player, pos: cursorFor(action.player).clone() });
    } else if (action.type === "move" || action.type === "cut" || action.type === "dribble") {
      const dest = lastDestination(action, transformer);
      if (dest) {
        entityCursor.set(action.player, dest);
        if (action.type === "dribble") {
          const id = ballIdFor(action);
          if (id) ballCursor.set(id, { holder: action.player, pos: dest.clone() });
        }
      }
    } else if (action.type === "shoot") {
      const id = ballIdFor(action);
      if (id) {
        const basket = transformer.resolveToWorld({ named: "basket" });
        ballCursor.set(id, { holder: null, pos: basket });
      }
    }

    result.push(anchored);
  }

  lastBallCursors.clear();
  for (const [id, cur] of ballCursor) lastBallCursors.set(id, cur);
  return result;
```

Remove the now-duplicated move/cut/dribble block and pass block from Tasks 1–2 (this loop body replaces them).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: PASS (all 3 groups — Task 1 & 2 tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/actions/frame-action-anchors.ts src/actions/frame-action-anchors.test.ts
git commit -m "feat(renderer): ball cursor tracks pickup/rebound/pass/dribble/shoot possession"
```

---

### Task 4: `resolveActionPath` accepts start/end overrides

**Files:**
- Modify: `src/actions/resolve-action-path.ts:42-103` (`expandMoveSteps`), `:107-151` (`resolveActionPath`)
- Test: `src/actions/resolve-action-path.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/actions/resolve-action-path.test.ts` (create the file with these imports if it does not exist — check first with `ls src/actions/resolve-action-path.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { resolveActionPath } from "./resolve-action-path";
import type { OcfDocument } from "../types/ocf";

const doc = {
  meta: { title: "override" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: -3, y: 6 },
    { type: "offense", nr: 2, x: 3, y: 6 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [{ id: "f1", actions: [], end_state: {} }],
} as unknown as OcfDocument;

describe("resolveActionPath — overrides", () => {
  const t = new CoordinateTransformer(doc.court);
  const start = resolveFrameState(doc, 0, "start");

  it("uses startOverride as a move/dribble path's first point", () => {
    const action = { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }] } as any;
    const override = new THREE.Vector3(1, 0, -1);
    const path = resolveActionPath(action, start, t, { startOverride: override });
    expect(path![0].x).toBeCloseTo(1, 5);
    expect(path![0].z).toBeCloseTo(-1, 5);
  });

  it("uses startOverride and endOverride as a pass's two endpoints", () => {
    const action = { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" } as any;
    const s = new THREE.Vector3(1, 0, -1);
    const e = new THREE.Vector3(5, 0, -8);
    const path = resolveActionPath(action, start, t, { startOverride: s, endOverride: e });
    expect(path![0].equals(s)).toBe(true);
    expect(path![path!.length - 1].equals(e)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: FAIL — `resolveActionPath` ignores `startOverride`/`endOverride` (options type has no such fields; path starts at the entity's own position).

- [ ] **Step 3: Write minimal implementation**

In `src/actions/resolve-action-path.ts`:

Extend the options interface:

```typescript
export interface ResolveActionPathOptions {
  arcDistances?: Partial<ArcDistances>;
  startOverride?: THREE.Vector3;
  endOverride?: THREE.Vector3;
}
```

Thread `startOverride` into `expandMoveSteps` by adding a parameter and using it as the seed point. Change the signature and first line:

```typescript
function expandMoveSteps(
  action: Extract<Action, { type: "move" | "cut" | "dribble" }>,
  startState: ResolvedFrameState,
  transformer: CoordinateTransformer,
  arcDistances: ArcDistances,
  startOverride?: THREE.Vector3,
): THREE.Vector3[] {
  const points = [startOverride ? startOverride.clone() : entityWorldPos(startState, action.player, transformer)];
  let current = points[0];
  // ...unchanged below...
```

In `resolveActionPath`, pass the override through and use overrides for pass endpoints:

```typescript
    case "move":
    case "cut":
    case "dribble": {
      const points = expandMoveSteps(action, startState, transformer, arcDistances, options.startOverride);
      if (points.length <= 1) return null;
      return points;
    }
    case "pass": {
      const start = options.startOverride ?? entityWorldPos(startState, action.player, transformer);
      const end = options.endOverride ?? entityWorldPos(startState, action.to_player, transformer);
      return [start.clone(), end.clone()];
    }
```

(Leave `screen` and the null-returning cases unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: PASS. Also run the existing suite for this file's prior tests: same command covers them.

- [ ] **Step 5: Commit**

```bash
git add src/actions/resolve-action-path.ts src/actions/resolve-action-path.test.ts
git commit -m "feat(renderer): resolveActionPath accepts start/end overrides"
```

---

### Task 5: Fix `around_player` apex hook (no backtracking)

**Files:**
- Modify: `src/actions/resolve-action-path.ts` (the `around_player` block inside `expandMoveSteps`, currently lines ~54-97)
- Test: `src/actions/resolve-action-path.test.ts`

**Context:** Today the approach/exit points are derived from the `current→apex` and `apex→destination` legs plus a side nudge. When the obstacle sits between start and a destination on the same side, this produces an up-then-down hook. Fix: project approach/exit along the **start→destination heading** so the path advances monotonically along that heading.

- [ ] **Step 1: Write the failing test**

Append to `src/actions/resolve-action-path.test.ts`:

```typescript
describe("resolveActionPath — around_player is monotonic", () => {
  // Reproduce the pick-and-roll hook: start above the obstacle, destination
  // below-left, obstacle between them. The resolved path must not reverse along
  // the start->destination heading (no up-then-down hook).
  const doc = {
    meta: { title: "around" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [
      { type: "offense", nr: 1, x: 0, y: 5.68 },
      { type: "defense", nr: 1, x: 0.5, y: 5.2 },
    ],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [{ id: "f1", actions: [], end_state: {} }],
  } as unknown as OcfDocument;

  it("keeps the path's projection onto the start->destination heading non-decreasing", () => {
    const t = new CoordinateTransformer(doc.court);
    const start = resolveFrameState(doc, 0, "start");
    const action = {
      player: "offense_1",
      type: "dribble",
      ball_id: "ball_1",
      moves: [{ to: { x: 2.45, y: 8.2 }, around_player: "defense_1" }],
    } as any;
    const path = resolveActionPath(action, start, t)!;
    const heading = path[path.length - 1].clone().sub(path[0]).setY(0).normalize();
    let prev = -Infinity;
    for (const p of path) {
      const proj = p.clone().sub(path[0]).dot(heading);
      // allow a tiny epsilon for float noise, but no real backtracking
      expect(proj).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = Math.max(prev, proj);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: FAIL — the current apex geometry backtracks (projection decreases at the hook), so the assertion trips.

- [ ] **Step 3: Write minimal implementation**

Replace the approach/exit derivation in the `around_player` block. Find:

```typescript
      const easeSide = distance * 0.4;
      const approachT = 0.5; // midpoint of the current→apex leg
      const exitT = 0.5; // midpoint of the apex→destination leg
      const approach = current.clone().lerp(apex, approachT).addScaledVector(side, easeSide);
      const exit = apex.clone().lerp(destination, exitT).addScaledVector(side, easeSide);

      points.push(approach);
      points.push(apex);
      points.push(exit);
```

Replace with a heading-projected derivation:

```typescript
      // Project approach/exit along the start->destination heading so the detour
      // advances monotonically and never doubles back into an up-then-down hook.
      const heading = new THREE.Vector3().subVectors(destination, current).setY(0).normalize();
      // Signed distance of the apex along the heading, measured from `current`.
      const apexAlong = new THREE.Vector3().subVectors(apex, current).dot(heading);
      const ease = Math.min(distance * 0.4, length * 0.25); // clamp so short legs can't invert
      const approach = current
        .clone()
        .addScaledVector(heading, Math.max(0, apexAlong - ease))
        .addScaledVector(side, distance * 0.6);
      const exit = current
        .clone()
        .addScaledVector(heading, Math.min(length, apexAlong + ease))
        .addScaledVector(side, distance * 0.6);

      points.push(approach);
      points.push(apex);
      points.push(exit);
```

(`length` and `side` and `distance` are already in scope from the surrounding block; `direction` remains the normalized `current→destination` used above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: PASS. Run the full existing around_player tests too (same file) to ensure no regression in the explicit-side / arc-distance behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/actions/resolve-action-path.ts src/actions/resolve-action-path.test.ts
git commit -m "fix(renderer): around_player detour advances monotonically (no hook)"
```

---

### Task 6: Wire the resolver into `compose-frame`

**Files:**
- Modify: `src/scene/compose-frame.ts:103-137`
- Test (update): `src/scene/compose-frame.snapshot.test.ts` snapshots

- [ ] **Step 1: Write the failing test**

Add a behavioural test file `src/scene/compose-frame.chaining.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { composeFrame } from "./compose-frame";
import type { OcfDocument } from "../types/ocf";

// #1 dribbles to (0,0) then passes to #2. The pass line (name "pass-path")
// must START near (0,0), where the dribble ended — not at #1's start (-3,6).
const doc = {
  meta: { title: "chain-render" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: -3, y: 6 },
    { type: "offense", nr: 2, x: 4, y: 2 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [
    {
      id: "f1",
      actions: [
        { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }] },
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      ],
      end_state: { offense_1: { x: 0, y: 0 } },
    },
  ],
} as unknown as OcfDocument;

function firstPoint(line: THREE.Object3D): THREE.Vector3 {
  const geom = (line as THREE.Mesh).geometry;
  const attr = geom.getAttribute("instanceStart");
  return new THREE.Vector3(attr.getX(0), attr.getY(0), attr.getZ(0));
}

describe("composeFrame — sequential chaining", () => {
  it("starts the pass line where the dribble ended, not at the passer's frame-start", () => {
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    const pass = actions.children.find((c) => c.name === "pass-path")!;
    const p0 = firstPoint(pass);
    // near (0,0); the pass is trimmed slightly off the target end, not the start,
    // so the start stays at the dribble endpoint.
    expect(p0.x).toBeCloseTo(0, 1);
    expect(p0.z).toBeCloseTo(0, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/compose-frame.chaining.test.ts`
Expected: FAIL — the pass currently starts at (-3, -6) (passer's frame-start), so `p0.x` ≈ -3, not 0.

- [ ] **Step 3: Write minimal implementation**

In `src/scene/compose-frame.ts`:

Add the import near the other action imports:

```typescript
import { resolveFrameActionAnchors } from "../actions/frame-action-anchors";
```

Resolve the end state and the anchors once, just before the action loop (after `actionGroup` is created, around line 101):

```typescript
  const endState = resolveFrameState(doc, frameIndex, "end");
  const anchored = resolveFrameActionAnchors(
    doc.frames[frameIndex].actions ?? [],
    startState,
    endState,
    transformer,
  );
```

Change the loop to iterate the anchored actions and pass overrides through. Replace `for (const action of doc.frames[frameIndex].actions ?? [])` with:

```typescript
  for (const { action, startOverride, endOverride } of anchored) {
```

Then, in the `shoot` branch, use `startOverride` for the shooter position:

```typescript
    if (action.type === "shoot") {
      const shooterPos = startOverride;
      const basketPos = transformer.resolveToWorld({ named: "basket" });
      actionGroup.add(buildShootGlyph(shooterPos, basketPos, colors.offense_fill));
      continue;
    }
```

And pass overrides into `resolveActionPath`:

```typescript
    const rawPath = resolveActionPath(action, startState, transformer, { startOverride, endOverride });
```

Everything downstream (smooth/resample/avoidCollisions/dispatch) is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/compose-frame.chaining.test.ts`
Expected: PASS.

- [ ] **Step 5: Regenerate scene-graph snapshots**

The action start points now differ for fixtures with chained actions. Regenerate:

Run: `npx vitest run src/scene/compose-frame.snapshot.test.ts -u`
Expected: snapshots updated, tests pass. Inspect the diff to confirm only path start/end coordinates changed (no unexpected structural changes).

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass (was 157 + the new tests from Tasks 1–6).

- [ ] **Step 7: Commit**

```bash
git add src/scene/compose-frame.ts src/scene/compose-frame.chaining.test.ts src/scene/__snapshots__/compose-frame.snapshot.test.ts.snap
git commit -m "feat(renderer): compose-frame anchors actions via the possession relay"
```

---

### Task 7: Visual regression — re-render affected fixtures

**Files:**
- No source changes. Uses `scripts/shoot-fixture.mjs`.

- [ ] **Step 1: Rebuild the bundle**

Run: `npm run build`
Expected: `build ok` (no errors).

- [ ] **Step 2: Render the affected fixtures**

Run:
```bash
node scripts/shoot-fixture.mjs 3-man-weave 0 screenshots/verify-weave.png
node scripts/shoot-fixture.mjs transition-3v2 0 screenshots/verify-transition.png
node scripts/shoot-fixture.mjs pick-and-roll 1 screenshots/verify-pnr-f2.png
node scripts/shoot-fixture.mjs pick-and-roll 2 screenshots/verify-pnr-f3.png
```
Expected: each prints `wrote screenshots/verify-*.png`.

- [ ] **Step 3: Inspect the renders**

Open each PNG and verify against the design's acceptance criteria:
- `3-man-weave`: the pass (dashed) and the cut (solid) no longer both spring from #1's start point; the cut starts from #1, the pass goes to #2 — they read as distinct, sequential actions.
- `transition-3v2`: path starts sit on the players; passes/moves start cleanly.
- `pick-and-roll` f2: the dribble arcs around the screener/defender without an up-then-down hook.
- `pick-and-roll` f3: the pass starts where the ball-carrier is and ends at the receiver's end position.

If any render is wrong, the corresponding earlier task's logic needs revisiting — do not proceed until the four renders match the criteria.

- [ ] **Step 4: Full-gallery smoke test**

Run:
```bash
for f in simple-cut simple-dribble pass-and-screen shoot full-court-two-players custom-court pick-and-roll 3-man-weave transition-3v2 continuous-ball-screen quick-mode around-player-arc source-four-frame-ball-screen ref-pick-roll-passing ref-2man-fastbreak; do
  node scripts/shoot-fixture.mjs "$f" 0 "screenshots/smoke-$f.png" 2>&1 | tail -1
done
```
Expected: every fixture prints `wrote ...` with no thrown errors (confirms nothing regressed to a crash).

- [ ] **Step 5: Commit any regenerated reference screenshots (if the repo tracks them)**

Run: `git status --short screenshots/`
If screenshots are gitignored (check `.gitignore`), skip. Otherwise:
```bash
git add screenshots/
git commit -m "test(renderer): refresh verification screenshots for sequential resolution"
```

---

## Self-Review

**1. Spec coverage:**
- Possession relay / entity cursor chaining → Task 1. ✓
- Pass endpoint = receiver frame-end → Task 2. ✓
- Ball cursor drivers (pass/dribble/pickup/rebound/shoot) → Task 3. ✓
- `resolveActionPath` overrides → Task 4. ✓
- around_player apex hook (in scope) → Task 5. ✓
- Wire into compose-frame, pickup/rebound still path-less → Task 6. ✓
- Testing: chaining, pass-target, pickup/rebound, invariant-assumed, monotonic arc, visual regression → Tasks 1–3, 5, 7. ✓
- "Invariant assumed, not enforced (console warning, no crash)": the renderer draws whatever is declared; no task adds enforcement, matching the spec. The optional console warning is not implemented (YAGNI — spec says "may"); noted, not required.
- No schema change → confirmed, no task touches schema. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has full code. ✓

**3. Type consistency:** `resolveFrameActionAnchors(actions, startState, endState, transformer)`, `AnchoredAction { action, startOverride, endOverride? }`, `BallCursor { holder, pos }`, `ResolveActionPathOptions { arcDistances?, startOverride?, endOverride? }` — names consistent across Tasks 1–6. `entityWorldPos` and `resolveToWorld` match the current source. ✓

**Note for the implementer:** the branch is `feat/local-preview-and-fixtures`, which already contains the arrowhead + defender fixes and the design docs. Do all work there.
