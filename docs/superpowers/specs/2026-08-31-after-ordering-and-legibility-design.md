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
- **A pass lands where the receiver is WHEN IT ARRIVES**, keyed off the
  receiver's first action in the frame (see "Pass target" below): their START
  position if their first action needs the ball or they have no action; the END
  of their last no-ball run if they run first. This REVERSES the earlier
  "always frame-end" decision and refines the interim "always start" idea.
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

### Possession invariant

A player either holds the ball or does not. With the ball a player may ONLY
`dribble`, `pass`, or `shoot` (a handover is `type: "pass", variant: "hand_off"`
— just a pass, so it needs no special handling). `move`/`cut` (running) is only
for a player WITHOUT the ball. The renderer assumes this holds (the validator
enforces it) and draws whatever is declared.

Ball-requiring actions: `dribble`, `pass`, `shoot`. No-ball actions: `move`,
`cut` (the ones that draw a running path). `pickup`/`rebound` gain the ball
without a path.

### Pass target — where the receiver catches

The ball is caught where the receiver is WHEN IT ARRIVES. Because a player
cannot run while holding the ball, this is determined by the receiver's action
sequence in the frame (in `after` order):

1. If the receiver's FIRST action is a **ball-requiring** action (dribble / pass
   / shoot) — they act as if already in possession — OR the receiver has **no
   action** in the frame: the pass lands at the receiver's **start position**
   (their base-alignment / previous-frame position). They catch, then may
   immediately dribble/pass/shoot from there.
2. If the receiver's first action(s) are **no-ball** actions (move/cut): the
   pass lands at the **endpoint of the receiver's last consecutive no-ball
   action** before their first ball-requiring action. They finish running,
   arrive, then catch. Covers any number of chained no-ball actions.

After catching, the receiver's ball cursor sits at the catch point, so a
follow-up dribble/pass by the receiver chains from there (relay continues).

### Symbol de-overlap

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
  `orderFrameActions` before walking; compute each pass's `endOverride` by the
  "Pass target" rule (inspect the receiver's ordered actions to decide start
  position vs. end-of-last-no-ball-run); expose a per-action `conflict` flag on
  `AnchoredAction`. This replaces the interim "pass → receiver frame-end" logic.
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
4. Pass target — receiver's first action is ball-requiring → **start** position.
5. Pass target — receiver has no action in the frame → **start** position.
6. Pass target — receiver runs first (move/cut, possibly chained) → **end of the
   last no-ball run** before their first ball action.
7. `separateOverlappingSymbols`: two coincident symbols end ≥ threshold apart;
   a non-overlapping pair is untouched; displacement is symmetric.
8. Arrowhead: new length constant; tip still flat in XZ (y≈0).
9. compose-frame: a conflicting action renders with the red material.

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
