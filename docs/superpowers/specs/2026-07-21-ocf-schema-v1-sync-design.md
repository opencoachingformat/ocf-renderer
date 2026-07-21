# OCF Schema v1 Sync — Design

**Status:** Approved (brainstorming complete)
**Date:** 2026-07-21
**Depends on:** `opencoachingformat/spec`, specifically
`ocf-repo/schema/v1.json` and `ocf-repo/docs/specification-v1.adoc` (sibling
repo on disk, not vendored here).
**Precedes:** a follow-up `coaching_animation` design (paused mid-brainstorm to
do this project first — see §7).

---

## 1. Purpose

While brainstorming a `coaching_animation` feature, we discovered the vendored
OCF types in `src/types/ocf.ts` have drifted from the current upstream v1
schema in ways well beyond what animation needs. Every existing fixture in
`src/__fixtures__/` is not actually a valid OCF v1 document. This project
corrects the vendored type/parser/scene layer to match the real schema, so
that:

- Existing and future fixtures are genuinely spec-compliant.
- The `coaching_animation` project (next) can build on `intensity` fields that
  actually exist in the type system.

This is a **data-shape migration, not a rendering-logic change**. Every play
already renders with correct real-world coordinates; only the field names,
container shapes, and id formats around that data are wrong today.

---

## 2. What's actually different (confirmed against `v1.json`)

| Area | Vendored today | Real schema |
|---|---|---|
| Top level | no `meta` | `meta: { id, title }` required |
| Entity id | free-form `id: string` | no `id` field at all — ref is derived from `type` + `nr`, e.g. `offense_1`, `defense_1`, `coach` (singleton), `cone_3`, `station_2` |
| Ball | single `ball?: BallState` field | top-level `balls: Ball[]` (initial state), each `{ id: ball_ref, carried_by \| at \| dead }` — supports multiple balls |
| Frame state | `{ entities: EntityState[] }` | flat map: `{ [entity_ref]: Coordinate, balls?: { [ball_ref]: BallState } }` |
| Action player fields | `entity_ref`, `to_entity_ref` | `player`, `to_player`, `for_player` (screen), `guards_player` (defend) |
| `hand_off` | separate action type | removed — becomes `pass` with `variant: "hand_off"` |
| New action types | — | `defend`, `rebound`, `pickup` |
| Intensity | — | `intensity` field on move/cut/dribble (enum `movement_intensity`: slow/normal/fast/explosive) and on pass/shoot (enum `ball_intensity`: soft/normal/hard/bullet) |
| Variant | — | enum per action type (cut: backdoor/give_and_go/flash/v_cut/l_cut/curl/flare/fade/basket; pass: chest/bounce/overhead/lob/baseball/hand_off/outlet; shoot: jumper/three/layup/floater/dunk/hook/free_throw; screen: ball_screen/back_screen/down_screen/flare_screen/cross_screen/pin_down; defend: on_ball/deny/help/hedge/switch/box_out; rebound: offensive/defensive) |
| Physicality | — | enum (passive/normal/aggressive/hard) on screen/defend/rebound/pickup |
| Sequencing | — | `after`/`with` (`action_ref`), `on_catch` (bool) on every action |
| Move steps | `{ to: Coordinate }` | `{ variant?, to?, around_player?, off_screen_by?, intensity? }` — `to` omitted means "move on the spot" |
| Screen action | `{ entity_ref, at }` | `{ player, for_player (required), on_player?, at?, variant?, physicality? }` |
| `frame.duration_ms` | — | present but schema-marked **deprecated**, "use per-action intensity instead" |
| `frame.branches` | — | present, outcome-keyed non-linear structure |

---

## 3. Scope decisions (confirmed)

- **New action types (`defend`/`rebound`/`pickup`):** type/parser support only.
  `composeFrame` skips drawing them — same "acknowledged, not built" pattern
  already used for `coaching_animation` itself. No glyph design in this
  project.
- **Multiple balls:** rendered generically. `composeFrame` iterates the
  resolved `balls` map and draws every ball (carried/loose/dead), not just
  one. Not extra work — we're already rewriting ball handling to match the
  map shape.
- **Entity ref format:** no redundant stored `type`/`id` field anywhere refs
  are used. A helper `entityRef(entity)` derives `${type}_${nr}` (or `"coach"`
  for the coach singleton) directly from the schema's own `type`+`nr` fields,
  matching the schema exactly (which itself has no `id` on entity objects).
- **All new optional action fields** (`intensity`, `variant`, `physicality`,
  `after`, `with`, `on_catch`, and `move_step`'s `variant`/`around_player`/
  `off_screen_by`/`intensity`) are added to the types and parsed now, even
  though nothing renders differently based on them yet — avoids a second
  incomplete migration once `coaching_animation` needs `intensity`, and
  `for_player` is schema-required for `screen` regardless.
- **No runtime JSON-schema validation** (e.g. ajv) added. Unchanged design
  principle: "validate → render" is the intended external pipeline; this
  module does structural reading, not full validation.
- **`branches`** parsed into the `Frame` type as an unused structural field.
  No branch-traversal logic — frames are still consumed by plain index, as
  today.
- **`duration_ms`** parsed for completeness, unused (matches the schema's own
  deprecation guidance).

---

## 4. New vendored types (`src/types/ocf.ts`)

```typescript
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

export interface Meta {
  id: string;
  title: string;
}

export interface NamedCoordinate { named: string; }
export interface RelativeCoordinate { relative_to: string; dx: number; dy: number; }
export interface FreeCoordinate { x: number; y: number; }
export type Coordinate = NamedCoordinate | RelativeCoordinate | FreeCoordinate;

export type ColorRole =
  | "offense" | "defense" | "black" | "grey" | "yellow" | "green" | "red" | "blue" | "white";

// Entities — no `id` field; ref is derived via entityRef() from type(+nr).
export interface OffenseEntity {
  type: "offense";
  nr: number; // 1-9
  x: number;
  y: number;
  rotation?: number;
  color?: ColorRole;
  label?: string;
}
export interface DefenseEntity {
  type: "defense";
  nr: number; // 1-9
  x: number;
  y: number;
  rotation?: number;
  color?: ColorRole;
  label?: string;
}
export interface CoachEntity {
  type: "coach";
  x: number;
  y: number;
}
export interface ConeEntity {
  type: "cone";
  nr: number;
  x: number;
  y: number;
}
export interface StationEntity {
  type: "station";
  nr: number;
  label?: string;
  x: number;
  y: number;
}
export type Entity = OffenseEntity | DefenseEntity | CoachEntity | ConeEntity | StationEntity;

/** Derives the schema's entity_ref string (e.g. "offense_1", "coach") from an Entity. */
export function entityRef(entity: Entity): string {
  return entity.type === "coach" ? "coach" : `${entity.type}_${entity.nr}`;
}

export type BallState =
  | { carried_by: string }
  | { at: Coordinate }
  | { dead: true };

export interface Ball {
  id: string; // ball_ref, e.g. "ball_1"
  // exactly one of carried_by / at / dead is present, same union as BallState:
  carried_by?: string;
  at?: Coordinate;
  dead?: true;
}

// Flat state map: entity_ref -> Coordinate, plus a reserved `balls` key.
export interface FrameState {
  balls?: Record<string, BallState>;
  [entityRef: string]: Coordinate | Record<string, BallState> | undefined;
}

export type MovementIntensity = "slow" | "normal" | "fast" | "explosive";
export type BallIntensity = "soft" | "normal" | "hard" | "bullet";
export type Physicality = "passive" | "normal" | "aggressive" | "hard";

export interface MoveStep {
  variant?: string;
  to?: Coordinate; // omitted = move on the spot
  around_player?: string;
  off_screen_by?: string;
  intensity?: MovementIntensity; // overrides the action-level intensity for this step
}

export type CutVariant =
  | "backdoor" | "give_and_go" | "flash" | "v_cut" | "l_cut" | "curl" | "flare" | "fade" | "basket";
export type PassVariant =
  | "chest" | "bounce" | "overhead" | "lob" | "baseball" | "hand_off" | "outlet";
export type ShootVariant =
  | "jumper" | "three" | "layup" | "floater" | "dunk" | "hook" | "free_throw";
export type ScreenVariant =
  | "ball_screen" | "back_screen" | "down_screen" | "flare_screen" | "cross_screen" | "pin_down";
export type DefendVariant = "on_ball" | "deny" | "help" | "hedge" | "switch" | "box_out";
export type ReboundVariant = "offensive" | "defensive";

interface ActionCommon {
  player: string; // entity_ref
  tags?: string[];
  after?: string; // action_ref
  with?: string; // action_ref
  on_catch?: boolean;
}

export type Action =
  | (ActionCommon & { type: "move"; moves: MoveStep[]; intensity?: MovementIntensity })
  | (ActionCommon & { type: "cut"; moves: MoveStep[]; variant?: CutVariant; around_player?: string; off_screen_by?: string; intensity?: MovementIntensity })
  | (ActionCommon & { type: "dribble"; moves: MoveStep[]; ball_id?: string; intensity?: MovementIntensity })
  | (ActionCommon & { type: "pass"; to_player: string; ball_id?: string; variant?: PassVariant; intensity?: BallIntensity })
  | (ActionCommon & { type: "shoot"; ball_id?: string; variant?: ShootVariant; result?: "make" | "miss"; intensity?: BallIntensity })
  | (ActionCommon & { type: "screen"; for_player: string; on_player?: string; at?: Coordinate; variant?: ScreenVariant; physicality?: Physicality })
  | (ActionCommon & { type: "defend"; guards_player: string; variant?: DefendVariant; physicality?: Physicality })
  | (ActionCommon & { type: "rebound"; ball_id?: string; variant?: ReboundVariant; physicality?: Physicality })
  | (ActionCommon & { type: "pickup"; ball_id: string; physicality?: Physicality });

export interface Frame {
  id: string;
  label?: string;
  description?: string;
  duration_ms?: number; // deprecated upstream; parsed, unused
  start_state?: FrameState;
  actions: Action[];
  end_state: FrameState;
  branches?: Record<string, unknown>; // unused structural field, no traversal logic
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
  meta: Meta;
  court: Court;
  entities: Entity[];
  balls?: Ball[];
  frames: Frame[];
  color_scheme?: ColorScheme;
}
```

Notes:
- `entity_ref`/`ball_ref` stay as plain `string` in TypeScript (the schema's
  regex patterns aren't worth encoding as template-literal types here — no
  existing code relied on literal-typed refs).
- `FrameState`'s index signature is the pragmatic TS shape for "a map keyed by
  dynamic entity refs, plus one reserved `balls` key" — matches the schema's
  `patternProperties` + `properties.balls` structure.

---

## 5. Parser & scene changes

- **`resolveFrameState`**: walks frames the same way (start defaults to the
  previous frame's `end_state`), but merges flat `FrameState` maps (entity_ref
  → Coordinate, plus `balls` sub-map merge) instead of concatenating
  `EntityState[]` arrays.
- **`composeFrame`**:
  - Iterates `doc.entities`, computing `entityRef(entity)` to look up each
    entity's resolved position in the frame state map (replaces the old
    `startState.entities.find(...)` array scan).
  - Resolves `doc.balls` (defaulted to `[]` if absent) merged with the current
    frame's `state.balls` overrides, and draws **every** ball via the existing
    carried/loose logic, looping instead of handling one `ball` field.
  - `dead` balls are not drawn (no obstacle, no symbol) — a new lifecycle
    state that didn't exist before.
  - Action handling: `entity_ref` → `player`, `to_entity_ref` → `to_player`
    everywhere. The `action.type === "pass" || action.type === "hand_off"`
    branch collapses to just `action.type === "pass"` (hand-off is now
    `variant: "hand_off"` on a pass — same dashed-line rendering, variant is
    parsed but not yet used to change the visual).
  - `screen` rendering: still draws `player` → `at` when `at` is present (as
    today). If `at` is absent, `for_player`'s *current* resolved position is
    used as the screen location (the natural reading of "set a screen for
    that player" when no explicit spot is given) — this is a new fallback,
    not present before, needed because `at` is now optional.
  - `defend`/`rebound`/`pickup` actions are recognized (parsed) but skip
    silently in `composeFrame`'s action loop — no draw call.
- **`resolveActionPath`**: same `entity_ref`→`player`, `to_entity_ref`→
  `to_player` field renames; no structural changes.
- **`coordinate-transformer.ts`**: unchanged — only consumes `Coordinate`,
  which is unchanged.

---

## 6. Fixture migration & testing

- All 8 fixtures (`simple-cut`, `simple-dribble`, `pass-and-screen`, `shoot`,
  `full-court-two-players`, `custom-court`, `pick-and-roll`, plus any others)
  rewritten field-by-field to the new shape. Same real-world coordinates
  throughout — this is a reshape, not a redesign of any play.
- Each fixture gains a `meta: { id, title }` block.
- `hand_off`-using fixtures (if any) become `{ type: "pass", variant:
  "hand_off", ... }`.
- `fixtures.test.ts` and any other test importing the old shape updated for
  new imports/types; test logic (iterate every frame, assert no throw)
  unchanged.
- Playwright visual baselines (`tests/visual/tactical-print.spec.ts-snapshots/
  *.png`) regenerated via `--update-snapshots` and manually re-reviewed via
  browser screenshot. Expectation: **zero visual diff**, since coordinates
  are unchanged — this is a safety check, not an anticipated change.
- New unit tests added for previously-untested new logic:
  - Multi-ball rendering: a frame with 2 balls (e.g. one carried, one dead)
    renders both/skips the dead one correctly.
  - `entityRef()` derivation: offense/defense (`type_nr`), coach (bare
    `"coach"`), cone/station (`type_nr`).
  - Screen fallback: `at` omitted resolves to `for_player`'s position.

---

## 7. Out of scope (deferred)

- Visual rendering for `defend`/`rebound`/`pickup` — no glyphs designed yet.
- `variant`-based visual differentiation for any action (already a listed
  Roadmap item, e.g. shot-type glyphs) — types now carry `variant`, but
  rendering doesn't yet branch on it.
- `branches` traversal/playback logic.
- Using `intensity` (movement or ball) for anything — this becomes
  load-bearing in the `coaching_animation` project, which resumes immediately
  after this one, now unblocked since the field will actually exist.
- `coaching_animation` itself (paused mid-brainstorm — resumes after this
  project's plan is implemented).

---

## 8. Testing summary

- `tsc --noEmit` clean.
- `vitest` — all fixture/unit tests updated and passing, plus the 3 new tests
  from §6.
- `npx playwright test` — all visual regression tests passing against
  regenerated, manually-reviewed baselines.
- `npm run build` clean.
