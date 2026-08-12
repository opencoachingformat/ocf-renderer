# OCF Schema v1 Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the vendored OCF types, parser, scene composer, and all fixtures from the drifted ad-hoc shape to the real upstream OCF v1 schema (`meta`, derived entity refs, multi-ball, flat frame-state maps, new action fields) with **zero visual diff**.

**Architecture:** Data-shape migration, not a rendering change. `src/types/ocf.ts` is rewritten to the schema shape (spec: `docs/superpowers/specs/2026-07-21-ocf-schema-v1-sync-design.md` §4). `resolveFrameState` becomes a cumulative flat-map merger seeded from entity initial positions + `doc.balls`. `composeFrame` iterates `doc.entities` with `entityRef()` lookups and draws every non-dead ball. New action types (`defend`/`rebound`/`pickup`) and `station` entities are parsed but not drawn.

**Tech Stack:** TypeScript, Three.js, vitest (jsdom), Playwright visual regression.

**Working directory:** the existing worktree `.openclaude/worktrees/ocf-renderer-threejs-foundation` (branch `worktree-ocf-renderer-threejs-foundation`).

**Compilation note:** Tasks 1–4 are a cross-cutting type migration; `tsc --noEmit` over the whole repo will be red until Task 5 completes. Per task, run only the named test files. Full-suite green is the Task 6 gate.

**Locked design decisions** (from the approved spec + these resolutions):
- `resolveFrameState` returns a **fully resolved** state: seeded with every entity's own `x`/`y` (initial position) and `doc.balls`, then start/end maps of frames 0..N merged cumulatively. Frame 0 without `start_state` is now valid (entities carry initial positions) — the old "throws" behavior is gone.
- Per-frame `rotation` no longer exists (frame-state values are `Coordinate` only). Defense rotation comes from the entity definition's `rotation` field.
- Jersey display: `buildOffenseSymbol` takes `label?: string | number`; composer passes `entity.label ?? entity.nr`. Fixtures with old numbers > 9 keep them as `label` (schema `nr` is 1–9) → zero visual diff.
- Handedness: schema entities have no `tags`, so the carried-ball offset is always right-handed now (the only caller of `left_handed` data; no fixture used it).
- `station` entities: parsed, **not drawn** (skip in composer switch) — same "acknowledged, not built" pattern as `defend`/`rebound`/`pickup`.
- `MoveStep.to` omitted for every step of a move/cut/dribble ⇒ no path drawn (returns `null`).
- `screen` without `at` ⇒ screen line ends at `for_player`'s resolved position.
- Dead balls are not drawn.

---

### Task 1: Rewrite vendored types (`src/types/ocf.ts`) + `entityRef`

**Files:**
- Modify: `src/types/ocf.ts` (full rewrite)
- Modify: `src/types/ocf.test.ts` (full rewrite)

- [ ] **Step 1: Write the failing tests** — replace `src/types/ocf.test.ts` entirely:

```typescript
import { describe, it, expect } from "vitest";
import { entityRef, type OcfDocument } from "./ocf";

describe("OcfDocument shape", () => {
  it("accepts a minimal valid v1 document literal", () => {
    const doc: OcfDocument = {
      version: "1.0",
      meta: { id: "doc-1", title: "Minimal" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [
        {
          id: "f1",
          actions: [
            { type: "move", player: "offense_1", moves: [{ to: { named: "basket" } }], intensity: "fast" },
            { type: "pass", player: "offense_1", to_player: "offense_1", variant: "hand_off" },
            { type: "screen", player: "offense_1", for_player: "offense_1" },
            { type: "defend", player: "offense_1", guards_player: "offense_1", variant: "on_ball" },
            { type: "rebound", player: "offense_1", variant: "defensive" },
            { type: "pickup", player: "offense_1", ball_id: "ball_1" },
          ],
          end_state: { offense_1: { x: 1, y: 6 }, balls: { ball_1: { dead: true } } },
        },
      ],
    };
    expect(doc.meta.title).toBe("Minimal");
    expect(doc.frames[0].actions[0].type).toBe("move");
  });
});

describe("entityRef", () => {
  it("derives type_nr for offense/defense", () => {
    expect(entityRef({ type: "offense", nr: 3, x: 0, y: 0 })).toBe("offense_3");
    expect(entityRef({ type: "defense", nr: 1, x: 0, y: 0 })).toBe("defense_1");
  });
  it("derives bare 'coach' for the coach singleton", () => {
    expect(entityRef({ type: "coach", x: 0, y: 0 })).toBe("coach");
  });
  it("derives type_nr for cone and station", () => {
    expect(entityRef({ type: "cone", nr: 2, x: 0, y: 0 })).toBe("cone_2");
    expect(entityRef({ type: "station", nr: 4, x: 0, y: 0 })).toBe("station_4");
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx vitest run src/types/ocf.test.ts`
Expected: FAIL (`entityRef` not exported; type errors).

- [ ] **Step 3: Rewrite `src/types/ocf.ts`** — replace the file with exactly the code from spec §4 (`docs/superpowers/specs/2026-07-21-ocf-schema-v1-sync-design.md`, code block in section "4. New vendored types"). Copy it verbatim: `Ruleset`/`CourtType`/`Unit`/`CustomDimensions`/`Court` (unchanged), plus `Meta`, coordinate types (unchanged), `ColorRole`, the five entity interfaces + `Entity` union, the `entityRef()` function, `BallState`/`Ball`, `FrameState` (flat map with `balls` key), intensity/physicality/variant enums, `MoveStep`, `ActionCommon` + the 9-member `Action` union, `Frame` (with required `actions` and `end_state`, optional `duration_ms`/`branches`), `ColorScheme` (unchanged), `OcfDocument` (with `meta` and `balls?`).

The old `Handedness`, `EntityState`, and old `Entity`/`FrameState`/`Action`/`Frame` shapes are deleted entirely.

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run src/types/ocf.test.ts`
Expected: PASS (other files now have type errors — expected until Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/types/ocf.ts src/types/ocf.test.ts
git commit -m "feat!: sync vendored OCF types to upstream v1 schema"
```

---

### Task 2: Rewrite `resolveFrameState` as seeded flat-map merger

**Files:**
- Modify: `src/parser/resolve-frame-state.ts` (full rewrite)
- Modify: `src/parser/resolve-frame-state.test.ts` (full rewrite)

- [ ] **Step 1: Write the failing tests** — replace `src/parser/resolve-frame-state.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveFrameState } from "./resolve-frame-state";
import type { OcfDocument } from "../types/ocf";

const baseDoc = (frames: OcfDocument["frames"], balls?: OcfDocument["balls"]): OcfDocument => ({
  version: "1.0",
  meta: { id: "t", title: "test" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: 0, y: 3 },
    { type: "defense", nr: 1, x: 1, y: 4 },
  ],
  balls,
  frames,
});

describe("resolveFrameState", () => {
  it("seeds start of frame 0 from entity initial positions when start_state is absent", () => {
    const doc = baseDoc([{ id: "f1", actions: [], end_state: {} }]);
    const state = resolveFrameState(doc, 0, "start");
    expect(state.positions["offense_1"]).toEqual({ x: 0, y: 3 });
    expect(state.positions["defense_1"]).toEqual({ x: 1, y: 4 });
  });

  it("frame start_state overrides only the entities it names", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { offense_1: { x: 5, y: 5 } }, actions: [], end_state: {} },
    ]);
    const state = resolveFrameState(doc, 0, "start");
    expect(state.positions["offense_1"]).toEqual({ x: 5, y: 5 });
    expect(state.positions["defense_1"]).toEqual({ x: 1, y: 4 }); // untouched seed
  });

  it("chains: frame 1 start inherits frame 0 end_state merges", () => {
    const doc = baseDoc([
      { id: "f1", actions: [], end_state: { offense_1: { x: 7, y: 7 } } },
      { id: "f2", actions: [], end_state: {} },
    ]);
    const state = resolveFrameState(doc, 1, "start");
    expect(state.positions["offense_1"]).toEqual({ x: 7, y: 7 });
    expect(state.positions["defense_1"]).toEqual({ x: 1, y: 4 });
  });

  it("end resolves start merged with the frame's own end_state", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { offense_1: { x: 5, y: 5 } }, actions: [], end_state: { offense_1: { x: 9, y: 9 } } },
    ]);
    expect(resolveFrameState(doc, 0, "end").positions["offense_1"]).toEqual({ x: 9, y: 9 });
    expect(resolveFrameState(doc, 0, "start").positions["offense_1"]).toEqual({ x: 5, y: 5 });
  });

  it("seeds balls from doc.balls and merges frame-state ball overrides", () => {
    const doc = baseDoc(
      [
        { id: "f1", actions: [], end_state: { balls: { ball_1: { at: { x: 2, y: 2 } } } } },
        { id: "f2", actions: [], end_state: { balls: { ball_2: { dead: true } } } },
      ],
      [
        { id: "ball_1", carried_by: "offense_1" },
        { id: "ball_2", at: { x: 0, y: 0 } },
      ],
    );
    expect(resolveFrameState(doc, 0, "start").balls).toEqual({
      ball_1: { carried_by: "offense_1" },
      ball_2: { at: { x: 0, y: 0 } },
    });
    expect(resolveFrameState(doc, 1, "end").balls).toEqual({
      ball_1: { at: { x: 2, y: 2 } },
      ball_2: { dead: true },
    });
  });

  it("throws for an out-of-range frame index", () => {
    const doc = baseDoc([{ id: "f1", actions: [], end_state: {} }]);
    expect(() => resolveFrameState(doc, 5, "start")).toThrow(/out of range/);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx vitest run src/parser/resolve-frame-state.test.ts`
Expected: FAIL (old implementation returns old shape).

- [ ] **Step 3: Rewrite `src/parser/resolve-frame-state.ts`:**

```typescript
import { entityRef, type Ball, type BallState, type Coordinate, type FrameState, type OcfDocument } from "../types/ocf";

/** Fully resolved state: every entity ref -> Coordinate, every ball id -> BallState. */
export interface ResolvedFrameState {
  positions: Record<string, Coordinate>;
  balls: Record<string, BallState>;
}

function ballStateOf(ball: Ball): BallState {
  if (ball.carried_by !== undefined) return { carried_by: ball.carried_by };
  if (ball.at !== undefined) return { at: ball.at };
  return { dead: true };
}

function applyState(acc: ResolvedFrameState, state: FrameState | undefined): void {
  if (!state) return;
  for (const [key, value] of Object.entries(state)) {
    if (key === "balls" || value === undefined) continue;
    acc.positions[key] = value as Coordinate;
  }
  if (state.balls) Object.assign(acc.balls, state.balls);
}

export function resolveFrameState(
  doc: OcfDocument,
  frameIndex: number,
  which: "start" | "end",
): ResolvedFrameState {
  if (!doc.frames[frameIndex]) {
    throw new Error(`resolveFrameState: frame index ${frameIndex} out of range`);
  }

  const acc: ResolvedFrameState = { positions: {}, balls: {} };
  for (const entity of doc.entities) {
    acc.positions[entityRef(entity)] = { x: entity.x, y: entity.y };
  }
  for (const ball of doc.balls ?? []) {
    acc.balls[ball.id] = ballStateOf(ball);
  }

  for (let i = 0; i <= frameIndex; i++) {
    applyState(acc, doc.frames[i].start_state);
    if (i < frameIndex || which === "end") applyState(acc, doc.frames[i].end_state);
  }
  return acc;
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run src/parser/resolve-frame-state.test.ts src/types/ocf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser/resolve-frame-state.ts src/parser/resolve-frame-state.test.ts
git commit -m "feat!: resolveFrameState merges flat v1 state maps seeded from entities and balls"
```

---

### Task 3: Update `resolveActionPath` / `entityWorldPos` for v1 actions

**Files:**
- Modify: `src/actions/resolve-action-path.ts` (full rewrite)
- Modify: `src/actions/resolve-action-path.test.ts` (full rewrite)

- [ ] **Step 1: Write the failing tests** — replace `src/actions/resolve-action-path.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { entityWorldPos, resolveActionPath } from "./resolve-action-path";

const transformer = new CoordinateTransformer({ ruleset: "fiba", type: "half_court" });

const startState: ResolvedFrameState = {
  positions: {
    offense_1: { x: 0, y: 0 },
    offense_2: { x: 3, y: 3 },
  },
  balls: {},
};

describe("entityWorldPos", () => {
  it("resolves the world position of a known entity ref", () => {
    const expected = transformer.resolveToWorld({ x: 0, y: 0 });
    expect(entityWorldPos(startState, "offense_1", transformer).equals(expected)).toBe(true);
  });

  it("throws a descriptive error for an unknown ref", () => {
    expect(() => entityWorldPos(startState, "ghost", transformer)).toThrow(/ghost/);
  });
});

describe("resolveActionPath", () => {
  it("chains through multiple `moves` for move/cut/dribble", () => {
    const action: Action = {
      type: "cut",
      player: "offense_1",
      moves: [{ to: { x: 1, y: 1 } }, { to: { x: 2, y: 2 } }],
    };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(3);
    expect(path[2].equals(transformer.resolveToWorld({ x: 2, y: 2 }))).toBe(true);
  });

  it("skips move steps without `to`, and returns null when no step has `to` (move on the spot)", () => {
    const withGap: Action = {
      type: "move",
      player: "offense_1",
      moves: [{ variant: "v_cut" }, { to: { x: 1, y: 1 } }],
    };
    expect(resolveActionPath(withGap, startState, transformer)).toHaveLength(2);
    const onTheSpot: Action = { type: "move", player: "offense_1", moves: [{}] };
    expect(resolveActionPath(onTheSpot, startState, transformer)).toBeNull();
  });

  it("resolves player -> to_player for pass (hand_off is now a pass variant)", () => {
    const action: Action = { type: "pass", player: "offense_1", to_player: "offense_2", variant: "hand_off" };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
    expect(path[1].equals(transformer.resolveToWorld({ x: 3, y: 3 }))).toBe(true);
  });

  it("resolves an explicit `at` for screen", () => {
    const action: Action = { type: "screen", player: "offense_1", for_player: "offense_2", at: { x: 5, y: 5 } };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path[1].equals(transformer.resolveToWorld({ x: 5, y: 5 }))).toBe(true);
  });

  it("falls back to for_player's position when screen has no `at`", () => {
    const action: Action = { type: "screen", player: "offense_1", for_player: "offense_2" };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path[1].equals(transformer.resolveToWorld({ x: 3, y: 3 }))).toBe(true);
  });

  it("returns null for shoot, defend, rebound, and pickup (no drawn path)", () => {
    const actions: Action[] = [
      { type: "shoot", player: "offense_1" },
      { type: "defend", player: "offense_1", guards_player: "offense_2" },
      { type: "rebound", player: "offense_1" },
      { type: "pickup", player: "offense_1", ball_id: "ball_1" },
    ];
    for (const action of actions) {
      expect(resolveActionPath(action, startState, transformer)).toBeNull();
    }
  });

  it("throws when player is missing from the resolved state", () => {
    const action: Action = { type: "move", player: "ghost", moves: [{ to: { x: 1, y: 1 } }] };
    expect(() => resolveActionPath(action, startState, transformer)).toThrow(/ghost/);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `src/actions/resolve-action-path.ts`:**

```typescript
import * as THREE from "three";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";

export function entityWorldPos(
  state: ResolvedFrameState,
  ref: string,
  transformer: CoordinateTransformer,
): THREE.Vector3 {
  const coord = state.positions[ref];
  if (!coord) {
    throw new Error(`entityWorldPos: no resolved position for entity ref "${ref}" in frame state`);
  }
  return transformer.resolveToWorld(coord);
}

/** Returns null for actions with no drawn path (shoot/defend/rebound/pickup, or moves without `to`). */
export function resolveActionPath(
  action: Action,
  startState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): THREE.Vector3[] | null {
  switch (action.type) {
    case "move":
    case "cut":
    case "dribble": {
      const start = entityWorldPos(startState, action.player, transformer);
      const rest = action.moves
        .filter((m) => m.to !== undefined)
        .map((m) => transformer.resolveToWorld(m.to!));
      if (rest.length === 0) return null; // move on the spot
      return [start, ...rest];
    }
    case "pass": {
      const start = entityWorldPos(startState, action.player, transformer);
      const end = entityWorldPos(startState, action.to_player, transformer);
      return [start, end];
    }
    case "screen": {
      const start = entityWorldPos(startState, action.player, transformer);
      const end = action.at
        ? transformer.resolveToWorld(action.at)
        : entityWorldPos(startState, action.for_player, transformer);
      return [start, end];
    }
    case "shoot":
    case "defend":
    case "rebound":
    case "pickup":
      return null;
    default: {
      const exhaustive: never = action;
      throw new Error(`resolveActionPath: unhandled action type ${JSON.stringify(exhaustive)}`);
    }
  }
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/resolve-action-path.ts src/actions/resolve-action-path.test.ts
git commit -m "feat!: resolveActionPath handles v1 player fields, screen fallback, no-path actions"
```

---

### Task 4: Rewrite `composeFrame` (entity iteration, multi-ball) + offense label

**Files:**
- Modify: `src/entities/offense-symbol.ts:5-24` (`number` param → `label`)
- Modify: `src/scene/compose-frame.ts` (entity/ball/action sections)
- Modify: `src/scene/compose-frame.test.ts` (full rewrite)

- [ ] **Step 1: Update `buildOffenseSymbol` signature** — in `src/entities/offense-symbol.ts`, change the sprite helper and builder params (rendering unchanged):

```typescript
function numberSprite(label: string | number | undefined): THREE.Sprite | null {
  if (label === undefined) return null;
  // ... body unchanged, except:
  ctx.fillText(String(label), 32, 34);
  // ...
}

export function buildOffenseSymbol(color: string, label?: string | number): THREE.Group {
  // body unchanged except: const sprite = numberSprite(label);
}
```

In `src/entities/offense-symbol.test.ts`, if any test passes a number, it stays valid (`string | number`); no test changes required unless a param name is asserted.

- [ ] **Step 2: Write the failing tests** — replace `src/scene/compose-frame.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { composeFrame } from "./compose-frame";

function baseDoc(overrides: Partial<OcfDocument["frames"][0]> & Partial<Pick<OcfDocument, "balls">> = {}): OcfDocument {
  const { balls, ...frameOverrides } = overrides;
  return {
    version: "1.0",
    meta: { id: "t", title: "compose test" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [
      { type: "offense", nr: 4, x: 0, y: 5 },
      { type: "defense", nr: 1, x: 1, y: 6, rotation: 90 },
    ],
    balls: balls ?? [{ id: "ball_1", carried_by: "offense_4" }],
    frames: [
      { id: "f1", actions: [], end_state: {}, ...frameOverrides },
    ],
  };
}

describe("composeFrame", () => {
  it("builds 2 entity symbols, a carried ball offset off the carrier, and a move-path + arrowhead", () => {
    const doc = baseDoc({
      actions: [{ type: "move", player: "offense_4", moves: [{ to: { x: 2, y: 7 } }] }],
    });
    const scene = composeFrame(doc, 0);

    const entities = scene.getObjectByName("entities")!;
    expect(entities.children).toHaveLength(2);

    const balls = scene.getObjectByName("balls")!;
    expect(balls.children).toHaveLength(1);
    const carrierSymbol = entities.children[0];
    expect(balls.children[0].position.equals(carrierSymbol.position)).toBe(false); // offset applied

    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("move-path")).toBeInstanceOf(THREE.Line);
    expect(actions.getObjectByName("arrowhead")).toBeInstanceOf(THREE.Mesh);
  });

  it("renders multiple balls and skips dead ones", () => {
    const doc = baseDoc({
      balls: [
        { id: "ball_1", carried_by: "offense_4" },
        { id: "ball_2", at: { x: 3, y: 3 } },
        { id: "ball_3", dead: true },
      ],
    });
    const scene = composeFrame(doc, 0);
    const balls = scene.getObjectByName("balls")!;
    expect(balls.children).toHaveLength(2); // dead ball not drawn
  });

  it("skips defend/rebound/pickup actions and station entities without drawing or throwing", () => {
    const doc = baseDoc({
      actions: [
        { type: "defend", player: "defense_1", guards_player: "offense_4" },
        { type: "rebound", player: "offense_4" },
        { type: "pickup", player: "offense_4", ball_id: "ball_1" },
      ],
    });
    doc.entities.push({ type: "station", nr: 1, x: 5, y: 5, label: "S1" });
    const scene = composeFrame(doc, 0);
    expect(scene.getObjectByName("entities")!.children).toHaveLength(2); // station not drawn
    expect(scene.getObjectByName("actions")!.children).toHaveLength(0);
  });

  it("builds a shoot-glyph with no path line for a shoot action", () => {
    const doc = baseDoc({ actions: [{ type: "shoot", player: "offense_4" }] });
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("shoot-glyph")).toBeInstanceOf(THREE.Group);
    // three.js's getObjectByName returns undefined (never null) when no match is found.
    expect(actions.getObjectByName("move-path")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests, verify FAIL**

Run: `npx vitest run src/scene/compose-frame.test.ts`
Expected: FAIL.

- [ ] **Step 4: Rewrite the entity/ball/action sections of `src/scene/compose-frame.ts`** — imports gain `entityRef` from `../types/ocf` and `type ResolvedFrameState` usage stays internal; body becomes:

```typescript
  const startState = resolveFrameState(doc, frameIndex, "start");
  const entityGroup = new THREE.Group();
  entityGroup.name = "entities";
  scene.add(entityGroup);

  const obstacles: Obstacle[] = [];

  for (const entity of doc.entities) {
    const ref = entityRef(entity);
    const coord = startState.positions[ref];
    if (!coord) continue;
    const worldPos = transformer.resolveToWorld(coord);

    let symbol: THREE.Group;
    let radius = OFFENSE_SYMBOL_RADIUS_M;
    switch (entity.type) {
      case "offense":
        symbol = buildOffenseSymbol(colors.offense, entity.label ?? entity.nr);
        break;
      case "defense":
        symbol = buildDefenseSymbol(colors.defense);
        applyDefenseRotation(symbol, entity.rotation ?? 0);
        radius = DEFENSE_SYMBOL_HEIGHT_M / 2;
        break;
      case "coach":
        symbol = buildCoachSymbol(colors.offense);
        break;
      case "cone":
        symbol = buildConeSymbol(colors.court_accent);
        break;
      case "station":
        continue; // acknowledged, not built — no station glyph yet
    }
    symbol.position.copy(worldPos);
    entityGroup.add(symbol);
    obstacles.push({ center: worldPos, radius });
  }

  const ballGroup = new THREE.Group();
  ballGroup.name = "balls";
  scene.add(ballGroup);
  for (const [ballId, ballState] of Object.entries(startState.balls)) {
    if ("dead" in ballState) continue; // dead balls are not drawn
    const ball = buildBallSymbol(colors.ball);
    ball.name = ballId;
    if ("carried_by" in ballState) {
      const carrierCoord = startState.positions[ballState.carried_by];
      const carrierWorldPos = carrierCoord ? transformer.resolveToWorld(carrierCoord) : new THREE.Vector3();
      // v1 simplification: always offset "forward" toward -Z (frontcourt); schema
      // entities carry no handedness data, so the offset is always right-handed.
      const forward = new THREE.Vector3(0, 0, -1);
      ball.position.copy(carriedBallOffset(carrierWorldPos, forward, false));
    } else {
      ball.position.copy(transformer.resolveToWorld(ballState.at));
    }
    ballGroup.add(ball);
  }
```

The action loop keeps its structure, with these changes:
- `if (action.type === "shoot") { const shooterPos = entityWorldPos(startState, action.player, transformer); ... }` (was `action.entity_ref`)
- new early-skip before path resolution: `if (action.type === "defend" || action.type === "rebound" || action.type === "pickup") continue;` (resolveActionPath would return null anyway; the explicit skip documents intent)
- `else if (action.type === "pass")` replaces `action.type === "pass" || action.type === "hand_off"` (same dashed line; `variant: "hand_off"` renders identically for now)
- everything else (smoothing, collision avoidance, trim, arrowheads, wavy/dashed/screen builders) unchanged.

Also delete the now-unused `symbolsByRef` map (its only writer was the old loop; verify with grep that nothing reads it — nothing does today).

- [ ] **Step 5: Run tests, verify PASS**

Run: `npx vitest run src/scene/compose-frame.test.ts src/actions/resolve-action-path.test.ts src/parser/resolve-frame-state.test.ts src/entities/offense-symbol.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene/compose-frame.ts src/scene/compose-frame.test.ts src/entities/offense-symbol.ts
git commit -m "feat!: composeFrame renders v1 documents (entityRef lookups, multi-ball, skip lists)"
```

---

### Task 5: Migrate all fixtures + remaining tests to v1 shape

**Files:**
- Modify: all 7 `src/__fixtures__/*.json` (full rewrites below)
- Modify: `src/view-modes/view-mode-controller.test.ts:5-12` (doc literal)
- Modify: `src/render.test.ts:6-13` (doc literal)
- Unchanged: `src/__fixtures__/fixtures.test.ts` (logic identical; still type-checks)

**Migration rules applied below:** same coordinates everywhere; `meta` added; entity ids `o1/o2/o3/d1/d2` → `offense_1/offense_2/offense_3/defense_1/defense_2`; frame-0 `start_state` positions move onto the entities themselves (`x`/`y`), so `start_state` disappears; per-frame `rotation` moves to the entity definition; jersey numbers 1–9 → `nr`, >9 → `nr` sequential + `label`; `ball` → top-level `balls` array; `actions` and `end_state` (possibly `{}`) added to every frame.

- [ ] **Step 1: Rewrite each fixture:**

`src/__fixtures__/simple-cut.json`:
```json
{
  "version": "1.0",
  "meta": { "id": "simple-cut", "title": "Simple Cut" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [
    { "type": "offense", "nr": 4, "x": 1, "y": 4 },
    { "type": "defense", "nr": 1, "x": 1.5, "y": 5, "rotation": 180 }
  ],
  "balls": [{ "id": "ball_1", "carried_by": "offense_4" }],
  "frames": [
    {
      "id": "f1",
      "actions": [
        { "type": "cut", "player": "offense_4", "moves": [{ "to": { "x": -2, "y": 6 } }] }
      ],
      "end_state": { "offense_4": { "x": -2, "y": 6 } }
    }
  ]
}
```

`src/__fixtures__/simple-dribble.json`:
```json
{
  "version": "1.0",
  "meta": { "id": "simple-dribble", "title": "Simple Dribble" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [{ "type": "offense", "nr": 1, "x": 0, "y": 3 }],
  "balls": [{ "id": "ball_1", "carried_by": "offense_1" }],
  "frames": [
    {
      "id": "f1",
      "actions": [
        { "type": "dribble", "player": "offense_1", "moves": [{ "to": { "x": 3, "y": 6 } }] }
      ],
      "end_state": { "offense_1": { "x": 3, "y": 6 } }
    }
  ]
}
```

`src/__fixtures__/pass-and-screen.json` (screen's new required `for_player`: the screen is set for the pass receiver `offense_2`; explicit `at` kept, so rendering is unchanged):
```json
{
  "version": "1.0",
  "meta": { "id": "pass-and-screen", "title": "Pass and Screen" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [
    { "type": "offense", "nr": 1, "x": -3, "y": 4 },
    { "type": "offense", "nr": 2, "x": 3, "y": 4 },
    { "type": "offense", "nr": 3, "x": 1, "y": 3 },
    { "type": "defense", "nr": 1, "x": 0, "y": 5, "rotation": 90 }
  ],
  "balls": [{ "id": "ball_1", "carried_by": "offense_1" }],
  "frames": [
    {
      "id": "f1",
      "actions": [
        { "type": "pass", "player": "offense_1", "to_player": "offense_2" },
        { "type": "screen", "player": "offense_3", "for_player": "offense_2", "at": { "x": 1.5, "y": 5.5 } }
      ],
      "end_state": {
        "offense_3": { "x": 1.5, "y": 5.5 },
        "balls": { "ball_1": { "carried_by": "offense_2" } }
      }
    }
  ]
}
```

`src/__fixtures__/shoot.json` (jersey 23 becomes a label; `nr` must be 1–9):
```json
{
  "version": "1.0",
  "meta": { "id": "shoot", "title": "Shoot" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [
    { "type": "offense", "nr": 1, "label": "23", "x": 0, "y": 9 },
    { "type": "defense", "nr": 1, "x": 0.5, "y": 9.5, "rotation": 0 }
  ],
  "balls": [{ "id": "ball_1", "carried_by": "offense_1" }],
  "frames": [
    {
      "id": "f1",
      "actions": [{ "type": "shoot", "player": "offense_1", "variant": "jumper" }],
      "end_state": {}
    }
  ]
}
```

`src/__fixtures__/full-court-two-players.json` (jerseys 10/11 → labels):
```json
{
  "version": "1.0",
  "meta": { "id": "full-court-two-players", "title": "Full Court, Two Players" },
  "court": { "ruleset": "fiba", "type": "full_court" },
  "entities": [
    { "type": "offense", "nr": 1, "label": "10", "x": 0, "y": -10 },
    { "type": "offense", "nr": 2, "label": "11", "x": 2, "y": 8 }
  ],
  "balls": [{ "id": "ball_1", "carried_by": "offense_1" }],
  "frames": [
    {
      "id": "f1",
      "actions": [
        { "type": "move", "player": "offense_1", "moves": [{ "to": { "x": 0, "y": 10 } }] }
      ],
      "end_state": { "offense_1": { "x": 0, "y": 10 } }
    }
  ]
}
```

`src/__fixtures__/custom-court.json`:
```json
{
  "version": "1.0",
  "meta": { "id": "custom-court", "title": "Custom Court" },
  "court": {
    "ruleset": "custom",
    "type": "half_court",
    "custom_dimensions": {
      "length": 26,
      "width": 14,
      "basket_from_baseline": 1.2,
      "three_point_distance": 6.6,
      "paint_width": 4.9,
      "paint_depth": 5.8,
      "free_throw_distance": 5.8
    }
  },
  "entities": [{ "type": "offense", "nr": 5, "x": 0, "y": 4 }],
  "balls": [{ "id": "ball_1", "carried_by": "offense_5" }],
  "frames": [{ "id": "f1", "actions": [], "end_state": {} }]
}
```

`src/__fixtures__/pick-and-roll.json` (per-frame defender rotations were all `0` → entity-level `rotation: 0`; no information lost):
```json
{
  "version": "1.0",
  "meta": { "id": "pick-and-roll", "title": "Pick and Roll" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [
    { "type": "offense", "nr": 1, "x": -4, "y": 7 },
    { "type": "offense", "nr": 5, "x": -1, "y": 8.5 },
    { "type": "defense", "nr": 1, "x": -4, "y": 7.8, "rotation": 0 },
    { "type": "defense", "nr": 2, "x": -1, "y": 9.3, "rotation": 0 }
  ],
  "balls": [{ "id": "ball_1", "carried_by": "offense_1" }],
  "frames": [
    {
      "id": "f1",
      "actions": [
        { "type": "screen", "player": "offense_5", "for_player": "offense_1", "at": { "x": -2, "y": 7.5 }, "variant": "ball_screen" },
        { "type": "dribble", "player": "offense_1", "moves": [{ "to": { "x": -1, "y": 8 } }, { "to": { "x": 0, "y": 8 } }] }
      ],
      "end_state": {
        "offense_1": { "x": 0, "y": 8 },
        "offense_5": { "x": -2, "y": 7.5 },
        "defense_1": { "x": -1.5, "y": 6.8 },
        "defense_2": { "x": -1.8, "y": 8.3 }
      }
    },
    {
      "id": "f2",
      "actions": [
        { "type": "cut", "player": "offense_5", "moves": [{ "to": { "x": 0.5, "y": 10 } }, { "to": { "x": 0.8, "y": 11.3 } }] },
        { "type": "dribble", "player": "offense_1", "moves": [{ "to": { "x": 1, "y": 8.3 } }] }
      ],
      "end_state": {
        "offense_1": { "x": 1, "y": 8.3 },
        "offense_5": { "x": 0.8, "y": 11.3 },
        "defense_1": { "x": 0.7, "y": 7.6 },
        "defense_2": { "x": 1.2, "y": 10.8 }
      }
    },
    {
      "id": "f3",
      "actions": [
        { "type": "pass", "player": "offense_1", "to_player": "offense_5" },
        { "type": "shoot", "player": "offense_5" }
      ],
      "end_state": { "balls": { "ball_1": { "carried_by": "offense_5" } } }
    }
  ]
}
```

- [ ] **Step 2: Update the two test doc literals.** In `src/view-modes/view-mode-controller.test.ts` and `src/render.test.ts`, replace the shared `doc` constant in both files with:

```typescript
const doc: OcfDocument = {
  version: "1.0",
  meta: { id: "t", title: "test" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
  frames: [{ id: "f1", actions: [], end_state: {} }],
};
```

(Test assertions in both files stay exactly as they are.)

- [ ] **Step 3: Full type-check and unit tests**

Run: `npx tsc --noEmit`
Expected: clean — this is the first task after which the whole repo compiles.

Run: `npx vitest run --exclude '**/*.snapshot.test.ts'` — if vitest's exclude flag fights the config, instead run all files except the snapshot test explicitly.
Expected: all PASS except possibly `compose-frame.snapshot.test.ts` (stale snapshots — handled in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/__fixtures__ src/view-modes/view-mode-controller.test.ts src/render.test.ts
git commit -m "feat!: migrate all fixtures and test docs to OCF v1 schema shape"
```

---

### Task 6: Regenerate snapshots, verify zero visual diff, full gate

**Files:**
- Regenerate: `src/scene/__snapshots__/compose-frame.snapshot.test.ts.snap`
- Regenerate: `tests/visual/tactical-print.spec.ts-snapshots/*.png`
- Check (likely no change): `examples/render-fixture.html` (fetches fixture JSON at runtime), `README.md` (update any OCF example snippets to v1 shape if present)

- [ ] **Step 1: Regenerate scene-graph snapshots**

Run: `npx vitest run src/scene/compose-frame.snapshot.test.ts -u`
Expected: snapshots rewritten (group `ball` → `balls` etc.). Skim the diff (`git diff`) — entity/action counts per fixture must match the old snapshot; only naming/structure of the ball group and ordering may differ.

- [ ] **Step 2: Full vitest suite**

Run: `npx vitest run`
Expected: ALL PASS.

- [ ] **Step 3: Playwright visual regression — the zero-diff check.** First run WITHOUT updating, to see which fixtures actually diff:

Run: `npx playwright test`
Expected: **all 9 screenshots pass unchanged** (coordinates identical). If any fail: inspect `test-results/` diff images. Acceptable diffs: none anticipated. If a diff appears, debug the migration (likely a position or rotation mis-migrated) before touching baselines. Only run `npx playwright test --update-snapshots` if a diff is confirmed to be a legitimate, explainable rendering-order artifact — and manually review the new PNG against the old via `git diff --stat` + opening both images.

- [ ] **Step 4: Check README + examples.** `grep -n 'entity_ref\|"id":\|hand_off\|start_state' README.md examples/*.html`. Update any inline OCF JSON examples in `README.md` to the new shape (same migration rules as Task 5). `examples/render-fixture.html` fetches fixture files at runtime — no change needed unless it hardcodes old field names.

- [ ] **Step 5: Build gate**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A src tests README.md examples
git commit -m "test: regenerate snapshots for v1 schema; verify zero visual diff"
```

---

## Post-plan

After all tasks: final code review of the whole migration, then this unblocks the `coaching_animation` brainstorm (paused; resumes next — `intensity` fields now exist in the type system).
