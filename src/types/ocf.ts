/**
 * Public OCF types used throughout the renderer.
 *
 * These are pure re-exports/aliases of the generated types in
 * `ocf.generated.ts` (itself produced from the canonical schema — see
 * scripts/generate-ocf-types.mjs). This file exists only so the rest of the
 * codebase can keep using the names it already had (`OcfDocument`,
 * `entityRef()`, etc.) without a repo-wide rename, and so we have exactly one
 * place to note the (small, deliberate) renames between the schema's naming
 * and the renderer's internal naming.
 *
 * Rule: this file may rename and re-export. It must never redeclare a shape
 * that already exists in ocf.generated.ts — if you find yourself writing a
 * `{ ... }` object type here, that belongs in the schema, not here.
 */
import type {
  OpenCoachingFormat,
  Entity as GeneratedEntity,
  EntityOffense,
  EntityDefense,
  Frame as GeneratedFrame,
  Action as GeneratedAction,
  Ball as GeneratedBall,
  BallState as GeneratedBallState,
  Coordinate as GeneratedCoordinate,
  ColorScheme as GeneratedColorScheme,
  State,
  Ruleset,
  Unit,
  Area,
  Label,
} from "./ocf.generated";

// The schema's root type is named `OpenCoachingFormat`; the renderer's public
// API (OCFRenderer.renderToCanvas(doc: OcfDocument, ...)) predates the
// generated types and used `OcfDocument`. Alias rather than rename the public
// API — renaming is a breaking change for any existing renderer consumer.
export type OcfDocument = OpenCoachingFormat;

export type Entity = GeneratedEntity;
export type Frame = GeneratedFrame;
export type Action = GeneratedAction;
export type Ball = GeneratedBall;
export type BallState = GeneratedBallState;
export type Coordinate = GeneratedCoordinate;
export type ColorScheme = GeneratedColorScheme;
export type { Ruleset, Unit, Area, Label };

// Not top-level named types in the schema — derived via indexed access
// rather than redeclared, per this file's no-hand-shapes rule.
export type Court = OpenCoachingFormat["court"];
export type CourtType = Court["type"];
export type FrameState = State;

/** The semantic color role entities/areas carry; resolved to hex via ColorScheme. */
export type ColorRole = NonNullable<EntityOffense["color"]>;

/**
 * Derives the schema's entity_ref string (e.g. "offense_1", "coach") from an
 * Entity. Unchanged from the pre-codegen implementation — this is renderer
 * logic, not schema-derived data, so it stays hand-written.
 */
export function entityRef(entity: Entity): string {
  return entity.type === "coach" ? "coach" : `${entity.type}_${(entity as EntityOffense | EntityDefense).nr}`;
}
