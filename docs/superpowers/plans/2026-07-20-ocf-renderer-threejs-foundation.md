# OCF Renderer — Three.js Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Go from an empty `src/` to a working `OCFRenderer` that takes an OCF document + frame index and produces a still Three.js-rendered scene (FIBA half/full court, entities, action paths) matching the agreed visual language.

**Architecture:** A pure-geometry pipeline (`OCFParser` → `CoordinateTransformer` → entity/action symbol builders → scene composer) feeds a thin `ViewModeController` that dispatches to the `tactical_print` `VisualPresenter`; `coaching_animation` is a defined-but-unimplemented mode per the design doc. Multi-frame composite, animation, and non-FIBA rulesets are out of scope for this plan (extension points only, no implementation).

**Tech Stack:** TypeScript, `three` (Three.js), `vitest` (unit/scene-graph snapshot tests), `@playwright/test` (pixel-regression tests), `tsup` (build).

**Depends on:** `docs/superpowers/specs/2026-07-20-ocf-renderer-threejs-design.md` (architecture),
`docs/superpowers/specs/2026-06-06-ocf-renderer-design.md` (visual language),
`ocf-repo/schema/v1.json` (data shapes).

Each task below follows red/green TDD: write the test first, watch it fail for the
right reason, then implement. Tasks are ordered so each one is runnable/testable in
isolation. Commit after each task.

---

## Task 0 — Project scaffold

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`,
`.gitignore`, `src/index.ts`

- [ ] **Step 1: Write the failing check**

There's no code to test-first here (pure scaffold) — the "test" is that the build
pipeline works end to end. Create `src/index.ts` with a single throwaway export:

```ts
// src/index.ts
export const OCF_RENDERER_VERSION = "0.0.0";
```

- [ ] **Step 2: Run to verify there's nothing to build yet**

Run: `ls package.json`
Expected: FAIL — `package.json` does not exist yet.

- [ ] **Step 3: Scaffold the project**

```bash
npm init -y
npm install three
npm install -D typescript vitest @playwright/test @types/three @types/node tsup
```

`package.json` — set `"private": true` (per design doc §2, no accidental publish
until the package is genuinely ready) and add scripts:

```json
{
  "name": "ocf-renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:visual": "playwright test"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/visual",
  timeout: 30_000,
});
```

`.gitignore`:

```
node_modules
dist
test-results
playwright-report
```

- [ ] **Step 4: Run to verify the build succeeds**

Run: `npm install && npm run build`
Expected: PASS — `dist/index.js` and `dist/index.d.ts` are produced.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts playwright.config.ts .gitignore src/index.ts
git commit -m "chore: scaffold ocf-renderer package (Three.js, vitest, playwright)"
```

---

## Task 1 — OCF document types

**Files:** `src/types/ocf.ts`, `src/types/ocf.test.ts`

- [ ] **Step 1: Write the failing test**

A type-only smoke test: assign a realistic literal fixture to `OcfDocument` and
assert on a couple of resolved fields. This fails today because `../types/ocf`
doesn't exist yet.

```ts
// src/types/ocf.test.ts
import { describe, it, expect } from "vitest";
import type { OcfDocument } from "./ocf";

describe("OcfDocument shape", () => {
  it("accepts a minimal valid document literal", () => {
    const doc: OcfDocument = {
      version: "1.0",
      court: { ruleset: "fiba", type: "half_court" },
      entities: [{ id: "o1", type: "offense", number: 4 }],
      frames: [
        {
          id: "f1",
          start_state: {
            entities: [{ entity_ref: "o1", position: { x: 0, y: 0 } }],
            ball: { status: "carried", carried_by: "o1" },
          },
          actions: [{ type: "move", entity_ref: "o1", moves: [{ to: { named: "basket" } }] }],
        },
      ],
    };
    expect(doc.entities[0].id).toBe("o1");
    expect(doc.frames[0].actions?.[0].type).toBe("move");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/ocf.test.ts`
Expected: FAIL with `Cannot find module './ocf'`

- [ ] **Step 3: Write minimal implementation**

Hand-written TypeScript types mirroring the parts of `ocf-repo/schema/v1.json` the
renderer touches. Do not reimplement the full schema — only what's needed to read
frames, entities, and actions:

```ts
// src/types/ocf.ts
export type Ruleset = "fiba" | "nba" | "ncaa" | "nfhs" | "custom";
export type CourtType = "half_court" | "full_court";
export type Unit = "m" | "ft";

export interface CustomDimensions {
  length?: number;
  width?: number;
  basket_from_baseline?: number;
  three_point_distance?: number;
  paint_width?: number;
  paint_depth?: number;
  free_throw_distance?: number;
}

export interface Court {
  ruleset: Ruleset;
  type: CourtType;
  unit?: Unit;
  drill_focus?: "full" | "half";
  wheelchair?: boolean;
  custom_dimensions?: CustomDimensions;
}

export interface NamedCoordinate { named: string; }
export interface RelativeCoordinate { relative_to: string; dx: number; dy: number; }
export interface FreeCoordinate { x: number; y: number; }
export type Coordinate = NamedCoordinate | RelativeCoordinate | FreeCoordinate;

export type Handedness = "left_handed" | "right_handed";

export interface Entity {
  id: string;
  type: "offense" | "defense" | "coach" | "cone";
  number?: number;
  tags?: string[];
}

export interface EntityState {
  entity_ref: string;
  position: Coordinate;
  rotation?: number; // degrees, 0 = arms toward -y, clockwise (spec PR #5 convention)
}

export type BallState =
  | { status: "carried"; carried_by: string }
  | { status: "loose"; position: Coordinate };

export interface FrameState {
  entities: EntityState[];
  ball?: BallState;
}

export interface MoveStep { to: Coordinate; }

export type Action =
  | { type: "move" | "cut"; entity_ref: string; moves: MoveStep[] }
  | { type: "dribble"; entity_ref: string; moves: MoveStep[] }
  | { type: "pass" | "hand_off"; entity_ref: string; to_entity_ref: string }
  | { type: "screen"; entity_ref: string; at: Coordinate }
  | { type: "shoot"; entity_ref: string };

export interface Frame {
  id: string;
  start_state?: FrameState;
  end_state?: FrameState;
  actions?: Action[];
}

export interface ColorScheme {
  court_primary?: string;
  court_accent?: string;
  offense?: string;
  defense?: string;
  ball?: string;
  [key: string]: string | undefined;
}

export interface OcfDocument {
  version: string;
  court: Court;
  entities: Entity[];
  frames: Frame[];
  color_scheme?: ColorScheme;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/ocf.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/ocf.ts src/types/ocf.test.ts
git commit -m "feat: add OCF document TypeScript types (vendored, src/types/ocf.ts)"
```

---

## Task 2 — Frame-state resolver (chaining `start_state`/`end_state`)

Per spec, a frame's `start_state` defaults to the previous frame's `end_state` when
omitted. Actions themselves don't carry position data beyond their `moves`/`at`/
`to_entity_ref` — the renderer needs each entity's *resolved* position at both the
start and end of a given frame before it can draw anything.

**Files:** `src/parser/resolve-frame-state.ts`, `src/parser/resolve-frame-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/parser/resolve-frame-state.test.ts
import { describe, it, expect } from "vitest";
import { resolveFrameState } from "./resolve-frame-state";
import type { OcfDocument } from "../types/ocf";

const baseDoc = (frames: OcfDocument["frames"]): OcfDocument => ({
  version: "1.0",
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ id: "o1", type: "offense", number: 4 }],
  frames,
});

describe("resolveFrameState", () => {
  it("uses frame 0's own start_state when present", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { entities: [{ entity_ref: "o1", position: { x: 1, y: 2 } }] } },
    ]);
    const state = resolveFrameState(doc, 0, "start");
    expect(state.entities[0].position).toEqual({ x: 1, y: 2 });
  });

  it("falls back to the previous frame's end_state when start_state is omitted", () => {
    const doc = baseDoc([
      { id: "f1", end_state: { entities: [{ entity_ref: "o1", position: { x: 3, y: 4 } }] } },
      { id: "f2", end_state: { entities: [{ entity_ref: "o1", position: { x: 5, y: 6 } }] } },
    ]);
    const state = resolveFrameState(doc, 1, "start");
    expect(state.entities[0].position).toEqual({ x: 3, y: 4 });
  });

  it("throws a descriptive error when frame 0 has no start_state and none can be inherited", () => {
    const doc = baseDoc([{ id: "f1", actions: [] }]);
    expect(() => resolveFrameState(doc, 0, "start")).toThrow(/start_state/);
  });

  it("resolves end_state, defaulting to start_state if end_state is omitted (static frame)", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { entities: [{ entity_ref: "o1", position: { x: 1, y: 1 } }] } },
    ]);
    const state = resolveFrameState(doc, 0, "end");
    expect(state.entities[0].position).toEqual({ x: 1, y: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/resolve-frame-state.test.ts`
Expected: FAIL with `Cannot find module './resolve-frame-state'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/parser/resolve-frame-state.ts
import type { OcfDocument, FrameState } from "../types/ocf";

export function resolveFrameState(
  doc: OcfDocument,
  frameIndex: number,
  which: "start" | "end",
): FrameState {
  const frame = doc.frames[frameIndex];
  if (!frame) {
    throw new Error(`resolveFrameState: frame index ${frameIndex} out of range`);
  }

  if (which === "end") {
    return frame.end_state ?? resolveFrameState(doc, frameIndex, "start");
  }

  if (frame.start_state) return frame.start_state;

  if (frameIndex === 0) {
    throw new Error(
      `resolveFrameState: frame "${frame.id}" (index 0) has no start_state and there is ` +
        `no previous frame to inherit an end_state from.`,
    );
  }

  const prevEnd = doc.frames[frameIndex - 1]?.end_state;
  if (prevEnd) return prevEnd;

  throw new Error(
    `resolveFrameState: frame "${frame.id}" has no start_state, and the previous frame ` +
      `("${doc.frames[frameIndex - 1]?.id}") has no end_state to inherit from.`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/resolve-frame-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/resolve-frame-state.ts src/parser/resolve-frame-state.test.ts
git commit -m "feat: resolve frame start/end state with start_state/end_state chaining"
```

---

## Task 3 — FIBA court constants + named-position table

The schema's `custom_dimensions` field names (`length`, `width`,
`basket_from_baseline`, `three_point_distance`, `paint_width`, `paint_depth`,
`free_throw_distance`) double as the canonical constant names — reuse them so a
custom court can override any subset. Two constants aren't in the schema
(restricted-area radius, center-circle radius) because FIBA doesn't allow them to
vary; hardcode those.

Origin: court center. `+x` = right, `+y` = frontcourt (offense basket side), for a
`half_court` document. `full_court` uses the same origin with defense basket at
`-y`.

Named positions are not enumerated in the schema (spec leaves court-style specifics
to the renderer) — this table is a renderer-owned default for FIBA, documented here
as an explicit product decision so it's easy to challenge in review.

**Files:** `src/court/fiba-constants.ts`, `src/court/named-positions.ts`,
`src/court/named-positions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/court/named-positions.test.ts
import { describe, it, expect } from "vitest";
import { fibaNamedPosition } from "./named-positions";
import { FIBA_DEFAULTS } from "./fiba-constants";

describe("fibaNamedPosition", () => {
  it("places the basket 1.575m from the baseline on the frontcourt half", () => {
    const p = fibaNamedPosition("basket", FIBA_DEFAULTS);
    expect(p.x).toBe(0);
    expect(p.y).toBeCloseTo(14 - 1.575);
  });

  it("mirrors left/right elbows across the paint centerline", () => {
    const left = fibaNamedPosition("left_elbow", FIBA_DEFAULTS);
    const right = fibaNamedPosition("right_elbow", FIBA_DEFAULTS);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.y).toBeCloseTo(right.y);
  });

  it("throws with the list of known names for an unknown name", () => {
    expect(() => fibaNamedPosition("nonexistent", FIBA_DEFAULTS)).toThrow(/Unknown named position/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/court/named-positions.test.ts`
Expected: FAIL with `Cannot find module './named-positions'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/court/fiba-constants.ts
export const FIBA_DEFAULTS = {
  length: 28,
  width: 15,
  basket_from_baseline: 1.575,
  three_point_distance: 6.75,
  paint_width: 4.9,
  paint_depth: 5.8,
  free_throw_distance: 5.8,
  restricted_area_radius: 1.25,
  center_circle_radius: 1.8,
} as const;

export type CourtDimensions = typeof FIBA_DEFAULTS;
```

```ts
// src/court/named-positions.ts
import type { CourtDimensions } from "./fiba-constants";

/**
 * Renderer-default named positions for FIBA-style courts, relative to the
 * offense basket (+y half). All positions are frontcourt; for full-court
 * documents that need a defensive-half named spot, use `relative_to` + dx/dy
 * from a frontcourt name, or free x/y coordinates.
 */
export function fibaNamedPosition(
  name: string,
  d: CourtDimensions,
): { x: number; y: number } {
  const baseline = d.length / 2;
  const basketY = baseline - d.basket_from_baseline;
  const ftLineY = baseline - d.free_throw_distance;
  const paintHalfWidth = d.paint_width / 2;

  const table: Record<string, { x: number; y: number }> = {
    half_court: { x: 0, y: 0 },
    basket: { x: 0, y: basketY },
    free_throw_line: { x: 0, y: ftLineY },
    top_of_key: { x: 0, y: ftLineY },
    left_elbow: { x: -paintHalfWidth, y: ftLineY },
    right_elbow: { x: paintHalfWidth, y: ftLineY },
    left_block: { x: -paintHalfWidth, y: baseline - 1.5 },
    right_block: { x: paintHalfWidth, y: baseline - 1.5 },
    left_baseline: { x: -d.width / 2, y: baseline },
    right_baseline: { x: d.width / 2, y: baseline },
    left_corner: { x: -d.width / 2 + 0.9, y: baseline - 0.9 },
    right_corner: { x: d.width / 2 - 0.9, y: baseline - 0.9 },
    left_wing: { x: -d.three_point_distance * 0.7, y: ftLineY + 1.5 },
    right_wing: { x: d.three_point_distance * 0.7, y: ftLineY + 1.5 },
  };

  const pos = table[name];
  if (!pos) {
    throw new Error(
      `Unknown named position "${name}". Known: ${Object.keys(table).join(", ")}`,
    );
  }
  return pos;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/court/named-positions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/court/fiba-constants.ts src/court/named-positions.ts src/court/named-positions.test.ts
git commit -m "feat: add FIBA court constants and renderer-default named positions"
```

---

## Task 4 — CoordinateTransformer

Resolves any `Coordinate` (named / relative / free) to absolute court meters, and
converts court meters (unit-aware) to Three.js world space. World-space convention
(fixed here, referenced by every later task): **world X = court x, world Z = −court
y**, so that a top-down camera at `(0, H, 0)` with `up = (0, 0, −1)` shows court `+y`
(frontcourt) toward the top of the screen and `+x` (right) toward the right of the
screen.

**Files:** `src/court/coordinate-transformer.ts`, `src/court/coordinate-transformer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/court/coordinate-transformer.test.ts
import { describe, it, expect } from "vitest";
import { CoordinateTransformer } from "./coordinate-transformer";

describe("CoordinateTransformer", () => {
  const court = { ruleset: "fiba", type: "half_court" } as const;

  it("resolves free x/y coordinates unchanged", () => {
    const t = new CoordinateTransformer(court);
    expect(t.resolve({ x: 2, y: 3 })).toEqual({ x: 2, y: 3 });
  });

  it("resolves relative_to as an offset from a named position", () => {
    const t = new CoordinateTransformer(court);
    const base = t.resolve({ named: "basket" });
    const rel = t.resolve({ relative_to: "basket", dx: 1, dy: -1 });
    expect(rel).toEqual({ x: base.x + 1, y: base.y - 1 });
  });

  it("maps court +y to world -z and court +x to world +x", () => {
    const t = new CoordinateTransformer(court);
    const world = t.toWorld({ x: 2, y: 5 });
    expect(world.x).toBe(2);
    expect(world.z).toBe(-5);
    expect(world.y).toBe(0);
  });

  it("scales custom_dimensions from feet to meters when unit is ft", () => {
    const t = new CoordinateTransformer({ ...court, unit: "ft", custom_dimensions: { length: 91.86 } });
    expect(t.dimensions.length).toBeCloseTo(28, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/court/coordinate-transformer.test.ts`
Expected: FAIL with `Cannot find module './coordinate-transformer'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/court/coordinate-transformer.ts
import * as THREE from "three";
import type { Coordinate, Court } from "../types/ocf";
import { FIBA_DEFAULTS, type CourtDimensions } from "./fiba-constants";
import { fibaNamedPosition } from "./named-positions";

const FT_TO_M = 0.3048;

export function resolveCourtDimensions(court: Court): CourtDimensions {
  const merged = { ...FIBA_DEFAULTS, ...(court.custom_dimensions ?? {}) };
  if (court.unit !== "ft") return merged;
  const scaled = { ...merged };
  for (const key of Object.keys(scaled) as (keyof CourtDimensions)[]) {
    scaled[key] = (merged[key] as number) * FT_TO_M;
  }
  return scaled;
}

export class CoordinateTransformer {
  readonly dimensions: CourtDimensions;

  constructor(private readonly court: Court) {
    this.dimensions = resolveCourtDimensions(court);
  }

  /** Resolve any Coordinate variant to absolute court meters. */
  resolve(coord: Coordinate): { x: number; y: number } {
    if ("x" in coord && "y" in coord) return { x: coord.x, y: coord.y };
    if ("named" in coord) return fibaNamedPosition(coord.named, this.dimensions);
    if ("relative_to" in coord) {
      const base = fibaNamedPosition(coord.relative_to, this.dimensions);
      return { x: base.x + coord.dx, y: base.y + coord.dy };
    }
    throw new Error(`CoordinateTransformer: unrecognized coordinate shape ${JSON.stringify(coord)}`);
  }

  /** Court meters -> Three.js world space (see module doc for the axis convention). */
  toWorld(courtXY: { x: number; y: number }): THREE.Vector3 {
    return new THREE.Vector3(courtXY.x, 0, -courtXY.y);
  }

  resolveToWorld(coord: Coordinate): THREE.Vector3 {
    return this.toWorld(this.resolve(coord));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/court/coordinate-transformer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/court/coordinate-transformer.ts src/court/coordinate-transformer.test.ts
git commit -m "feat: add CoordinateTransformer (named/relative/free coords -> world space)"
```

---

## Task 5 — Color scheme resolution

**Files:** `src/style/color-scheme.ts`, `src/style/color-scheme.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/style/color-scheme.test.ts
import { describe, it, expect } from "vitest";
import { resolveColorScheme, DEFAULT_COLOR_SCHEME } from "./color-scheme";

describe("resolveColorScheme", () => {
  it("falls back to defaults when nothing is provided", () => {
    expect(resolveColorScheme()).toEqual(DEFAULT_COLOR_SCHEME);
  });

  it("lets the document color_scheme override defaults", () => {
    const result = resolveColorScheme({ offense: "#123456" });
    expect(result.offense).toBe("#123456");
    expect(result.defense).toBe(DEFAULT_COLOR_SCHEME.defense);
  });

  it("lets a renderer option override beat the document scheme", () => {
    const result = resolveColorScheme({ offense: "#123456" }, { offense: "#abcdef" });
    expect(result.offense).toBe("#abcdef");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/style/color-scheme.test.ts`
Expected: FAIL with `Cannot find module './color-scheme'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/style/color-scheme.ts
import type { ColorScheme } from "../types/ocf";

export const DEFAULT_COLOR_SCHEME: Required<Pick<
  ColorScheme,
  "court_primary" | "court_accent" | "offense" | "defense" | "ball"
>> = {
  court_primary: "#f5f3ee",
  court_accent: "#8ea7c1",
  offense: "#2b3a55",
  defense: "#c0392b",
  ball: "#e07b1f",
};

/** Document color_scheme wins; renderer-option override wins over the document. */
export function resolveColorScheme(
  documentScheme?: ColorScheme,
  optionOverride?: ColorScheme,
): typeof DEFAULT_COLOR_SCHEME {
  return { ...DEFAULT_COLOR_SCHEME, ...documentScheme, ...optionOverride } as typeof DEFAULT_COLOR_SCHEME;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/style/color-scheme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/style/color-scheme.ts src/style/color-scheme.test.ts
git commit -m "feat: resolve color scheme (defaults <- document <- option override)"
```

---

## Task 6 — Court geometry builder

Builds the static Three.js meshes/lines for the court: floor plane, boundary lines,
paint (key), free-throw circle, three-point arc (single-radius approximation — true
FIBA corner-3 straight segments are a noted follow-up, not v1 scope), center circle
(full court only), backboard/rim marker.

**Files:** `src/court/build-court.ts`, `src/court/build-court.test.ts`

**Test approach:** Three.js meshes can't be meaningfully asserted via geometry
equality in a unit test — instead assert *structural* properties: object count,
names/types of children, and that line geometries' bounding boxes fall within
expected court bounds. This pattern (structural assertions over a built
`THREE.Group`) is reused for every subsequent builder task.

- [ ] **Step 1: Write the failing test**

```ts
// src/court/build-court.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildCourt } from "./build-court";
import { resolveCourtDimensions } from "./coordinate-transformer";
import { DEFAULT_COLOR_SCHEME } from "../style/color-scheme";

describe("buildCourt", () => {
  const court = { ruleset: "fiba", type: "half_court" } as const;
  const dims = resolveCourtDimensions(court);

  it("returns a THREE.Group named 'court'", () => {
    const group = buildCourt(court, dims, DEFAULT_COLOR_SCHEME);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe("court");
  });

  it("includes a floor mesh sized to the half-court bounds", () => {
    const group = buildCourt(court, dims, DEFAULT_COLOR_SCHEME);
    const floor = group.getObjectByName("court-floor") as THREE.Mesh;
    expect(floor).toBeDefined();
    floor.geometry.computeBoundingBox();
    const box = floor.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(dims.width);
  });

  it("omits the center circle for half_court and includes it for full_court", () => {
    const half = buildCourt(court, dims, DEFAULT_COLOR_SCHEME);
    const full = buildCourt({ ...court, type: "full_court" }, dims, DEFAULT_COLOR_SCHEME);
    expect(half.getObjectByName("center-circle")).toBeUndefined();
    expect(full.getObjectByName("center-circle")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/court/build-court.test.ts`
Expected: FAIL with `Cannot find module './build-court'`

- [ ] **Step 3: Write minimal implementation**

Point arrays are computed in *court meters*, then passed through a
`CoordinateTransformer` built internally from the same `court` — reuses Task 4's
axis convention rather than hand-rolling a second one. Half-court renders only the
frontcourt half (`y` in `[0, length/2]`); full-court renders both halves.

```ts
// src/court/build-court.ts
import * as THREE from "three";
import type { Court } from "../types/ocf";
import type { CourtDimensions } from "./fiba-constants";
import type { DEFAULT_COLOR_SCHEME } from "../style/color-scheme";
import { CoordinateTransformer } from "./coordinate-transformer";

function lineFromCourtPoints(
  points: { x: number; y: number }[],
  transformer: CoordinateTransformer,
  color: string,
  name: string,
  closed: boolean,
): THREE.Line {
  const worldPoints = points.map((p) => transformer.toWorld(p));
  const geometry = new THREE.BufferGeometry().setFromPoints(worldPoints);
  const material = new THREE.LineBasicMaterial({ color });
  const line = closed
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  line.name = name;
  return line;
}

export function buildCourt(
  court: Court,
  dims: CourtDimensions,
  colors: typeof DEFAULT_COLOR_SCHEME,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "court";
  const transformer = new CoordinateTransformer(court);
  const isFull = court.type === "full_court";
  const baseline = dims.length / 2;
  const nearEdge = isFull ? -baseline : 0;
  const courtLength = baseline - nearEdge;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.width, courtLength),
    new THREE.MeshBasicMaterial({ color: colors.court_primary }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.copy(transformer.toWorld({ x: 0, y: (nearEdge + baseline) / 2 }));
  floor.name = "court-floor";
  group.add(floor);

  group.add(
    lineFromCourtPoints(
      [
        { x: -dims.width / 2, y: nearEdge },
        { x: dims.width / 2, y: nearEdge },
        { x: dims.width / 2, y: baseline },
        { x: -dims.width / 2, y: baseline },
      ],
      transformer,
      colors.court_accent,
      "boundary",
      true,
    ),
  );

  const paintHalfWidth = dims.paint_width / 2;
  const paintNearY = baseline - dims.paint_depth;
  group.add(
    lineFromCourtPoints(
      [
        { x: -paintHalfWidth, y: baseline },
        { x: -paintHalfWidth, y: paintNearY },
        { x: paintHalfWidth, y: paintNearY },
        { x: paintHalfWidth, y: baseline },
      ],
      transformer,
      colors.court_accent,
      "paint",
      false,
    ),
  );

  const ftCirclePoints = new THREE.EllipseCurve(0, 0, paintHalfWidth, paintHalfWidth)
    .getPoints(48)
    .map((p) => ({ x: p.x, y: paintNearY + p.y }));
  group.add(lineFromCourtPoints(ftCirclePoints, transformer, colors.court_accent, "free-throw-circle", true));

  const basketY = baseline - dims.basket_from_baseline;
  const arcPoints = new THREE.EllipseCurve(
    0,
    0,
    dims.three_point_distance,
    dims.three_point_distance,
    0,
    Math.PI,
    false,
  )
    .getPoints(48)
    .map((p) => ({ x: p.x, y: basketY + p.y }));
  group.add(lineFromCourtPoints(arcPoints, transformer, colors.court_accent, "three-point-arc", false));

  const backboard = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.14, 24),
    new THREE.MeshBasicMaterial({ color: colors.court_accent }),
  );
  backboard.rotation.x = -Math.PI / 2;
  backboard.position.copy(transformer.toWorld({ x: 0, y: basketY }));
  backboard.name = "backboard";
  group.add(backboard);

  if (isFull) {
    const centerCirclePoints = new THREE.EllipseCurve(0, 0, dims.center_circle_radius, dims.center_circle_radius)
      .getPoints(48)
      .map((p) => ({ x: p.x, y: p.y }));
    group.add(lineFromCourtPoints(centerCirclePoints, transformer, colors.court_accent, "center-circle", true));
  }

  return group;
}
```

Note: this uses a single-radius `EllipseCurve` for the three-point arc, which is a
simplification of FIBA's true shape (straight corner segments meeting an arc) —
called out as a non-goal below, not silently dropped.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/court/build-court.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/court/build-court.ts src/court/build-court.test.ts
git commit -m "feat: build static FIBA court geometry (floor, boundary, paint, arcs)"
```

---

## Task 7 — Entity symbols: offense circle + number

**Files:** `src/entities/offense-symbol.ts`, `src/entities/offense-symbol.test.ts`

Filled circle (`THREE.CircleGeometry`, radius tuned so on-screen diameter matches
the ~30px spec figure at the reference camera height set in Task 17 — express the
radius as a court-meter constant `OFFENSE_SYMBOL_RADIUS_M` derived once against
that camera and reused everywhere, not re-derived per call), white 2px-equivalent
stroke ring, and a jersey number rendered as a `THREE.Sprite` with a canvas
texture (numbers must stay upright regardless of any parent rotation — a Sprite is
the correct primitive since it always faces the camera and ignores parent rotation
on its own visual content, so no extra counter-rotation logic is needed).

- [ ] **Step 1: Write the failing test**

```ts
// src/entities/offense-symbol.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildOffenseSymbol } from "./offense-symbol";

describe("buildOffenseSymbol", () => {
  it("returns a group named 'offense-symbol'", () => {
    const group = buildOffenseSymbol("#2b3a55", 4);
    expect(group.name).toBe("offense-symbol");
  });

  it("includes a jersey-number sprite when a number is given", () => {
    const group = buildOffenseSymbol("#2b3a55", 4);
    const sprite = group.getObjectByName("jersey-number");
    expect(sprite).toBeInstanceOf(THREE.Sprite);
  });

  it("omits the jersey-number sprite when no number is given", () => {
    const group = buildOffenseSymbol("#2b3a55");
    expect(group.getObjectByName("jersey-number")).toBeUndefined();
  });

  it("uses the given color for the fill mesh material", () => {
    const group = buildOffenseSymbol("#2b3a55", 4);
    const fill = group.getObjectByName("offense-fill") as THREE.Mesh;
    const material = fill.material as THREE.MeshBasicMaterial;
    expect(material.color.getHexString()).toBe("2b3a55");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entities/offense-symbol.test.ts`
Expected: FAIL with `Cannot find module './offense-symbol'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/entities/offense-symbol.ts
import * as THREE from "three";

export const OFFENSE_SYMBOL_RADIUS_M = 0.5;

function numberSprite(number: number | undefined): THREE.Sprite | null {
  if (number === undefined) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.6, 0.6, 1);
  sprite.position.y = 0.01;
  sprite.name = "jersey-number";
  return sprite;
}

export function buildOffenseSymbol(color: string, number?: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "offense-symbol";

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(OFFENSE_SYMBOL_RADIUS_M, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.name = "offense-fill";
  group.add(fill);

  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, OFFENSE_SYMBOL_RADIUS_M, OFFENSE_SYMBOL_RADIUS_M).getPoints(32),
    ),
    new THREE.LineBasicMaterial({ color: "#ffffff" }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  ring.name = "offense-ring";
  group.add(ring);

  const sprite = numberSprite(number);
  if (sprite) group.add(sprite);

  return group;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entities/offense-symbol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/offense-symbol.ts src/entities/offense-symbol.test.ts
git commit -m "feat: add offense entity symbol (filled circle + jersey number sprite)"
```

---

## Task 8 — Entity symbols: defense "arms" glyph (directional via `rotation`)

Per spec, defender orientation comes **only** from `EntityState.rotation` — never
inferred. `rotation` is degrees, 0° = arms pointing toward −y, clockwise (pending
spec PR #5; this plan takes the RESUME.md-documented convention as given).

**Files:** `src/entities/defense-symbol.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/entities/defense-symbol.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildDefenseSymbol, applyDefenseRotation } from "./defense-symbol";

describe("buildDefenseSymbol", () => {
  it("names the group and includes body + arms children", () => {
    const group = buildDefenseSymbol("#c0392b");
    expect(group.name).toBe("defense-symbol");
    expect(group.getObjectByName("defense-body")).toBeInstanceOf(THREE.Mesh);
    expect(group.getObjectByName("defense-arms")).toBeInstanceOf(THREE.Line);
  });

  it("preserves the spec's 51:23 icon aspect ratio without distortion", () => {
    const group = buildDefenseSymbol("#c0392b");
    const body = group.getObjectByName("defense-body") as THREE.Mesh;
    body.geometry.computeBoundingBox();
    const box = body.geometry.boundingBox!;
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    expect(width / height).toBeCloseTo(51 / 23, 1);
  });
});

describe("applyDefenseRotation", () => {
  it("rotates 0 degrees to no rotation (arms toward -y)", () => {
    const group = buildDefenseSymbol("#c0392b");
    applyDefenseRotation(group, 0);
    expect(group.rotation.y).toBeCloseTo(0, 5);
  });

  it("rotates 90 degrees clockwise to rotation.y ~= PI/2", () => {
    const group = buildDefenseSymbol("#c0392b");
    applyDefenseRotation(group, 90);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entities/defense-symbol.test.ts`
Expected: FAIL — `Cannot find module './defense-symbol'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/entities/defense-symbol.ts
import * as THREE from "three";

export const DEFENSE_SYMBOL_HEIGHT_M = 0.46; // ~23px at reference camera, see Task 13

/** Simple "arms out" glyph: a body wedge plus two arm strokes, built pointing
 *  toward -y at rotation 0, matching the spec's rotation convention. */
export function buildDefenseSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "defense-symbol";

  const h = DEFENSE_SYMBOL_HEIGHT_M;
  const w = h * (51 / 23); // preserve the spec's icon aspect ratio, no distortion

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(0, h * 0.5);
  bodyShape.lineTo(w * 0.15, -h * 0.2);
  bodyShape.lineTo(-w * 0.15, -h * 0.2);
  bodyShape.closePath();
  const body = new THREE.Mesh(
    new THREE.ShapeGeometry(bodyShape),
    new THREE.MeshBasicMaterial({ color }),
  );
  body.rotation.x = -Math.PI / 2;
  body.name = "defense-body";
  group.add(body);

  const armGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-w * 0.5, 0, -h * 0.1),
    new THREE.Vector3(w * 0.5, 0, -h * 0.1),
  ]);
  const arms = new THREE.Line(armGeom, new THREE.LineBasicMaterial({ color }));
  arms.name = "defense-arms";
  group.add(arms);

  return group;
}

/** rotation: degrees, 0 = arms toward -y, clockwise (spec PR #5 convention). */
export function applyDefenseRotation(group: THREE.Object3D, rotationDeg: number): void {
  group.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entities/defense-symbol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/defense-symbol.ts src/entities/defense-symbol.test.ts
git commit -m "feat: add defense entity symbol (arms glyph, rotation-driven)"
```

---

## Task 9 — Entity symbols: ball, coach, cone

**Files:** `src/entities/ball-symbol.ts`, `src/entities/coach-symbol.ts`,
`src/entities/cone-symbol.ts`, one `.test.ts` each (same structural-assertion
pattern as Tasks 7–8).

- **Ball:** small filled circle (`THREE.CircleGeometry`, radius ~0.15m), ball color
  from the resolved color scheme. Name: `ball-symbol`.
- **Coach:** filled circle with a "C" sprite (reuse the number-sprite approach
  from Task 7, parameterized by text instead of number). Name: `coach-symbol`.
- **Cone:** filled `THREE.Shape`-based triangle, apex up. Name: `cone-symbol`.

- [ ] **Step 1: Write the failing test**

```ts
// src/entities/ball-symbol.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildBallSymbol, BALL_SYMBOL_RADIUS_M } from "./ball-symbol";

describe("buildBallSymbol", () => {
  it("returns a group named 'ball-symbol' with a filled circle mesh", () => {
    const group = buildBallSymbol("#e07b1f");
    expect(group.name).toBe("ball-symbol");
    const fill = group.getObjectByName("ball-fill") as THREE.Mesh;
    expect(fill).toBeInstanceOf(THREE.Mesh);
    const material = fill.material as THREE.MeshBasicMaterial;
    expect(material.color.getHexString()).toBe("e07b1f");
  });

  it("uses a radius smaller than the offense symbol radius", () => {
    expect(BALL_SYMBOL_RADIUS_M).toBeLessThan(0.5);
    expect(BALL_SYMBOL_RADIUS_M).toBeCloseTo(0.15, 2);
  });
});
```

```ts
// src/entities/coach-symbol.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildCoachSymbol } from "./coach-symbol";

describe("buildCoachSymbol", () => {
  it("returns a group named 'coach-symbol' with a 'C' label sprite", () => {
    const group = buildCoachSymbol("#2b3a55");
    expect(group.name).toBe("coach-symbol");
    const sprite = group.getObjectByName("coach-label");
    expect(sprite).toBeInstanceOf(THREE.Sprite);
  });

  it("uses the given color for the fill mesh material", () => {
    const group = buildCoachSymbol("#2b3a55");
    const fill = group.getObjectByName("coach-fill") as THREE.Mesh;
    const material = fill.material as THREE.MeshBasicMaterial;
    expect(material.color.getHexString()).toBe("2b3a55");
  });
});
```

```ts
// src/entities/cone-symbol.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildConeSymbol } from "./cone-symbol";

describe("buildConeSymbol", () => {
  it("returns a group named 'cone-symbol' with an apex-up triangle mesh", () => {
    const group = buildConeSymbol("#e07b1f");
    expect(group.name).toBe("cone-symbol");
    const fill = group.getObjectByName("cone-fill") as THREE.Mesh;
    expect(fill).toBeInstanceOf(THREE.Mesh);
    fill.geometry.computeBoundingBox();
    const box = fill.geometry.boundingBox!;
    // apex-up triangle: max.y (apex) is farther from 0 than min.y (base) is close to 0
    expect(box.max.y).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entities/ball-symbol.test.ts src/entities/coach-symbol.test.ts src/entities/cone-symbol.test.ts`
Expected: FAIL — `Cannot find module './ball-symbol'` / `'./coach-symbol'` / `'./cone-symbol'` (files do not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/entities/ball-symbol.ts
import * as THREE from "three";

export const BALL_SYMBOL_RADIUS_M = 0.15;

export function buildBallSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "ball-symbol";

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_SYMBOL_RADIUS_M, 24),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.01; // sits above entity symbols so it never z-fights
  fill.name = "ball-fill";
  group.add(fill);

  return group;
}
```

```ts
// src/entities/coach-symbol.ts
import * as THREE from "three";

export const COACH_SYMBOL_RADIUS_M = 0.5;

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.6, 0.6, 1);
  sprite.position.y = 0.01;
  sprite.name = "coach-label";
  return sprite;
}

export function buildCoachSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "coach-symbol";

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(COACH_SYMBOL_RADIUS_M, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.name = "coach-fill";
  group.add(fill);

  group.add(labelSprite("C"));

  return group;
}
```

```ts
// src/entities/cone-symbol.ts
import * as THREE from "three";

export const CONE_SYMBOL_HEIGHT_M = 0.4;

export function buildConeSymbol(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "cone-symbol";

  const h = CONE_SYMBOL_HEIGHT_M;
  const shape = new THREE.Shape();
  shape.moveTo(0, h * 0.5); // apex
  shape.lineTo(h * 0.4, -h * 0.5);
  shape.lineTo(-h * 0.4, -h * 0.5);
  shape.closePath();

  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.name = "cone-fill";
  group.add(fill);

  return group;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entities/ball-symbol.test.ts src/entities/coach-symbol.test.ts src/entities/cone-symbol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/ball-symbol.ts src/entities/ball-symbol.test.ts src/entities/coach-symbol.ts src/entities/coach-symbol.test.ts src/entities/cone-symbol.ts src/entities/cone-symbol.test.ts
git commit -m "feat: add ball, coach, and cone entity symbols"
```

---

## Task 10 — Ball offset when carried (handedness-aware)

Per RESUME.md: a carried ball renders offset from the carrier — "ahead" in the
direction of the ball action, to the right by default / left if the carrying
entity has the `left_handed` tag. A loose ball renders at its own position,
un-offset.

Per RESUME.md: a carried ball renders offset from the carrier — "ahead" in the
direction of the ball action, to the right by default / left if the carrying
entity has the `left_handed` tag. A loose ball renders at its own position,
un-offset.

**Files:** `src/entities/ball-offset.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/entities/ball-offset.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  carriedBallOffset,
  BALL_CARRY_FORWARD_OFFSET_M,
  BALL_CARRY_SIDE_OFFSET_M,
} from "./ball-offset";

describe("carriedBallOffset", () => {
  const carrier = new THREE.Vector3(1, 0, 2);
  const forwardZ = new THREE.Vector3(0, 0, 1);

  it("offsets ahead along the forward vector", () => {
    const result = carriedBallOffset(carrier, forwardZ, false);
    expect(result.z).toBeCloseTo(carrier.z + BALL_CARRY_FORWARD_OFFSET_M, 5);
  });

  it("offsets to the right by default (right-handed)", () => {
    const result = carriedBallOffset(carrier, forwardZ, false);
    const sideDelta = result.x - carrier.x;
    expect(sideDelta).not.toBeCloseTo(0, 5);
    expect(Math.abs(sideDelta)).toBeCloseTo(BALL_CARRY_SIDE_OFFSET_M, 5);
  });

  it("flips the side offset sign when the carrier is left-handed", () => {
    const rightHanded = carriedBallOffset(carrier, forwardZ, false);
    const leftHanded = carriedBallOffset(carrier, forwardZ, true);
    const rightSideDelta = rightHanded.x - carrier.x;
    const leftSideDelta = leftHanded.x - carrier.x;
    expect(leftSideDelta).toBeCloseTo(-rightSideDelta, 5);
  });

  it("falls back to (0,0,-1) forward for a degenerate zero forward vector, without NaN", () => {
    const zero = new THREE.Vector3(0, 0, 0);
    const result = carriedBallOffset(carrier, zero, false);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
    expect(Number.isNaN(result.z)).toBe(false);
    expect(result.z).toBeCloseTo(carrier.z - BALL_CARRY_FORWARD_OFFSET_M, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entities/ball-offset.test.ts`
Expected: FAIL — `Cannot find module './ball-offset'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/entities/ball-offset.ts
import * as THREE from "three";

export const BALL_CARRY_FORWARD_OFFSET_M = 0.35;
export const BALL_CARRY_SIDE_OFFSET_M = 0.25;

/**
 * Computes the carried-ball world position given the carrier's position,
 * the forward direction (unit vector, direction of the ball-relevant action —
 * e.g. the dribble/move heading, or the facing direction if the entity is
 * stationary), and the carrier's handedness tag.
 */
export function carriedBallOffset(
  carrierWorldPos: THREE.Vector3,
  forward: THREE.Vector3,
  isLeftHanded: boolean,
): THREE.Vector3 {
  const raw = forward.clone().setY(0);
  // Guard: a zero-length forward must not silently NaN through normalize().
  const fwd = raw.lengthSq() < 1e-10 ? new THREE.Vector3(0, 0, -1) : raw.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const sideSign = isLeftHanded ? -1 : 1;

  return carrierWorldPos
    .clone()
    .addScaledVector(fwd, BALL_CARRY_FORWARD_OFFSET_M)
    .addScaledVector(side, sideSign * BALL_CARRY_SIDE_OFFSET_M);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entities/ball-offset.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/ball-offset.ts src/entities/ball-offset.test.ts
git commit -m "feat: add handedness-aware carried-ball offset"
```

---

## Task 11 — Path math: Catmull-Rom smoothing + arc-length resampling

**Files:** `src/paths/smooth-path.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/paths/smooth-path.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { smoothPath, resamplePath } from "./smooth-path";

describe("smoothPath", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => smoothPath([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("returns a straight line for 2-point input, midpoint sample equals the arithmetic midpoint", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(4, 0, 2);
    const curve = smoothPath([a, b]);
    const mid = curve.getPoint(0.5);
    expect(mid.x).toBeCloseTo(2, 5);
    expect(mid.z).toBeCloseTo(1, 5);
  });

  it("passes through each anchor for 3+ point input", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 3),
      new THREE.Vector3(5, 0, 1),
      new THREE.Vector3(7, 0, 4),
    ];
    const curve = smoothPath(points);
    // CatmullRomCurve3.getPoint(u) passes through anchors at u = i / (n - 1)
    for (let i = 0; i < points.length; i++) {
      const u = i / (points.length - 1);
      const sample = curve.getPoint(u);
      expect(sample.distanceTo(points[i])).toBeLessThan(0.05);
    }
  });
});

describe("resamplePath", () => {
  it("returns segments + 1 points", () => {
    const curve = smoothPath([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const points = resamplePath(curve, 10);
    expect(points).toHaveLength(11);
  });

  it("produces roughly equal arc-length spacing on a curved 4-point input", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 5),
      new THREE.Vector3(6, 0, 6),
      new THREE.Vector3(8, 0, 0),
    ];
    const curve = smoothPath(points);
    const sampled = resamplePath(curve, 20);
    const segmentLengths: number[] = [];
    for (let i = 1; i < sampled.length; i++) {
      segmentLengths.push(sampled[i].distanceTo(sampled[i - 1]));
    }
    const max = Math.max(...segmentLengths);
    const min = Math.min(...segmentLengths);
    expect(max / min).toBeLessThan(1.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/paths/smooth-path.test.ts`
Expected: FAIL — `Cannot find module './smooth-path'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/paths/smooth-path.ts
import * as THREE from "three";

/** Builds a smooth curve through the given anchor points (world space).
 *  Two points -> straight line (CatmullRom degenerates gracefully but we
 *  special-case it to avoid curve overshoot on 2-point inputs). */
export function smoothPath(points: THREE.Vector3[]): THREE.Curve<THREE.Vector3> {
  if (points.length < 2) {
    throw new Error(`smoothPath requires at least 2 points, got ${points.length}`);
  }
  if (points.length === 2) {
    return new THREE.LineCurve3(points[0], points[1]);
  }
  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}

/** Arc-length-reparametrized sample points along a curve. */
export function resamplePath(curve: THREE.Curve<THREE.Vector3>, segments: number): THREE.Vector3[] {
  return curve.getSpacedPoints(segments);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/paths/smooth-path.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/paths/smooth-path.ts src/paths/smooth-path.test.ts
git commit -m "feat: add Catmull-Rom path smoothing and arc-length resampling"
```

---

## Task 12 — Path math: collision avoidance against entity symbols

Paths must never cross through another symbol's footprint. Approach: after
smoothing, walk the resampled points and push any point that falls inside an
obstacle's radius directly outward from that obstacle's center, then re-smooth
through the adjusted points. This is a v1-pragmatic local repel, not a full path
planner — sufficient for the still-frame case where paths are short and obstacles
are sparse.

**Files:** `src/paths/avoid-collisions.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/paths/avoid-collisions.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { avoidCollisions, type Obstacle } from "./avoid-collisions";

describe("avoidCollisions", () => {
  it("pushes a point that falls inside an obstacle radius out to at least radius + margin", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(5, 0, 0), // sits exactly at the obstacle center
      new THREE.Vector3(10, 0, 0),
    ];
    const obstacles: Obstacle[] = [{ center: new THREE.Vector3(5, 0, 0), radius: 0.5 }];
    const result = avoidCollisions(points, obstacles, 0.1);
    const dist = result[1].distanceTo(obstacles[0].center);
    expect(dist).toBeGreaterThanOrEqual(0.6 - 1e-6);
  });

  it("leaves points outside all obstacle radii unchanged", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(5, 0, 10),
      new THREE.Vector3(10, 0, 0),
    ];
    const obstacles: Obstacle[] = [{ center: new THREE.Vector3(5, 0, 0), radius: 0.5 }];
    const result = avoidCollisions(points, obstacles, 0.1);
    expect(result[1].equals(points[1])).toBe(true);
  });

  it("never moves the start or end endpoint, even if it coincides with an obstacle center", () => {
    const points = [
      new THREE.Vector3(5, 0, 0),
      new THREE.Vector3(7, 0, 3),
      new THREE.Vector3(9, 0, 0),
    ];
    const obstacles: Obstacle[] = [{ center: new THREE.Vector3(5, 0, 0), radius: 0.5 }];
    const result = avoidCollisions(points, obstacles, 0.1);
    expect(result[0].equals(points[0])).toBe(true);
    expect(result[result.length - 1].equals(points[points.length - 1])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/paths/avoid-collisions.test.ts`
Expected: FAIL — `Cannot find module './avoid-collisions'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/paths/avoid-collisions.ts
import * as THREE from "three";

export interface Obstacle {
  center: THREE.Vector3;
  radius: number;
}

/** Pushes any sampled point that falls inside an obstacle radius straight out
 *  to the radius boundary (plus a small margin). Does not move path endpoints
 *  (start/end anchors are assumed to be entity centers on purpose — e.g. a
 *  pass starts at the passer — collision-avoidance skips index 0 and the last
 *  index). */
export function avoidCollisions(
  points: THREE.Vector3[],
  obstacles: Obstacle[],
  margin = 0.1,
): THREE.Vector3[] {
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    let adjusted = p;
    for (const obstacle of obstacles) {
      const delta = new THREE.Vector3().subVectors(adjusted, obstacle.center);
      delta.y = 0;
      const dist = delta.length();
      const minDist = obstacle.radius + margin;
      if (dist < minDist && dist > 1e-6) {
        adjusted = obstacle.center.clone().addScaledVector(delta.normalize(), minDist).setY(p.y);
      } else if (dist <= 1e-6) {
        // point exactly on an obstacle center: nudge along +x deterministically
        adjusted = obstacle.center.clone().add(new THREE.Vector3(minDist, 0, 0)).setY(p.y);
      }
    }
    return adjusted;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/paths/avoid-collisions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/paths/avoid-collisions.ts src/paths/avoid-collisions.test.ts
git commit -m "feat: add local collision-avoidance repel for action paths"
```

---

## Task 13 — Action line styles

Four independent style renderers, each taking a resampled/adjusted point array and
returning a `THREE.Object3D`. Each gets its own file + test (structural assertions:
correct primitive type, correct number of dash/wave segments for a known input
length).

**Files:**
- `src/actions/solid-line.ts` — move/cut. Plain `THREE.Line` through the given
  points (arrowhead attachment is a separate composable step, Task 14, applied
  by the action path resolver in Task 16).
- `src/actions/wavy-line.ts` — dribble. Displaces resampled points perpendicular to
  the local tangent by `amplitude * sin(2π * arcLengthFraction * cycles)`; `cycles`
  is computed from total path length divided by a fixed wavelength constant,
  **rounded to at least 1** so short paths still show one full arc instead of a
  squashed fraction (this directly encodes the RESUME.md requirement: short/curved
  dribbles get *fewer* waves, never squeezed-and-distorted ones).
- `src/actions/dashed-line.ts` — pass/hand_off. Uses `THREE.LineDashedMaterial`
  with `computeLineDistances()` (arrowhead also attached separately, Task 14).
- `src/actions/screen-line.ts` — screen. Solid line to the screen `at` position,
  terminated by a short perpendicular bar (`THREE.Line` of 2 points, computed
  from the end tangent rotated 90°) instead of an arrowhead.

- [ ] **Step 1: Write the failing test**

```ts
// src/actions/solid-line.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildSolidLine } from "./solid-line";

describe("buildSolidLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildSolidLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("builds a Line named 'move-path' with one vertex per input point", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 1), new THREE.Vector3(2, 0, 0)];
    const line = buildSolidLine(points);
    expect(line).toBeInstanceOf(THREE.Line);
    expect(line.name).toBe("move-path");
    expect(line.geometry.getAttribute("position").count).toBe(points.length);
  });
});
```

```ts
// src/actions/wavy-line.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildWavyLine } from "./wavy-line";

describe("buildWavyLine", () => {
  it("keeps endpoints exactly on the original path", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2)].map((p) =>
      Array.from({ length: 20 }, (_, i) => p.clone()),
    ).flat().map((p, i, arr) => p.lerp(arr[arr.length - 1], i / (arr.length - 1)));
    const line = buildWavyLine(points);
    const pos = line.geometry.getAttribute("position");
    expect(pos.getX(0)).toBeCloseTo(points[0].x);
    expect(pos.getX(pos.count - 1)).toBeCloseTo(points[points.length - 1].x);
  });

  it("produces at least one full wave cycle even on a short path", () => {
    const points = Array.from({ length: 10 }, (_, i) =>
      new THREE.Vector3(0, 0, -i * 0.02), // total length 0.18m, well under one wavelength
    );
    const line = buildWavyLine(points);
    const pos = line.geometry.getAttribute("position");
    let maxAbsX = 0;
    for (let i = 0; i < pos.count; i++) maxAbsX = Math.max(maxAbsX, Math.abs(pos.getX(i)));
    expect(maxAbsX).toBeGreaterThan(0); // visibly wavy, not squashed to a flat line
  });
});
```

```ts
// src/actions/dashed-line.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildDashedLine } from "./dashed-line";

describe("buildDashedLine", () => {
  it("builds a Line named 'pass-path' using a dashed material with line distances computed", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const line = buildDashedLine(points);
    expect(line.name).toBe("pass-path");
    expect(line.material).toBeInstanceOf(THREE.LineDashedMaterial);
    expect(line.geometry.getAttribute("lineDistance")).toBeDefined();
  });

  it("accepts an optional color argument and applies it to the dashed material", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const line = buildDashedLine(points, "#ff8800");
    const material = line.material as THREE.LineDashedMaterial;
    expect(material.color.getHexString()).toBe("ff8800");
  });
});
```

```ts
// src/actions/screen-line.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildScreenLine } from "./screen-line";

describe("buildScreenLine", () => {
  it("builds a group with a line and a perpendicular end bar", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)];
    const group = buildScreenLine(points);
    expect(group.name).toBe("screen-path");
    const line = group.getObjectByName("screen-line");
    const bar = group.getObjectByName("screen-bar");
    expect(line).toBeInstanceOf(THREE.Line);
    expect(bar).toBeInstanceOf(THREE.Line);
  });

  it("orients the end bar perpendicular to the path's end tangent", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)]; // tangent along -Z
    const group = buildScreenLine(points);
    const bar = group.getObjectByName("screen-bar") as THREE.Line;
    const pos = bar.geometry.getAttribute("position");
    const barVec = new THREE.Vector3(
      pos.getX(1) - pos.getX(0),
      0,
      pos.getZ(1) - pos.getZ(0),
    ).normalize();
    const tangent = new THREE.Vector3(0, 0, -1);
    expect(Math.abs(barVec.dot(tangent))).toBeLessThan(1e-6); // perpendicular: dot ~ 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/solid-line.test.ts src/actions/wavy-line.test.ts src/actions/dashed-line.test.ts src/actions/screen-line.test.ts`
Expected: FAIL — `Cannot find module` for each of `./solid-line`, `./wavy-line`, `./dashed-line`, `./screen-line` (files do not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/actions/solid-line.ts
import * as THREE from "three";

/** Plain solid line for move/cut actions. Arrowhead attachment happens
 *  separately (Task 14) so this builder stays a single-purpose primitive. */
export function buildSolidLine(points: THREE.Vector3[], color = "#222222"): THREE.Line {
  if (points.length < 2) throw new Error("buildSolidLine requires at least 2 points");
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
  line.name = "move-path";
  return line;
}
```

```ts
// src/actions/wavy-line.ts
import * as THREE from "three";

const WAVELENGTH_M = 0.6;
const AMPLITUDE_M = 0.12;

export function buildWavyLine(points: THREE.Vector3[], color = "#222222"): THREE.Line {
  if (points.length < 2) throw new Error("buildWavyLine requires at least 2 points");

  let totalLength = 0;
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    totalLength += points[i].distanceTo(points[i - 1]);
    cumulative.push(totalLength);
  }

  const cycles = Math.max(1, Math.round(totalLength / WAVELENGTH_M));
  const amplitude = totalLength < WAVELENGTH_M ? AMPLITUDE_M * (totalLength / WAVELENGTH_M) : AMPLITUDE_M;

  const wavy = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p.clone();
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const t = cumulative[i] / totalLength;
    const displacement = amplitude * Math.sin(2 * Math.PI * cycles * t);
    return p.clone().addScaledVector(normal, displacement);
  });

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(wavy),
    new THREE.LineBasicMaterial({ color }),
  );
  line.name = "dribble-path";
  return line;
}
```

```ts
// src/actions/dashed-line.ts
import * as THREE from "three";

const DASH_SIZE_M = 0.2;
const GAP_SIZE_M = 0.12;

export function buildDashedLine(points: THREE.Vector3[], color = "#222222"): THREE.Line {
  if (points.length < 2) throw new Error("buildDashedLine requires at least 2 points");
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({ color, dashSize: DASH_SIZE_M, gapSize: GAP_SIZE_M }),
  );
  line.computeLineDistances();
  line.name = "pass-path";
  return line;
}
```

```ts
// src/actions/screen-line.ts
import * as THREE from "three";

const SCREEN_BAR_HALF_LENGTH_M = 0.3;

/** Solid line to the screen position, terminated by a short perpendicular bar
 *  instead of an arrowhead. */
export function buildScreenLine(points: THREE.Vector3[], color = "#222222"): THREE.Group {
  if (points.length < 2) throw new Error("buildScreenLine requires at least 2 points");

  const group = new THREE.Group();
  group.name = "screen-path";

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
  line.name = "screen-line";
  group.add(line);

  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const tangent = new THREE.Vector3().subVectors(end, prev).setY(0).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
  const barPoints = [
    end.clone().addScaledVector(normal, SCREEN_BAR_HALF_LENGTH_M),
    end.clone().addScaledVector(normal, -SCREEN_BAR_HALF_LENGTH_M),
  ];
  const bar = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(barPoints),
    new THREE.LineBasicMaterial({ color }),
  );
  bar.name = "screen-bar";
  group.add(bar);

  return group;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/solid-line.test.ts src/actions/wavy-line.test.ts src/actions/dashed-line.test.ts src/actions/screen-line.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/solid-line.ts src/actions/solid-line.test.ts src/actions/wavy-line.ts src/actions/wavy-line.test.ts src/actions/dashed-line.ts src/actions/dashed-line.test.ts src/actions/screen-line.ts src/actions/screen-line.test.ts
git commit -m "feat: add action line style builders (solid, wavy, dashed, screen bar)"
```

---

## Task 14 — Arrowhead + trim-before-target

**Files:** `src/actions/arrowhead.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/actions/arrowhead.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { trimPathEnd, buildArrowhead } from "./arrowhead";

function polylineLength(points: THREE.Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);
  return total;
}

describe("trimPathEnd", () => {
  it("shortens the polyline length by exactly `distance`", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)];
    const before = polylineLength(points);
    const { points: trimmed } = trimPathEnd(points, 0.5);
    const after = polylineLength(trimmed);
    expect(before - after).toBeCloseTo(0.5, 5);
  });

  it("returns the end tangent pointing from the second-to-last point toward the last", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const { endTangent } = trimPathEnd(points, 0.3);
    expect(endTangent.x).toBeCloseTo(1, 5);
    expect(endTangent.z).toBeCloseTo(0, 5);
  });

  it("keeps the point count unchanged (only the last point moves)", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(2, 0, 0),
    ];
    const { points: trimmed } = trimPathEnd(points, 0.2);
    expect(trimmed).toHaveLength(points.length);
    expect(trimmed[0].equals(points[0])).toBe(true);
    expect(trimmed[1].equals(points[1])).toBe(true);
  });
});

describe("buildArrowhead", () => {
  it("names the mesh 'arrowhead'", () => {
    const mesh = buildArrowhead(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), "#ff0000");
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.name).toBe("arrowhead");
  });

  it("orients the cone's tip (local +Y) to point along the given (normalized, y=0) direction", () => {
    const direction = new THREE.Vector3(1, 0, 1).normalize();
    const mesh = buildArrowhead(new THREE.Vector3(0, 0, 0), direction, "#00ff00");
    const tip = new THREE.Vector3(0, 1, 0).applyEuler(mesh.rotation);
    expect(tip.x).toBeCloseTo(direction.x, 5);
    expect(tip.y).toBeCloseTo(direction.y, 5);
    expect(tip.z).toBeCloseTo(direction.z, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/arrowhead.test.ts`
Expected: FAIL — `Cannot find module './arrowhead'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/actions/arrowhead.ts
import * as THREE from "three";

const ARROWHEAD_LENGTH_M = 0.25;

/** Trims the end of a point path back by `distance` along the final tangent,
 *  so an arrowhead (or any end marker) doesn't visually overlap the target
 *  symbol's border. Returns the trimmed points plus the tangent at the new end. */
export function trimPathEnd(
  points: THREE.Vector3[],
  distance: number,
): { points: THREE.Vector3[]; endTangent: THREE.Vector3 } {
  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? points[0];
  const tangent = new THREE.Vector3().subVectors(last, prev).setY(0).normalize();
  const trimmedEnd = last.clone().addScaledVector(tangent, -distance);
  return { points: [...points.slice(0, -1), trimmedEnd], endTangent: tangent };
}

export function buildArrowhead(atPoint: THREE.Vector3, direction: THREE.Vector3, color: string): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(ARROWHEAD_LENGTH_M * 0.4, ARROWHEAD_LENGTH_M, 12);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
  mesh.rotation.x = Math.PI / 2; // cone default points +Y; lay flat pointing along +Z
  const angle = Math.atan2(direction.x, direction.z);
  mesh.rotation.z = -angle;
  mesh.position.copy(atPoint).addScaledVector(direction, ARROWHEAD_LENGTH_M * 0.5);
  mesh.name = "arrowhead";
  return mesh;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/arrowhead.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/arrowhead.ts src/actions/arrowhead.test.ts
git commit -m "feat: add arrowhead builder + end-trim helper"
```

---

## Task 15 — Shoot glyph (oriented toward the basket)

**Files:** `src/actions/shoot-glyph.ts`, `.test.ts`

Per spec, `shoot` has no path — it's a glyph rendered at the shooter's position,
rotated to face the basket. Reuses the defense-arms glyph shape from Task 8 (spec:
"FIBA glyph at the shooter") but with the offense/shoot color and computed rotation
instead of a data-provided one.

- [ ] **Step 1: Write the failing test**

```ts
// src/actions/shoot-glyph.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildShootGlyph } from "./shoot-glyph";

describe("buildShootGlyph", () => {
  it("returns a Group named 'shoot-glyph' positioned exactly at the shooter", () => {
    const shooterPos = new THREE.Vector3(2, 0, -3);
    const basketPos = new THREE.Vector3(2, 0, -10);
    const glyph = buildShootGlyph(shooterPos, basketPos, "#ffffff");
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe("shoot-glyph");
    expect(glyph.position.equals(shooterPos)).toBe(true);
  });

  it("faces rotation.y ~= 0 when the basket is directly at world -Z from the shooter", () => {
    const shooterPos = new THREE.Vector3(0, 0, 0);
    const basketPos = new THREE.Vector3(0, 0, -10);
    const glyph = buildShootGlyph(shooterPos, basketPos, "#ffffff");
    expect(glyph.rotation.y).toBeCloseTo(0, 5);
  });

  it("faces rotation.y ~= PI/2 when the basket is at the shooter's world +X, matching the clockwise convention from Task 8", () => {
    const shooterPos = new THREE.Vector3(0, 0, 0);
    const basketPos = new THREE.Vector3(10, 0, 0);
    const glyph = buildShootGlyph(shooterPos, basketPos, "#ffffff");
    expect(glyph.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/shoot-glyph.test.ts`
Expected: FAIL — `Cannot find module './shoot-glyph'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/actions/shoot-glyph.ts
import * as THREE from "three";
import { buildDefenseSymbol, applyDefenseRotation } from "../entities/defense-symbol";

/** Orients the shoot glyph so it faces from `shooterPos` toward `basketPos`,
 *  reusing the same rotation convention as defender orientation
 *  (0 = arms toward -y, clockwise). */
export function buildShootGlyph(
  shooterPos: THREE.Vector3,
  basketPos: THREE.Vector3,
  color: string,
): THREE.Group {
  const toBasket = new THREE.Vector3().subVectors(basketPos, shooterPos).setY(0).normalize();
  // rotation 0 faces -z (court -y); angle is measured clockwise from that heading
  const angleRad = Math.atan2(toBasket.x, -toBasket.z);
  const glyph = buildDefenseSymbol(color);
  glyph.name = "shoot-glyph";
  applyDefenseRotation(glyph, THREE.MathUtils.radToDeg(angleRad));
  glyph.position.copy(shooterPos);
  return glyph;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/shoot-glyph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/shoot-glyph.ts src/actions/shoot-glyph.test.ts
git commit -m "feat: add shoot glyph oriented toward the basket"
```

---

## Task 16 — Action path resolver

Dispatches on `Action.type` to produce a resolved, world-space point path (or, for
`shoot`, a direct glyph build call) from a frame's start state + the action's own
data. This is the task that actually reads `moves[].to`, `at`, `to_entity_ref`.

**Files:** `src/actions/resolve-action-path.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/actions/resolve-action-path.test.ts
import { describe, it, expect } from "vitest";
import type { Action, FrameState } from "../types/ocf";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { entityWorldPos, resolveActionPath } from "./resolve-action-path";

const transformer = new CoordinateTransformer({ ruleset: "fiba", type: "half_court" });

const startState: FrameState = {
  entities: [
    { entity_ref: "o1", position: { x: 0, y: 0 } },
    { entity_ref: "o2", position: { x: 3, y: 3 } },
  ],
};

describe("entityWorldPos", () => {
  it("resolves the world position of a known entity_ref", () => {
    const expected = transformer.resolveToWorld({ x: 0, y: 0 });
    const pos = entityWorldPos(startState, "o1", transformer);
    expect(pos.equals(expected)).toBe(true);
  });

  it("throws a descriptive error for an unknown entity_ref", () => {
    expect(() => entityWorldPos(startState, "ghost", transformer)).toThrow(/ghost/);
  });
});

describe("resolveActionPath", () => {
  it("chains through multiple `moves` for move/cut/dribble", () => {
    const action: Action = {
      type: "cut",
      entity_ref: "o1",
      moves: [{ to: { x: 1, y: 1 } }, { to: { x: 2, y: 2 } }],
    };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(3); // start + 2 moves
    expect(path[0].equals(transformer.resolveToWorld({ x: 0, y: 0 }))).toBe(true);
    expect(path[2].equals(transformer.resolveToWorld({ x: 2, y: 2 }))).toBe(true);
  });

  it("resolves both entity refs from startState for pass/hand_off", () => {
    const action: Action = { type: "pass", entity_ref: "o1", to_entity_ref: "o2" };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
    expect(path[1].equals(transformer.resolveToWorld({ x: 3, y: 3 }))).toBe(true);
  });

  it("resolves a free coordinate `at` for screen", () => {
    const action: Action = { type: "screen", entity_ref: "o1", at: { x: 5, y: 5 } };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
    expect(path[1].equals(transformer.resolveToWorld({ x: 5, y: 5 }))).toBe(true);
  });

  it("resolves a named coordinate `at` for screen", () => {
    const action: Action = { type: "screen", entity_ref: "o1", at: { named: "basket" } };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
  });

  it("returns null for shoot (no path)", () => {
    const action: Action = { type: "shoot", entity_ref: "o1" };
    expect(resolveActionPath(action, startState, transformer)).toBeNull();
  });

  it("throws when entity_ref is missing from startState.entities", () => {
    const action: Action = { type: "move", entity_ref: "ghost", moves: [{ to: { x: 1, y: 1 } }] };
    expect(() => resolveActionPath(action, startState, transformer)).toThrow(/ghost/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: FAIL — `Cannot find module './resolve-action-path'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/actions/resolve-action-path.ts
import * as THREE from "three";
import type { Action, FrameState } from "../types/ocf";
import { CoordinateTransformer } from "../court/coordinate-transformer";

export function entityWorldPos(
  state: FrameState,
  entityRef: string,
  transformer: CoordinateTransformer,
): THREE.Vector3 {
  const entityState = state.entities.find((e) => e.entity_ref === entityRef);
  if (!entityState) {
    throw new Error(`resolveActionPath: no entity state for entity_ref "${entityRef}" in frame state`);
  }
  return transformer.resolveToWorld(entityState.position);
}

/** Returns null for actions with no path (shoot). */
export function resolveActionPath(
  action: Action,
  startState: FrameState,
  transformer: CoordinateTransformer,
): THREE.Vector3[] | null {
  switch (action.type) {
    case "move":
    case "cut":
    case "dribble": {
      const start = entityWorldPos(startState, action.entity_ref, transformer);
      const rest = action.moves.map((m) => transformer.resolveToWorld(m.to));
      return [start, ...rest];
    }
    case "pass":
    case "hand_off": {
      const start = entityWorldPos(startState, action.entity_ref, transformer);
      const end = entityWorldPos(startState, action.to_entity_ref, transformer);
      return [start, end];
    }
    case "screen": {
      const start = entityWorldPos(startState, action.entity_ref, transformer);
      const end = transformer.resolveToWorld(action.at);
      return [start, end];
    }
    case "shoot":
      return null;
    default: {
      const exhaustive: never = action;
      throw new Error(`resolveActionPath: unhandled action type ${JSON.stringify(exhaustive)}`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/resolve-action-path.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/resolve-action-path.ts src/actions/resolve-action-path.test.ts
git commit -m "feat: add action path resolver (dispatch on Action.type)"
```

---

## Task 17 — Camera setup

Orthographic top-down camera fit to the court bounds for the given `court.type`,
with a small margin so symbols at the boundary aren't clipped.

**Files:** `src/scene/camera.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/camera.test.ts
import { describe, it, expect } from "vitest";
import { buildCamera } from "./camera";
import { FIBA_DEFAULTS } from "../court/fiba-constants";

describe("buildCamera", () => {
  it("sets camera.up to (0, 0, -1), the convention Task 4 depends on for \"court +y renders toward the top of the screen\"", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    expect(camera.up.toArray()).toEqual([0, 0, -1]);
  });

  it("half_court: view bounds strictly contain the frontcourt bounding box (x in [-width/2, width/2]) with margin to spare", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    const halfWidth = FIBA_DEFAULTS.width / 2;
    expect(camera.right).toBeGreaterThan(halfWidth);
    expect(camera.left).toBeLessThan(-halfWidth);
  });

  it("half_court: view bounds fit the half-court length (not the full court length)", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    const halfCourtHalfLength = FIBA_DEFAULTS.length / 2 / 2;
    expect(camera.top).toBeGreaterThan(halfCourtHalfLength);
  });

  it("full_court: view bounds cover the full court's half-length (z in [-length/2, length/2]) with margin to spare", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "full_court", 1);
    const fullHalfLength = FIBA_DEFAULTS.length / 2;
    expect(camera.top).toBeGreaterThan(fullHalfLength);
  });

  it("centers the half_court camera on the frontcourt (negative Z)", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    expect(camera.position.z).toBeLessThan(0);
  });

  it("centers the full_court camera at Z = 0", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "full_court", 1);
    expect(camera.position.z).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/camera.test.ts`
Expected: FAIL — `Cannot find module './camera'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/scene/camera.ts
import * as THREE from "three";
import type { CourtDimensions } from "../court/fiba-constants";
import type { CourtType } from "../types/ocf";

const MARGIN_M = 1.5;

export function buildCamera(
  dims: CourtDimensions,
  courtType: CourtType,
  aspect: number,
): THREE.OrthographicCamera {
  const courtLength = courtType === "full_court" ? dims.length : dims.length / 2;
  const halfWidth = dims.width / 2 + MARGIN_M;
  const halfLength = courtLength / 2 + MARGIN_M;

  // Fit both axes: pick whichever half-extent, scaled by aspect, is larger.
  const viewHalfHeight = Math.max(halfLength, halfWidth / aspect);
  const viewHalfWidth = viewHalfHeight * aspect;

  const camera = new THREE.OrthographicCamera(
    -viewHalfWidth,
    viewHalfWidth,
    viewHalfHeight,
    -viewHalfHeight,
    0.1,
    100,
  );

  const centerZ = courtType === "full_court" ? 0 : -courtLength / 2;
  camera.position.set(0, 50, centerZ);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, centerZ);
  camera.updateProjectionMatrix();
  return camera;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/camera.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scene/camera.ts src/scene/camera.test.ts
git commit -m "feat: add orthographic top-down camera fit to court bounds"
```

---

## Task 18 — Scene composer (single frame)

Ties every prior task together: builds court + entity symbols (positioned via
`CoordinateTransformer`) + action overlays (via the path pipeline: resolve →
smooth → resample → avoid-collisions → style) into one `THREE.Scene`.

**Files:** `src/scene/compose-frame.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/compose-frame.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { composeFrame } from "./compose-frame";

function baseDoc(overrides: Partial<OcfDocument["frames"][0]>): OcfDocument {
  return {
    version: "1.0",
    court: { ruleset: "fiba", type: "half_court" },
    entities: [
      { id: "o1", type: "offense", number: 4 },
      { id: "d1", type: "defense" },
    ],
    frames: [
      {
        id: "f1",
        start_state: {
          entities: [
            { entity_ref: "o1", position: { x: 0, y: 5 } },
            { entity_ref: "d1", position: { x: 1, y: 6 }, rotation: 90 },
          ],
          ball: { status: "carried", carried_by: "o1" },
        },
        ...overrides,
      },
    ],
  };
}

describe("composeFrame", () => {
  it("builds 2 entity symbols, a carried ball offset off the carrier, and a move-path + arrowhead", () => {
    const doc = baseDoc({
      actions: [{ type: "move", entity_ref: "o1", moves: [{ to: { x: 2, y: 7 } }] }],
    });
    const scene = composeFrame(doc, 0);

    const entities = scene.getObjectByName("entities")!;
    expect(entities.children).toHaveLength(2);

    const ball = scene.getObjectByName("ball")!;
    expect(ball).toBeDefined();
    const carrierSymbol = entities.children.find((c) => c === scene.getObjectByName("entities")!.children[0])!;
    expect(ball.position.equals(carrierSymbol.position)).toBe(false); // offset applied, not exact overlap

    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("move-path")).toBeInstanceOf(THREE.Line);
    expect(actions.getObjectByName("arrowhead")).toBeInstanceOf(THREE.Mesh);
  });

  it("builds a dribble-path for a dribble action", () => {
    const doc = baseDoc({
      actions: [{ type: "dribble", entity_ref: "o1", moves: [{ to: { x: 2, y: 7 } }] }],
    });
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("dribble-path")).toBeInstanceOf(THREE.Line);
  });

  it("builds a shoot-glyph with no path line for a shoot action", () => {
    const doc = baseDoc({ actions: [{ type: "shoot", entity_ref: "o1" }] });
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("shoot-glyph")).toBeInstanceOf(THREE.Group);
    expect(actions.getObjectByName("move-path")).toBeNull();
    expect(actions.getObjectByName("dribble-path")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scene/compose-frame.test.ts`
Expected: FAIL — `Cannot find module './compose-frame'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/scene/compose-frame.ts
import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer, resolveCourtDimensions } from "../court/coordinate-transformer";
import { buildCourt } from "../court/build-court";
import { resolveColorScheme } from "../style/color-scheme";
import { buildOffenseSymbol, OFFENSE_SYMBOL_RADIUS_M } from "../entities/offense-symbol";
import { buildDefenseSymbol, applyDefenseRotation, DEFENSE_SYMBOL_HEIGHT_M } from "../entities/defense-symbol";
import { buildBallSymbol } from "../entities/ball-symbol";
import { buildCoachSymbol } from "../entities/coach-symbol";
import { buildConeSymbol } from "../entities/cone-symbol";
import { carriedBallOffset } from "../entities/ball-offset";
import { resolveActionPath, entityWorldPos } from "../actions/resolve-action-path";
import { smoothPath, resamplePath } from "../paths/smooth-path";
import { avoidCollisions, type Obstacle } from "../paths/avoid-collisions";
import { trimPathEnd, buildArrowhead } from "../actions/arrowhead";
import { buildWavyLine } from "../actions/wavy-line";
import { buildDashedLine } from "../actions/dashed-line";
import { buildScreenLine } from "../actions/screen-line";
import { buildShootGlyph } from "../actions/shoot-glyph";

export interface ComposeOptions {
  colorSchemeOverride?: OcfDocument["color_scheme"];
}

export function composeFrame(
  doc: OcfDocument,
  frameIndex: number,
  options: ComposeOptions = {},
): THREE.Scene {
  const scene = new THREE.Scene();
  const dims = resolveCourtDimensions(doc.court);
  const transformer = new CoordinateTransformer(doc.court);
  const colors = resolveColorScheme(doc.color_scheme, options.colorSchemeOverride);

  scene.add(buildCourt(doc.court, dims, colors));

  const startState = resolveFrameState(doc, frameIndex, "start");
  const entityGroup = new THREE.Group();
  entityGroup.name = "entities";
  scene.add(entityGroup);

  const obstacles: Obstacle[] = [];
  const symbolsByRef = new Map<string, THREE.Object3D>();

  for (const entityState of startState.entities) {
    const entityDef = doc.entities.find((e) => e.id === entityState.entity_ref);
    if (!entityDef) continue;
    const worldPos = transformer.resolveToWorld(entityState.position);

    let symbol: THREE.Group;
    let radius = OFFENSE_SYMBOL_RADIUS_M;
    switch (entityDef.type) {
      case "offense":
        symbol = buildOffenseSymbol(colors.offense, entityDef.number);
        break;
      case "defense":
        symbol = buildDefenseSymbol(colors.defense);
        applyDefenseRotation(symbol, entityState.rotation ?? 0);
        radius = DEFENSE_SYMBOL_HEIGHT_M / 2;
        break;
      case "coach":
        symbol = buildCoachSymbol(colors.offense);
        break;
      case "cone":
        symbol = buildConeSymbol(colors.court_accent);
        break;
    }
    symbol.position.copy(worldPos);
    entityGroup.add(symbol);
    symbolsByRef.set(entityDef.id, symbol);
    obstacles.push({ center: worldPos, radius });
  }

  if (startState.ball) {
    const ballGroup = new THREE.Group();
    ballGroup.name = "ball";
    if (startState.ball.status === "carried") {
      const carrierState = startState.entities.find((e) => e.entity_ref === startState.ball!.carried_by);
      const carrierEntity = doc.entities.find((e) => e.id === carrierState?.entity_ref);
      const carrierWorldPos = carrierState ? transformer.resolveToWorld(carrierState.position) : new THREE.Vector3();
      // v1 simplification: always offset "forward" toward -Z (frontcourt), regardless
      // of the carrier's actual action heading. The design doc's fuller rule ("forward
      // = direction of the ball action") is deferred past v1 — see RESUME.md.
      const forward = new THREE.Vector3(0, 0, -1);
      const isLeftHanded = carrierEntity?.tags?.includes("left_handed") ?? false;
      const ball = buildBallSymbol(colors.ball);
      ball.position.copy(carriedBallOffset(carrierWorldPos, forward, isLeftHanded));
      ballGroup.add(ball);
    } else {
      const ball = buildBallSymbol(colors.ball);
      ball.position.copy(transformer.resolveToWorld(startState.ball.position));
      ballGroup.add(ball);
    }
    scene.add(ballGroup);
  }

  const actionGroup = new THREE.Group();
  actionGroup.name = "actions";
  scene.add(actionGroup);

  for (const action of doc.frames[frameIndex].actions ?? []) {
    if (action.type === "shoot") {
      const shooterPos = entityWorldPos(startState, action.entity_ref, transformer);
      const basketPos = transformer.resolveToWorld({ named: "basket" });
      actionGroup.add(buildShootGlyph(shooterPos, basketPos, colors.offense));
      continue;
    }

    const rawPath = resolveActionPath(action, startState, transformer);
    if (!rawPath) continue;

    const curve = smoothPath(rawPath);
    const resampled = resamplePath(curve, Math.max(16, rawPath.length * 8));
    const targetObstacles = obstacles.filter((o) => !rawPath[0].equals(o.center));
    const adjusted = avoidCollisions(resampled, targetObstacles);

    if (action.type === "move" || action.type === "cut") {
      const { points, endTangent } = trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + 0.1);
      const curve2 = smoothPath(points);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(resamplePath(curve2, points.length)),
        new THREE.LineBasicMaterial({ color: colors.offense }),
      );
      line.name = "move-path";
      actionGroup.add(line);
      actionGroup.add(buildArrowhead(points[points.length - 1], endTangent, colors.offense));
    } else if (action.type === "dribble") {
      actionGroup.add(buildWavyLine(adjusted));
    } else if (action.type === "pass" || action.type === "hand_off") {
      const { points, endTangent } = trimPathEnd(adjusted, OFFENSE_SYMBOL_RADIUS_M + 0.1);
      actionGroup.add(buildDashedLine(points, colors.offense));
      actionGroup.add(buildArrowhead(points[points.length - 1], endTangent, colors.offense));
    } else if (action.type === "screen") {
      actionGroup.add(buildScreenLine(adjusted, colors.offense));
    }
  }

  return scene;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scene/compose-frame.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scene/compose-frame.ts src/scene/compose-frame.test.ts
git commit -m "feat: add scene composer tying court, entities, and actions together"
```

---

## Task 19 — ViewModeController

Thin dispatch layer per the architecture doc: holds the current view mode, and for
v1 only `"tactical_print"` is implemented; any other mode returns a structured
"not implemented" result rather than throwing, so callers can detect and message
it distinctly from a real error.

**Files:** `src/view-modes/view-mode-controller.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/view-modes/view-mode-controller.test.ts
import { describe, it, expect } from "vitest";
import type { OcfDocument } from "../types/ocf";
import { ViewModeController } from "./view-mode-controller";

const doc: OcfDocument = {
  version: "1.0",
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ id: "o1", type: "offense", number: 1 }],
  frames: [
    { id: "f1", start_state: { entities: [{ entity_ref: "o1", position: { x: 0, y: 0 } }] } },
  ],
};

describe("ViewModeController", () => {
  it("defaults to tactical_print mode and renders a populated scene", () => {
    const controller = new ViewModeController();
    expect(controller.getMode()).toBe("tactical_print");
    const result = controller.renderFrame(doc, 0);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.scene.getObjectByName("entities")).toBeDefined();
    }
  });

  it("returns not_implemented (without throwing) for coaching_animation", () => {
    const controller = new ViewModeController();
    controller.setMode("coaching_animation");
    const result = controller.renderFrame(doc, 0);
    expect(result).toEqual({ status: "not_implemented", mode: "coaching_animation" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/view-modes/view-mode-controller.test.ts`
Expected: FAIL — `Cannot find module './view-mode-controller'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/view-modes/view-mode-controller.ts
import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { composeFrame } from "../scene/compose-frame";

export type ViewMode = "tactical_print" | "coaching_animation";

export type RenderFrameResult =
  | { status: "ok"; scene: THREE.Scene }
  | { status: "not_implemented"; mode: ViewMode };

export class ViewModeController {
  private mode: ViewMode = "tactical_print";

  setMode(mode: ViewMode): void {
    this.mode = mode;
  }

  getMode(): ViewMode {
    return this.mode;
  }

  renderFrame(doc: OcfDocument, frameIndex: number): RenderFrameResult {
    if (this.mode === "tactical_print") {
      return { status: "ok", scene: composeFrame(doc, frameIndex) };
    }
    return { status: "not_implemented", mode: this.mode };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view-modes/view-mode-controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/view-modes/view-mode-controller.ts src/view-modes/view-mode-controller.test.ts
git commit -m "feat: add ViewModeController (tactical_print dispatch, others not_implemented)"
```

---

## Task 20 — Public API: `OCFRenderer`

**Files:** `src/render.ts`, `.test.ts`, `src/index.ts` (exports)

- [ ] **Step 1: Write the failing test**

```ts
// src/render.test.ts
import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import type { OcfDocument } from "./types/ocf";
import { OCFRenderer } from "./render";

const doc: OcfDocument = {
  version: "1.0",
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ id: "o1", type: "offense", number: 1 }],
  frames: [
    { id: "f1", start_state: { entities: [{ entity_ref: "o1", position: { x: 0, y: 0 } }] } },
  ],
};

describe("OCFRenderer", () => {
  it("renderFrame returns status 'ok' with a scene and a camera fit to the court", () => {
    const renderer = new OCFRenderer(doc);
    const result = renderer.renderFrame(0);
    expect(result.status).toBe("ok");
    expect(result.camera).toBeInstanceOf(THREE.OrthographicCamera);
  });

  it("renderFrame returns 'not_implemented' with no camera after setMode('coaching_animation')", () => {
    const renderer = new OCFRenderer(doc);
    renderer.setMode("coaching_animation");
    const result = renderer.renderFrame(0);
    expect(result.status).toBe("not_implemented");
    expect(result.camera).toBeUndefined();
  });

  it("dispose() does not throw and disposes every mesh/line's geometry", () => {
    const renderer = new OCFRenderer(doc);
    const result = renderer.renderFrame(0);
    if (result.status !== "ok") throw new Error("expected status ok");
    const disposeSpies: ReturnType<typeof vi.spyOn>[] = [];
    result.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        disposeSpies.push(vi.spyOn(obj.geometry, "dispose"));
      }
    });
    expect(() => renderer.dispose(result.scene)).not.toThrow();
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render.test.ts`
Expected: FAIL — `Cannot find module './render'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/render.ts
import * as THREE from "three";
import type { OcfDocument } from "./types/ocf";
import { ViewModeController, type ViewMode, type RenderFrameResult } from "./view-modes/view-mode-controller";
import { buildCamera } from "./scene/camera";
import { resolveCourtDimensions } from "./court/coordinate-transformer";

export interface OCFRendererOptions {
  mode?: ViewMode;
}

export class OCFRenderer {
  private readonly controller = new ViewModeController();

  constructor(private readonly document: OcfDocument, options: OCFRendererOptions = {}) {
    if (options.mode) this.controller.setMode(options.mode);
  }

  setMode(mode: ViewMode): void {
    this.controller.setMode(mode);
  }

  /** Builds the scene + a camera fit to the court, for the given frame. */
  renderFrame(frameIndex: number, aspect = 1): RenderFrameResult & { camera?: THREE.OrthographicCamera } {
    const result = this.controller.renderFrame(this.document, frameIndex);
    if (result.status !== "ok") return result;
    const dims = resolveCourtDimensions(this.document.court);
    const camera = buildCamera(dims, this.document.court.type, aspect);
    return { ...result, camera };
  }

  /** Renders directly to a canvas using WebGLRenderer — browser/Node-with-headless-gl only. */
  renderToCanvas(frameIndex: number, canvas: HTMLCanvasElement): void {
    const { clientWidth, clientHeight } = canvas;
    const aspect = clientWidth / clientHeight;
    const result = this.renderFrame(frameIndex, aspect);
    if (result.status !== "ok" || !result.camera) {
      throw new Error(`OCFRenderer.renderToCanvas: mode "${this.controller.getMode()}" is not implemented yet`);
    }
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(clientWidth, clientHeight, false);
    renderer.render(result.scene, result.camera);
  }

  dispose(scene: THREE.Scene): void {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        const material = obj.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      }
    });
  }
}
```

```ts
// src/index.ts
export { OCFRenderer, type OCFRendererOptions } from "./render";
export type { ViewMode, RenderFrameResult } from "./view-modes/view-mode-controller";
export type * from "./types/ocf";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. (No DOM/WebGL needed for these tests —
`renderToCanvas` itself is exercised later, in Task 23's real-browser harness.)

- [ ] **Step 5: Commit**

```bash
git add src/render.ts src/render.test.ts src/index.ts
git commit -m "feat: add public OCFRenderer API + package entrypoint exports"
```

---

## Task 21 — Fixtures

**Files:** `src/__fixtures__/simple-cut.json`, `simple-dribble.json`,
`pass-and-screen.json`, `shoot.json`, `full-court-two-players.json`,
`custom-court.json` — small, hand-authored, schema-valid OCF documents covering
each action type individually plus one combined scenario. These back the compose
and (Task 22/23) visual tests, and double as manual-testing inputs for the example
page.

**Verify:** each fixture parses without error through `resolveFrameState` +
`composeFrame` in a quick smoke test (`src/__fixtures__/fixtures.test.ts`).

---

## Task 22 — Scene-graph snapshot tests

Beyond the per-unit structural assertions in Tasks 6–18, add whole-scene
regression coverage: compose each fixture, serialize the scene graph to a
deterministic JSON summary (name, type, position rounded to 3 decimals, per-node
child count — not full geometry dumps, which are noisy and DOM/GPU-dependent), and
snapshot it with vitest's `toMatchSnapshot()`.

**Files:** `src/scene/scene-graph-snapshot.ts` (serializer), `compose-frame.snapshot.test.ts`

```ts
// src/scene/scene-graph-snapshot.ts
import * as THREE from "three";

export function summarizeScene(obj: THREE.Object3D): unknown {
  return {
    name: obj.name || obj.type,
    type: obj.type,
    position: [round(obj.position.x), round(obj.position.y), round(obj.position.z)],
    rotationY: round(obj.rotation.y),
    children: obj.children.map(summarizeScene),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
```

**Verify:** `npx vitest run src/scene/compose-frame.snapshot.test.ts -u` on first
run to record baselines, then commit the `__snapshots__` directory. Subsequent runs
without `-u` must pass unchanged — this is the guard against unintentional
geometry/position drift in later refactors.

---

## Task 23 — Playwright visual (pixel) tests

Per the design doc's "verify against rendered images, not intuition" lesson, add a
real-browser rendering harness distinct from the DOM-less vitest structural tests.

**Files:** `examples/render-fixture.html`, `playwright.config.ts` (webServer +
project config), `tests/visual/tactical-print.spec.ts`

`examples/render-fixture.html` is a minimal page that reads a `?fixture=` query
param, `fetch()`s the matching JSON from `src/__fixtures__/`, builds an
`OCFRenderer`, and calls `renderToCanvas` into a full-viewport `<canvas>` — this is
also the "example page" referenced in Task 24, reused rather than duplicated.

```ts
// tests/visual/tactical-print.spec.ts
import { test, expect } from "@playwright/test";

const fixtures = ["simple-cut", "simple-dribble", "pass-and-screen", "shoot", "full-court-two-players", "custom-court"];

for (const fixture of fixtures) {
  test(`tactical print: ${fixture}`, async ({ page }) => {
    await page.goto(`/render-fixture.html?fixture=${fixture}`);
    await page.waitForSelector("canvas[data-rendered='true']");
    await expect(page.locator("canvas")).toHaveScreenshot(`${fixture}.png`, { maxDiffPixelRatio: 0.01 });
  });
}
```

`render-fixture.html`'s script sets `canvas.dataset.rendered = "true"` after
`renderToCanvas` returns, giving Playwright a reliable readiness signal instead of
an arbitrary timeout.

**Verify:** `npx playwright test --update-snapshots` to record baseline PNGs
(commit them), then `npx playwright test` must pass clean. **This task requires a
manual visual review round** — open the generated PNGs and confirm the picture
actually matches the agreed visual language (symbol sizes, dribble waviness,
defender arm direction, ball offset side) before committing baselines; a
pixel-perfect self-comparing snapshot proves stability, not correctness.

---

## Task 24 — Example page + README update

**Files:** `examples/index.html` (fixture picker linking to `render-fixture.html`
instances), `README.md` (update "Status" section: v1 tactical-print renderer
implemented; update "Planned" to reflect what's now real vs. still open).

**Verify:** open `examples/index.html` via `npx serve .`, visually confirm each
fixture renders correctly in a real browser — this is the human sign-off gate
before calling v1 done.

---

## Explicit non-goals (confirmed out of scope, do not build)

- Multi-frame composite / step-numbered playbook images (v1.1, per README roadmap).
- Animation / frame playback (post-v1).
- NBA/NCAA/NFHS court geometry (constants file is structured to add these later —
  `FIBA_DEFAULTS` becomes one of several rulesets — but only FIBA ships now).
- True FIBA corner-3 straight-line three-point boundary (v1 uses a constant-radius
  arc approximation — call this out to the user during Task 6 review as a visible,
  intentional simplification).
- Full JSON Schema validation of input documents (owned by `ocf-validator`; this
  renderer assumes valid input and will throw plain `Error`s on structurally
  missing data it needs, per the resolver tasks above).

## Dependency graph (for parallelizing implementation across sessions/subagents)

```
Task 0 (scaffold)
 └─ Task 1 (types)
     ├─ Task 2 (frame-state resolver)
     ├─ Task 3 (FIBA constants + named positions) ─┐
     │                                              ├─ Task 4 (CoordinateTransformer)
     ├─ Task 5 (color scheme)                       │
     └─ Task 4 depends on Task 3 ────────────────────┘
Task 4 ─┬─ Task 6 (court geometry)
        ├─ Task 7, 8, 9, 10 (entity/ball symbols — independent of each other)
        ├─ Task 11 → Task 12 (path math)
        ├─ Task 16 (action path resolver, needs Task 2 + Task 4)
        └─ Task 17 (camera, needs Task 3's dims only)
Task 12 + Task 13 (line styles) + Task 14 (arrowhead) + Task 15 (shoot glyph, needs Task 8)
 └─ Task 18 (compose, needs everything above)
     └─ Task 19 (ViewModeController) → Task 20 (public API)
         └─ Task 21 (fixtures) → Task 22 (snapshot tests) → Task 23 (visual tests) → Task 24 (examples/README)
```

Tasks 7–10 and 11–15 are internally parallelizable (independent files); Task 18 is
the integration point and should be done by whoever has the most context on the
whole plan, not delegated blind.
