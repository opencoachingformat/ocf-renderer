# `after`-Ordering & Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order a frame's actions by their `after` dependencies, catch passes at the correct point (keyed off the receiver's first action), highlight conflicting actions in red, enlarge arrowheads, and nudge overlapping player symbols apart.

**Architecture:** Two new pure modules — `order-actions.ts` (topological sort of `after`) and `separate-overlapping.ts` (symbol de-overlap relaxation). `frame-action-anchors.ts` orders actions first and computes each pass's catch point by the "Pass target" rule. `compose-frame.ts` uses nudged display positions for symbols and anchoring, and renders conflicting actions red. `arrowhead.ts` gets a bigger head.

**Tech Stack:** TypeScript, three.js (Vector3 math only in pure modules), vitest.

**Design:** `docs/superpowers/specs/2026-08-31-after-ordering-and-legibility-design.md`

---

## Key facts an implementer needs (verified against current code)

- Branch `feat/local-preview-and-fixtures` is checked out and already contains the sequential-resolution work + these design docs. Do all work there.
- Tests: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Baseline: **164 tests pass**.
- **`after`** is a schema field on every action: a string `"<entity_ref>.<action_type>"`, e.g. `"offense_2.dribble"`. An action's own ref is `` `${action.player}.${action.type}` ``.
- **`hand_off`** is NOT an action type — it is a `variant` of `pass`. Handovers flow through pass logic unchanged; no special handling.
- **Ball-requiring** action types: `dribble`, `pass`, `shoot`. **No-ball (running)**: `move`, `cut`.
- `resolveFrameState(doc, i, "start"|"end")` → `{ positions: Record<ref, Coordinate>, balls }`.
- `entityWorldPos(state, ref, transformer)` (exported from `resolve-action-path.ts`) → world Vector3, throws if missing.
- `CoordinateTransformer.resolveToWorld(coord)` → `Vector3(x, 0, -y)`.
- Current `resolveFrameActionAnchors(actions, startState, endState, transformer)` lives in `src/actions/frame-action-anchors.ts`; its pass branch currently sets `endOverride = entityWorldPos(endState, to_player, ...)` — THIS is the interim rule to replace.
- `compose-frame.ts` action dispatch (~lines 115-150) passes `colors.offense_fill` to every builder. The dribble branch calls `buildWavyLine(adjusted)` WITHOUT a color arg; to render red it must pass a color. `OFFENSE_SYMBOL_RADIUS_M = 0.5`, `DEFENSE_SYMBOL_HEIGHT_M = 0.46`.
- `compose-frame.ts` entity loop (~lines 48-77) resolves `worldPos = transformer.resolveToWorld(coord)` per entity and uses it for both `symbol.position` and the collision `obstacles` list.
- Arrowhead (`src/actions/arrowhead.ts`): `ARROWHEAD_LENGTH_M = 0.25`, `ARROWHEAD_HALF_WIDTH_M = ARROWHEAD_LENGTH_M * 0.5`. `trimPathEnd` is called in compose with `OFFENSE_SYMBOL_RADIUS_M + 0.1`.
- Builder color params: `buildThickLine(points, color?)`, `buildWavyLine(points, color?)`, `buildDashedLine(points, color?)`, `buildScreenLine(points, color?)`, `buildArrowhead(atPoint, direction, color)`. `colors.red` exists in the scheme.

---

## File Structure

- **Create** `src/actions/order-actions.ts` — `orderFrameActions(actions)` → `{ ordered, conflicts }`. Pure.
- **Create** `src/actions/order-actions.test.ts`.
- **Create** `src/entities/separate-overlapping.ts` — `separateOverlappingSymbols(positions, radius, margin)` → `Map<ref, Vector3>`. Pure.
- **Create** `src/entities/separate-overlapping.test.ts`.
- **Modify** `src/actions/frame-action-anchors.ts` — order first; pass-target rule; per-action `conflict` flag.
- **Modify** `src/actions/frame-action-anchors.test.ts` — new pass-target tests; replace the interim frame-end test.
- **Modify** `src/actions/arrowhead.ts` — bigger head.
- **Modify** `src/actions/arrowhead.test.ts` — assert the new length.
- **Modify** `src/scene/compose-frame.ts` — display positions, red conflicts, scaled trim.
- **Create** `src/scene/compose-frame.conflict.test.ts` — red-render assertion.
- **Update** `src/scene/__snapshots__/compose-frame.snapshot.test.ts.snap` — regenerate (arrowhead size changes glyph geometry).

---

### Task 1: `orderFrameActions` — topological sort of `after`

**Files:**
- Create: `src/actions/order-actions.ts`
- Test: `src/actions/order-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { orderFrameActions } from "./order-actions";
import type { Action } from "../types/ocf";

const dribble = { player: "offense_2", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }] } as unknown as Action;
const pass = { player: "offense_2", type: "pass", to_player: "offense_3", ball_id: "ball_1", after: "offense_2.dribble" } as unknown as Action;
const cut = { player: "offense_2", type: "cut", moves: [{ to: { x: 3, y: 3 } }], after: "offense_2.pass" } as unknown as Action;

describe("orderFrameActions", () => {
  it("sorts actions so each follows its `after` dependency, regardless of document order", () => {
    const { ordered, conflicts } = orderFrameActions([cut, pass, dribble]); // reversed
    expect(ordered.map((a) => a.type)).toEqual(["dribble", "pass", "cut"]);
    expect(conflicts.size).toBe(0);
  });

  it("preserves document order for actions without `after` (stable)", () => {
    const a = { player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }] } as unknown as Action;
    const b = { player: "offense_2", type: "move", moves: [{ to: { x: 2, y: 2 } }] } as unknown as Action;
    const { ordered } = orderFrameActions([a, b]);
    expect(ordered).toEqual([a, b]);
  });

  it("flags a cycle as conflicts and falls back without throwing", () => {
    const x = { player: "offense_1", type: "pass", to_player: "offense_2", after: "offense_1.dribble" } as unknown as Action;
    const y = { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }], after: "offense_1.pass" } as unknown as Action;
    const { ordered, conflicts } = orderFrameActions([x, y]);
    expect(ordered).toHaveLength(2); // no throw, both still present
    expect(conflicts.has(x)).toBe(true);
    expect(conflicts.has(y)).toBe(true);
  });

  it("flags an action whose `after` points at a non-existent action", () => {
    const a = { player: "offense_1", type: "pass", to_player: "offense_2", after: "offense_9.dribble" } as unknown as Action;
    const { ordered, conflicts } = orderFrameActions([a]);
    expect(ordered).toEqual([a]);
    expect(conflicts.has(a)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/order-actions.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/actions/order-actions.ts`:

```typescript
import type { Action } from "../types/ocf";

/** An action's self-reference in `after` syntax: "<entity_ref>.<action_type>". */
function actionRef(action: Action): string {
  return `${action.player}.${action.type}`;
}

/** Result of ordering a frame's actions by their `after` dependencies. */
export interface OrderedFrameActions {
  /** Actions in an order where every action follows its `after` dependency. */
  ordered: Action[];
  /** Actions involved in a cycle or referencing a non-existent action — their
   *  ordering edge is dropped and they should be drawn highlighted. */
  conflicts: Set<Action>;
}

/** Topologically sort a frame's actions using `after` as edges. `after`-free
 *  actions (and ties) keep document order (stable). A cycle or dangling `after`
 *  is soft: the offending edge is dropped, the action is flagged in `conflicts`,
 *  and ordering continues without throwing. See the design doc. */
export function orderFrameActions(actions: Action[]): OrderedFrameActions {
  const conflicts = new Set<Action>();

  // Map each ref to the action that declares it. If two actions share a ref
  // (same player+type twice in a frame), the first wins as the dependency target.
  const byRef = new Map<string, Action>();
  for (const a of actions) {
    const ref = actionRef(a);
    if (!byRef.has(ref)) byRef.set(ref, a);
  }

  // Build dependency edges: action -> the action it must follow.
  const dependsOn = new Map<Action, Action | null>();
  for (const a of actions) {
    const after = (a as { after?: string }).after;
    if (!after) {
      dependsOn.set(a, null);
      continue;
    }
    const target = byRef.get(after);
    if (!target || target === a) {
      // Dangling (or self) reference: drop the edge, flag the action.
      conflicts.add(a);
      dependsOn.set(a, null);
    } else {
      dependsOn.set(a, target);
    }
  }

  // Detect cycles by walking each action's dependency chain; if we revisit an
  // action already on the current path, every action on that path is in a cycle.
  const inCycle = new Set<Action>();
  for (const start of actions) {
    const path: Action[] = [];
    const seen = new Set<Action>();
    let node: Action | null = start;
    while (node) {
      if (seen.has(node)) {
        // Mark from the first occurrence of `node` to the end of the path.
        const from = path.indexOf(node);
        for (let i = from; i < path.length; i++) inCycle.add(path[i]);
        break;
      }
      seen.add(node);
      path.push(node);
      node = dependsOn.get(node) ?? null;
    }
  }
  for (const a of inCycle) {
    conflicts.add(a);
    dependsOn.set(a, null); // drop cyclic edges so the sort can proceed
  }

  // Stable topological order: repeatedly emit actions whose dependency is already
  // emitted (or null), scanning in document order to keep ties stable.
  const ordered: Action[] = [];
  const emitted = new Set<Action>();
  while (ordered.length < actions.length) {
    let progressed = false;
    for (const a of actions) {
      if (emitted.has(a)) continue;
      const dep = dependsOn.get(a) ?? null;
      if (dep === null || emitted.has(dep)) {
        ordered.push(a);
        emitted.add(a);
        progressed = true;
      }
    }
    if (!progressed) {
      // Safety net: any remainder (shouldn't happen after cycle-breaking) is
      // appended in document order so we never loop forever.
      for (const a of actions) if (!emitted.has(a)) { ordered.push(a); emitted.add(a); }
      break;
    }
  }

  return { ordered, conflicts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/order-actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/actions/order-actions.ts src/actions/order-actions.test.ts
git commit -m "feat(renderer): orderFrameActions — topological sort of the after field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pass-target rule + `after` ordering + conflict flag in the resolver

**Files:**
- Modify: `src/actions/frame-action-anchors.ts`
- Test: `src/actions/frame-action-anchors.test.ts`

**Context:** Replace the interim "pass → receiver frame-end" logic with the design's rule. Order actions via `orderFrameActions` before walking. Add a `conflict` flag to each `AnchoredAction`.

Pass target rule (receiver = `to_player`): inspect the receiver's actions in the ORDERED list.
- If the receiver's first ordered action is ball-requiring (dribble/pass/shoot), or the receiver has no action → catch at the receiver's **start** position.
- If the receiver's first ordered action(s) are no-ball (move/cut) → catch at the **end of the last consecutive no-ball action** before their first ball-requiring action (or, if they only ever run this frame, the end of their last run).

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe("resolveFrameActionAnchors — pass endpoint", ...)` block in `src/actions/frame-action-anchors.test.ts` (the one asserting frame-end) with these three:

```typescript
describe("resolveFrameActionAnchors — pass target (receiver's first action)", () => {
  const t = () => new CoordinateTransformer({ ruleset: "fiba", type: "half_court" } as never);

  it("catches at the receiver's START when their first action needs the ball", () => {
    const doc = {
      meta: { title: "catch-and-dribble" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [
        { type: "offense", nr: 1, x: -3, y: 6 },
        { type: "offense", nr: 2, x: 3, y: 6 },
      ],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
        { player: "offense_2", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 5, y: 2 } }], after: "offense_1.pass" },
      ], end_state: { offense_2: { x: 5, y: 2 } } }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t());
    const pass = anchored.find((a) => a.action.type === "pass")!;
    expect(pass.endOverride!.x).toBeCloseTo(3, 5); // #2 START x
    expect(pass.endOverride!.z).toBeCloseTo(-6, 5); // #2 START y -> world z
  });

  it("catches at the receiver's START when they have no action in the frame", () => {
    const doc = {
      meta: { title: "no-receiver-action" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [
        { type: "offense", nr: 1, x: -3, y: 6 },
        { type: "offense", nr: 2, x: 3, y: 6 },
      ],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      ], end_state: { offense_2: { x: 5, y: 8 } } }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t());
    const pass = anchored[0];
    expect(pass.endOverride!.x).toBeCloseTo(3, 5); // #2 START, not end (5,8)
    expect(pass.endOverride!.z).toBeCloseTo(-6, 5);
  });

  it("catches at the END of the receiver's last no-ball run when they run first", () => {
    const doc = {
      meta: { title: "run-then-catch" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [
        { type: "offense", nr: 1, x: -3, y: 6 },
        { type: "offense", nr: 2, x: 3, y: 6 },
      ],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
        { player: "offense_2", type: "move", moves: [{ to: { x: 4, y: 7 } }] },
        { player: "offense_2", type: "cut", moves: [{ to: { x: 5, y: 8 } }], after: "offense_2.move" },
      ], end_state: { offense_2: { x: 5, y: 8 } } }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t());
    const pass = anchored.find((a) => a.action.type === "pass")!;
    expect(pass.endOverride!.x).toBeCloseTo(5, 5); // end of the cut (last run)
    expect(pass.endOverride!.z).toBeCloseTo(-8, 5);
  });
});
```

Also add a conflict-flag test:

```typescript
describe("resolveFrameActionAnchors — conflict flag", () => {
  it("marks actions in an after-cycle as conflicts", () => {
    const doc = {
      meta: { title: "cycle" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_1", ball_id: "ball_1", after: "offense_1.dribble" },
        { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 1, y: 6 } }], after: "offense_1.pass" },
      ] }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, new CoordinateTransformer({ ruleset: "fiba", type: "half_court" } as never));
    expect(anchored.every((a) => a.conflict)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: FAIL — pass currently uses end position; `conflict` is undefined.

- [ ] **Step 3: Implement**

Edit `src/actions/frame-action-anchors.ts`:

Add the import:

```typescript
import { orderFrameActions } from "./order-actions";
```

Add `conflict` to the interface:

```typescript
export interface AnchoredAction {
  action: Action;
  startOverride: THREE.Vector3;
  endOverride?: THREE.Vector3;
  /** True when this action is part of a broken/cyclic `after` chain — the
   *  renderer draws it highlighted. */
  conflict: boolean;
}
```

Add a helper above `resolveFrameActionAnchors` that computes a pass's catch point:

```typescript
const BALL_REQUIRING = new Set(["dribble", "pass", "shoot"]);
const NO_BALL_RUN = new Set(["move", "cut"]);

/** Where a pass to `receiver` is caught, per the design's pass-target rule:
 *  - receiver's first ordered action needs the ball, or they have no action →
 *    their start position;
 *  - receiver runs first → the end of their last consecutive no-ball run before
 *    their first ball-requiring action. */
function passCatchPoint(
  receiver: string,
  orderedActions: Action[],
  startState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): THREE.Vector3 {
  const receiverActions = orderedActions.filter((a) => a.player === receiver);
  const first = receiverActions[0];
  if (!first || BALL_REQUIRING.has(first.type)) {
    return entityWorldPos(startState, receiver, transformer);
  }
  // Runs first: walk the leading run of no-ball actions, tracking the last
  // destination, until a ball-requiring action (or the end of the list).
  let catchPoint = entityWorldPos(startState, receiver, transformer);
  for (const a of receiverActions) {
    if (BALL_REQUIRING.has(a.type)) break;
    if (NO_BALL_RUN.has(a.type)) {
      const dest = lastDestination(a as Extract<Action, { moves: unknown }>, transformer);
      if (dest) catchPoint = dest;
    }
  }
  return catchPoint;
}
```

Change the function to order first and thread conflicts. Replace the body from `const result: AnchoredAction[] = [];` onward:

```typescript
  const { ordered, conflicts } = orderFrameActions(actions);

  const result: AnchoredAction[] = [];
  for (const action of ordered) {
    const startOverride = cursorFor(action.player).clone();
    const anchored: AnchoredAction = { action, startOverride, conflict: conflicts.has(action) };

    if (action.type === "pass") {
      anchored.endOverride = passCatchPoint(action.to_player, ordered, startState, transformer);
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

Note: `endState` is now unused in this function. Leave the parameter in place (stable signature; callers pass it) — it is fine unused (project tsconfig has no `noUnusedParameters`; verified). Update the JSDoc to reference the after-ordering design doc.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/frame-action-anchors.test.ts`
Expected: PASS (chaining, three pass-target cases, ball cursor, conflict flag).

- [ ] **Step 5: Full suite — expect compose-frame.chaining.test to still pass**

Run: `npx vitest run`
Expected: the earlier `compose-frame.chaining.test.ts` (pass starts where dribble ended) still passes — the passer's start override is unchanged; only the pass END rule changed. If it fails, inspect: that test's receiver `offense_2` has no action, so the pass now ends at #2's start (4,2) — the test only asserts the START point of the pass line, so it stays green.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/actions/frame-action-anchors.ts src/actions/frame-action-anchors.test.ts
git commit -m "feat(renderer): after-ordering + pass-target rule + conflict flag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Bigger arrowheads

**Files:**
- Modify: `src/actions/arrowhead.ts`
- Test: `src/actions/arrowhead.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/actions/arrowhead.test.ts`:

```typescript
import { ARROWHEAD_LENGTH_M } from "./arrowhead";

describe("arrowhead size", () => {
  it("is large enough to read at the default zoom (>= 0.5 court units)", () => {
    expect(ARROWHEAD_LENGTH_M).toBeGreaterThanOrEqual(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/arrowhead.test.ts`
Expected: FAIL — `ARROWHEAD_LENGTH_M` is not exported (and is 0.25).

- [ ] **Step 3: Implement**

In `src/actions/arrowhead.ts`, change the constant and export it:

```typescript
export const ARROWHEAD_LENGTH_M = 0.6;
```

(It is currently `const ARROWHEAD_LENGTH_M = 0.25;` — change the value to `0.6` and add `export`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/arrowhead.test.ts`
Expected: PASS (existing arrowhead tests + the new size test).

- [ ] **Step 5: Scale the trim so the bigger head doesn't overshoot the target**

In `src/scene/compose-frame.ts`, the two `trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + 0.1)` calls pull the line back so the arrowhead sits at the end without covering the target symbol. With a longer head, increase the pull-back by the extra head length. Add an import and change both calls:

Add to the arrowhead import line:

```typescript
import { trimPathEnd, buildArrowhead, ARROWHEAD_LENGTH_M } from "../actions/arrowhead";
```

Replace both occurrences of `trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + 0.1)` with:

```typescript
trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + ARROWHEAD_LENGTH_M)
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/actions/arrowhead.ts src/actions/arrowhead.test.ts src/scene/compose-frame.ts
git commit -m "feat(renderer): larger arrowheads (0.25 -> 0.6 court units) + scaled path trim

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `separateOverlappingSymbols` — de-overlap helper

**Files:**
- Create: `src/entities/separate-overlapping.ts`
- Test: `src/entities/separate-overlapping.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { separateOverlappingSymbols } from "./separate-overlapping";

const RADIUS = 0.5;
const MARGIN = 0.15;
const MIN_GAP = 2 * RADIUS + MARGIN;

describe("separateOverlappingSymbols", () => {
  it("pushes two near-coincident symbols at least the minimum gap apart", () => {
    const input = new Map<string, THREE.Vector3>([
      ["a", new THREE.Vector3(0, 0, 0)],
      ["b", new THREE.Vector3(0.05, 0, 0)],
    ]);
    const out = separateOverlappingSymbols(input, RADIUS, MARGIN);
    const d = out.get("a")!.distanceTo(out.get("b")!);
    expect(d).toBeGreaterThanOrEqual(MIN_GAP - 1e-6);
  });

  it("leaves already-separated symbols unchanged", () => {
    const a = new THREE.Vector3(-3, 0, 0);
    const b = new THREE.Vector3(3, 0, 0);
    const out = separateOverlappingSymbols(new Map([["a", a], ["b", b]]), RADIUS, MARGIN);
    expect(out.get("a")!.equals(a)).toBe(true);
    expect(out.get("b")!.equals(b)).toBe(true);
  });

  it("displaces an overlapping pair symmetrically about their midpoint", () => {
    const input = new Map<string, THREE.Vector3>([
      ["a", new THREE.Vector3(-0.1, 0, 0)],
      ["b", new THREE.Vector3(0.1, 0, 0)],
    ]);
    const out = separateOverlappingSymbols(input, RADIUS, MARGIN);
    const mid = out.get("a")!.clone().add(out.get("b")!).multiplyScalar(0.5);
    expect(mid.x).toBeCloseTo(0, 5);
    expect(mid.z).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entities/separate-overlapping.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/entities/separate-overlapping.ts`:

```typescript
import * as THREE from "three";

const MAX_ITERATIONS = 8;

/** Nudges overlapping symbol positions apart for display only (data unchanged).
 *  Any pair closer than `2*radius + margin` is pushed apart symmetrically along
 *  the line between their centres; a few relaxation passes settle clusters of
 *  three or more. Positions that never overlap are returned unchanged. Works in
 *  the court plane (x/z); the y component is preserved. */
export function separateOverlappingSymbols(
  positions: Map<string, THREE.Vector3>,
  radius: number,
  margin: number,
): Map<string, THREE.Vector3> {
  const minGap = 2 * radius + margin;
  const out = new Map<string, THREE.Vector3>();
  for (const [ref, p] of positions) out.set(ref, p.clone());

  const refs = [...out.keys()];
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        const a = out.get(refs[i])!;
        const b = out.get(refs[j])!;
        const delta = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
        let dist = delta.length();
        if (dist >= minGap) continue;
        moved = true;
        // Deterministic direction when exactly coincident: push along +x.
        const dir = dist > 1e-6 ? delta.multiplyScalar(1 / dist) : new THREE.Vector3(1, 0, 0);
        const push = (minGap - dist) / 2;
        a.addScaledVector(dir, -push);
        b.addScaledVector(dir, push);
      }
    }
    if (!moved) break;
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entities/separate-overlapping.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/entities/separate-overlapping.ts src/entities/separate-overlapping.test.ts
git commit -m "feat(renderer): separateOverlappingSymbols — nudge coincident symbols apart

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire display positions + red conflicts into compose-frame

**Files:**
- Modify: `src/scene/compose-frame.ts`
- Create: `src/scene/compose-frame.conflict.test.ts`
- Update: `src/scene/__snapshots__/compose-frame.snapshot.test.ts.snap`

- [ ] **Step 1: Write the failing conflict test**

Create `src/scene/compose-frame.conflict.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { composeFrame } from "./compose-frame";
import { DEFAULT_COLOR_SCHEME } from "../style/color-scheme";
import type { OcfDocument } from "../types/ocf";

// Two actions forming an after-cycle → both drawn in the conflict (red) colour.
const doc = {
  meta: { title: "conflict" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: -3, y: 6 },
    { type: "offense", nr: 2, x: 3, y: 6 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [{ id: "f1", actions: [
    { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1", after: "offense_1.cut" },
    { player: "offense_1", type: "cut", moves: [{ to: { x: -1, y: 8 } }], after: "offense_1.pass" },
  ] }],
} as unknown as OcfDocument;

function materialColors(obj: THREE.Object3D): number[] {
  const hexes: number[] = [];
  obj.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat && "color" in mat) hexes.push((mat as THREE.MeshBasicMaterial).color.getHex());
  });
  return hexes;
}

describe("composeFrame — conflict highlighting", () => {
  it("draws an after-cycle action's glyphs in the red conflict colour", () => {
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    const redHex = new THREE.Color(DEFAULT_COLOR_SCHEME.red).getHex();
    const allColors = materialColors(actions);
    expect(allColors).toContain(redHex);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/compose-frame.conflict.test.ts`
Expected: FAIL — actions currently always use `colors.offense_fill`, never red.

- [ ] **Step 3: Implement display positions**

In `src/scene/compose-frame.ts`:

Add imports:

```typescript
import { separateOverlappingSymbols } from "../entities/separate-overlapping";
```

Before the entity loop (just after `const obstacles: Obstacle[] = [];`), build display positions. First gather raw world positions, separate them, and use the result in the loop. Replace the entity loop's world-position source:

Add, right after `const obstacles: Obstacle[] = [];`:

```typescript
  // Nudge near-coincident symbols apart for display only (data unchanged). Both
  // the symbols and the action paths below anchor on these display positions.
  const SYMBOL_SEPARATION_MARGIN = 0.15;
  const rawPositions = new Map<string, THREE.Vector3>();
  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const coord = startState.positions[ref];
    if (coord) rawPositions.set(ref, transformer.resolveToWorld(coord));
  }
  const displayPositions = separateOverlappingSymbols(
    rawPositions,
    OFFENSE_SYMBOL_RADIUS_M,
    SYMBOL_SEPARATION_MARGIN,
  );
```

Change the entity loop to read `displayPositions`:

```typescript
  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const worldPos = displayPositions.get(ref);
    if (!worldPos) continue;
    // ...unchanged: switch on entity.type to build `symbol` and set `radius`...
    symbol.position.copy(worldPos);
    entityGroup.add(symbol);
    obstacles.push({ center: worldPos, radius });
  }
```

(Remove the old `const coord = startState.positions[ref]; if (!coord) continue; const worldPos = transformer.resolveToWorld(coord);` lines — `displayPositions` already only contains resolvable refs.)

- [ ] **Step 4: Anchor action paths on display positions**

The anchors currently seed from `startState` via `entityWorldPos`. To make paths start at the nudged symbol centres, pass display positions into the resolver. Extend `resolveFrameActionAnchors` to accept an optional display-position override, OR — simpler and localized — after computing `anchored`, remap each `startOverride`/`endOverride` that coincides with a raw position to its display position.

Use the resolver-parameter approach for correctness. In `src/actions/frame-action-anchors.ts`, add an optional 5th parameter:

```typescript
export function resolveFrameActionAnchors(
  actions: Action[],
  startState: ResolvedFrameState,
  endState: ResolvedFrameState,
  transformer: CoordinateTransformer,
  displayPositions?: Map<string, THREE.Vector3>,
): AnchoredAction[] {
```

Change `cursorFor` to prefer a display position when present:

```typescript
  const cursorFor = (ref: string): THREE.Vector3 => {
    const existing = entityCursor.get(ref);
    if (existing) return existing;
    const seeded = displayPositions?.get(ref)?.clone() ?? entityWorldPos(startState, ref, transformer);
    entityCursor.set(ref, seeded);
    return seeded;
  };
```

And in `passCatchPoint`, prefer the display position for the start-position case:

```typescript
  const first = receiverActions[0];
  if (!first || BALL_REQUIRING.has(first.type)) {
    return displayPositions?.get(receiver)?.clone() ?? entityWorldPos(startState, receiver, transformer);
  }
```

(Add `displayPositions?: Map<string, THREE.Vector3>` as a parameter to `passCatchPoint` and thread it from the caller.)

Then in `compose-frame.ts`, pass `displayPositions` as the 5th arg:

```typescript
  const anchored = resolveFrameActionAnchors(
    doc.frames[frameIndex].actions ?? [],
    startState,
    endState,
    transformer,
    displayPositions,
  );
```

- [ ] **Step 5: Render conflicts in red**

In the action dispatch loop of `compose-frame.ts`, pick the colour per action and pass it to every builder. At the top of the `for (const { action, startOverride, endOverride, conflict } of anchored)` loop body (add `conflict` to the destructure), compute:

```typescript
    const actionColor = conflict ? colors.red : colors.offense_fill;
```

Replace `colors.offense_fill` with `actionColor` in: the `buildShootGlyph` call, both `buildThickLine`/`buildArrowhead` calls (move/cut), the `buildDashedLine`/`buildArrowhead` calls (pass), the `buildScreenLine` call, AND add the colour to the dribble branch:

```typescript
    } else if (action.type === "dribble") {
      actionGroup.add(buildWavyLine(adjusted, actionColor));
    }
```

- [ ] **Step 6: Run the conflict test**

Run: `npx vitest run src/scene/compose-frame.conflict.test.ts`
Expected: PASS.

- [ ] **Step 7: Regenerate scene-graph snapshots**

Arrowhead geometry (size) and possibly symbol positions changed. Regenerate and inspect:

Run: `npx vitest run src/scene/compose-frame.snapshot.test.ts -u`
Then inspect the diff (`git diff src/scene/__snapshots__/`) to confirm changes are limited to arrowhead vertex magnitudes and any de-overlapped symbol positions — no unexpected structural changes.

- [ ] **Step 8: Full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/scene/compose-frame.ts src/scene/compose-frame.conflict.test.ts src/actions/frame-action-anchors.ts src/scene/__snapshots__/compose-frame.snapshot.test.ts.snap
git commit -m "feat(renderer): display-position anchoring + red conflict highlighting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Visual regression — re-render affected fixtures

**Files:** none (uses `scripts/shoot-fixture.mjs`). `screenshots/` is gitignored — no commit.

- [ ] **Step 1: Rebuild**

Run: `npm run build`
Expected: `build ok`.

- [ ] **Step 2: Render 3-man-weave all four frames + overlap/transition**

```bash
for i in 0 1 2 3; do node scripts/shoot-fixture.mjs 3-man-weave $i screenshots/verify-weave-$i.png; done
node scripts/shoot-fixture.mjs pick-and-roll 1 screenshots/verify-pnr-f2.png
node scripts/shoot-fixture.mjs transition-3v2 0 screenshots/verify-transition.png
```
Expected: each prints `wrote ...`.

- [ ] **Step 3: Inspect against acceptance criteria**

- 3-man-weave: no pass ends in empty space — each pass lands on the receiver (at their start, or the end of their run if they run first). Arrowheads are clearly visible. No two player symbols fully overlap.
- pick-and-roll f2: #1/#4 no longer coincident (nudged apart); dribble arcs cleanly.
- transition-3v2: paths start on the players; arrowheads read clearly.

If any render is wrong, revisit the corresponding task before finishing.

- [ ] **Step 4: Full-gallery smoke test**

```bash
for f in simple-cut simple-dribble pass-and-screen shoot full-court-two-players custom-court pick-and-roll 3-man-weave transition-3v2 continuous-ball-screen quick-mode around-player-arc source-four-frame-ball-screen ref-pick-roll-passing ref-2man-fastbreak; do
  node scripts/shoot-fixture.mjs "$f" 0 "screenshots/smoke-$f.png" 2>&1 | tail -1
done
```
Expected: every fixture prints `wrote ...` (no crash).

---

## Self-Review

**1. Spec coverage:**
- `after` topological ordering + cycle/dangling soft handling → Task 1. ✓
- Pass-target rule (3 cases: ball-first → start, no-action → start, run-first → end of last run) → Task 2. ✓
- Conflict flag + red rendering of all conflict glyphs → Task 2 (flag) + Task 5 (render). ✓
- Handover = pass variant, no special logic → covered by not special-casing it (pass path handles it). ✓
- Bigger arrowheads + scaled trim → Task 3. ✓
- De-overlap helper + display-position anchoring → Task 4 + Task 5. ✓
- Testing (9 listed) → Task 1 (4), Task 2 (4), Task 3 (1), Task 4 (3), Task 5 (1). ✓
- Visual regression → Task 6. ✓
- No schema change → confirmed, no task touches schema. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has full code. ✓

**3. Type consistency:** `orderFrameActions(actions) → { ordered, conflicts }`; `AnchoredAction` gains `conflict: boolean`; `resolveFrameActionAnchors(..., displayPositions?)`; `separateOverlappingSymbols(positions, radius, margin) → Map`; `ARROWHEAD_LENGTH_M` exported. Names consistent across tasks. `passCatchPoint` and `lastDestination` are internal helpers in the same file. ✓

**Note for the implementer:** branch `feat/local-preview-and-fixtures`. The `endState` parameter of `resolveFrameActionAnchors` becomes unused after Task 2 but stays in the signature (callers pass it; no `noUnusedParameters`). If a future cleanup removes it, update all call sites together.
