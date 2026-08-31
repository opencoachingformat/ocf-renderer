# `after`-Ordering, Pass-to-Start & Legibility — Design

**Date:** 2026-08-31
**Component:** ocf-renderer
**Status:** Approved (design), pending implementation plan
**Builds on:** 2026-08-31-sequential-action-resolution-design.md

## Problem

Three issues remain after the sequential-action-resolution work:

1. **`after` is ignored.** The schema gives every action an optional `after`
   field (`action_ref`, e.g. `"offense_2.dribble"`) declaring "this action
   begins after that one." Fixtures are authored with these chains. The resolver
   walks `frame.actions[]` in document order and ignores `after`, mis-sequencing
   the possession relay. Combined with the earlier "pass lands at receiver's
   frame-end" rule, this produces a **pass into empty space**: in 3-man-weave
   frame 2, the ball is passed to a receiver whose `end_state` moved but who has
   no drawn action, so the pass ends where nothing is shown.

2. **Arrowheads too small.** `ARROWHEAD_LENGTH_M = 0.25` court units renders
   nearly invisible at the default zoom; direction of travel is unclear.

3. **Players overlap.** Two entities at nearly the same spot (e.g. #1/#4 in
   pick-and-roll) render as coincident circles, unreadable.

## Decisions (from brainstorming)

- **Respect `after`** via topological ordering — smallest change, uses the
  existing schema field, no schema change.
- **A pass lands at the receiver's START position** (where they currently
  stand), not their frame-end. A player catches where they are, then moves next
  frame. This REVERSES the earlier sequential-resolution decision (pass → end).
- **Broken/cyclic `after` → soft fallback to document order, with the
  conflicting action(s) drawn highlighted in red** (plus a console warning). The
  renderer never crashes on a bad document; it makes the problem visible.
- **Overlapping symbols are automatically nudged apart for display only** (data
  unchanged). The nudged display positions are used for BOTH symbol placement
  AND path anchoring, so lines still start from the displayed symbol center.
- Bigger arrowheads.

## Model

### Action ordering

`action_ref` format: `"<entity_ref>.<action_type>"` (schema pattern). Within a
frame, an action with `after: X` depends on the action whose ref equals `X`
(built from that action's `player` + `type`).

`orderFrameActions(actions)` returns:
- `ordered`: the actions topologically sorted so every action follows its
  `after` dependency. Actions without `after`, and ties, preserve document order
  (stable).
- `conflicts`: the set of actions involved in a cycle or referencing a
  non-existent action. These are excluded from ordering constraints (their edges
  are dropped) and flagged for red rendering.

Cycle/dangling handling is soft: drop the offending edge, keep going, flag the
action. Never throw.

### Possession relay (unchanged except pass target)

The relay from the prior design still holds — walk actions (now in `after`
order), maintain an entity cursor and a ball cursor. The ONE change: a pass's
`endOverride` is the receiver's **start** position, not end.

### Symbol de-overlap

`separateOverlappingSymbols(positions, radius, margin)` runs a short relaxation:
for every pair of entity display positions closer than `2*radius + margin`, push
both apart symmetrically along the line between their centers until they clear.
A few iterations settle clusters of 3+. Returns a `Map<ref, Vector3>` of display
positions. Entities that don't overlap are returned unchanged.

The result feeds both symbol placement and the anchor seeds, so action paths
begin at the displayed (nudged) symbol center.

### Arrowheads

`ARROWHEAD_LENGTH_M` increases from 0.25 to ~0.6 court units, width
proportional, keeping the flat-triangle-in-XZ construction (always faces the
top-down camera). `trimPathEnd`'s pull-back distance scales with the new length
so the head sits at the path end without overshooting the target symbol.

## Architecture

- **Create `src/actions/order-actions.ts`** (pure): `orderFrameActions`. Graph
  build + topological sort + cycle/dangling detection. No three.js.
- **Create `src/entities/separate-overlapping.ts`** (pure):
  `separateOverlappingSymbols`. Vector3 math only, no scene.
- **Modify `src/actions/frame-action-anchors.ts`**: order actions via
  `orderFrameActions` before walking; seed pass endpoints from START state
  (revert endState pass lookup); expose a per-action `conflict` flag on
  `AnchoredAction`.
- **Modify `src/actions/arrowhead.ts`**: bigger length constant; trim scales.
- **Modify `src/scene/compose-frame.ts`**: compute display positions via
  `separateOverlappingSymbols`; use them for symbols AND anchoring; when an
  action is flagged as a conflict, render ALL of its glyphs (path line AND
  arrowhead) with `colors.red` instead of the normal offense fill.

## Error handling

- Cyclic or dangling `after`: soft fallback (drop edge), flag action, draw red,
  `console.warn`. No throw.
- De-overlap is best-effort; if it cannot fully separate a dense cluster within
  its iteration cap, it leaves the best-so-far positions (still an improvement).

## Testing

Pure unit tests:
1. `orderFrameActions`: `dribble → pass → cut` via `after` returns that order
   regardless of document order.
2. Cycle (`A after B`, `B after A`) → both flagged, no throw, doc-order fallback.
3. Dangling `after` (missing target) → that action flagged.
4. Pass target = receiver **start** position.
5. `separateOverlappingSymbols`: two coincident symbols end ≥ threshold apart;
   a non-overlapping pair is untouched; displacement is symmetric.
6. Arrowhead: new length constant; tip still flat in XZ (y≈0).
7. compose-frame: a conflicting action renders with the red material.

Visual regression: re-render 3-man-weave (all 4 frames), pick-and-roll (overlap
frame), transition; full-gallery smoke test; regenerate snapshots.

## Scope boundary (YAGNI)

In scope: `after` ordering, pass-to-start, red-highlight conflicts, bigger
arrowheads, symbol de-overlap. Out of scope, tracked separately: shoot glyph,
custom-court 3pt corners, screen glyph polish.

## No schema change

`after` already exists in the schema (`action_ref` on every action). This is a
renderer interpretation change. The possession-invariant spec-prose + validator
follow-up still stands; additionally, the validator's R1 blocker (unimplemented
`after`-ordering, risking a false BALL_CARRIER_MISMATCH) can reuse the ordering
logic designed here.
