# Source-faithful four-frame play comparison

**Status:** Approved design
**Date:** 2026-08-12

## Goal

Keep the existing `continuous-ball-screen.json` fixture unchanged as the first interpretation of the supplied coaching description, and add a separate four-frame fixture that follows the supplied four-panel source image. Render both through the existing tactical-print renderer and make the outputs easy to compare with the source image.

## Source sequence

The new fixture contains exactly four frames:

1. Point guard 1 passes to shooting guard 2 on the right wing, then cuts through to the strong-side right corner. Center 5 moves into an inside ball screen for 2.
2. Shooting guard 2 uses the screen and penetrates toward the paint. Center 5 rolls toward the baseline. Point guard 1 lifts from the corner. Players 3 and 4 remain spaced on the weak side.
3. Shooting guard 2 passes to small forward 3 on the left wing and cuts through to the left corner. Power forward 4 moves into an inside ball screen for 3.
4. Small forward 3 dribbles around the screen into the paint. Power forward 4 rolls. Players 2 and 1 remain spaced on the left and right sides.

The source image has five offensive players and no defenders. The fixture will therefore not invent defender entities.

## OCF fixture

Add a distinct fixture named `source-four-frame-ball-screen.json` under `src/__fixtures__/`. It uses:

- five offense entities numbered 1–5;
- one carried ball;
- four frames with explicit labels and descriptions;
- named positions for stable landmarks such as wings, corners, blocks, and the top of the key;
- free coordinates for screen locations, penetration points, and curved-path control anchors;
- `pass`, `cut`, `move`, `screen`, and `dribble` actions;
- frame end states matching the action endpoints and ball carrier after each frame.

The original `continuous-ball-screen.json` remains untouched by this feature.

## Around-player path behavior

`MoveStep.around_player` is currently accepted by the types but ignored by path resolution. Implement the smallest useful behavior for this comparison:

1. When a move step has `around_player`, resolve that player's start position from the frame state.
2. Resolve the move step's destination.
3. Insert one deterministic lateral waypoint outside the obstacle radius plus margin before the destination.
4. Choose the waypoint side from the start-to-destination direction and the obstacle position; use a stable tie-breaker for collinear cases.
5. Return the resulting anchors to the existing Catmull-Rom and arc-length pipeline.
6. If the referenced player cannot be resolved, throw a descriptive error naming the reference.

This behavior applies to moving and cutting actions because both use `MoveStep`. It does not attempt time-based simulation of moving obstacles. A player moved by another action in the same frame is treated at the frame's start position for routing, making the behavior deterministic and explicitly limited.

The generated waypoint must be outside the obstacle's symbol radius plus the existing collision margin. The existing collision-avoidance pass remains active after waypoint insertion.

## Tests

Add or extend tests to cover:

- `around_player` inserts an intermediate waypoint for a move/cut path;
- the waypoint and resulting sampled path clear the referenced player's obstacle radius plus margin;
- clockwise/counterclockwise selection is deterministic;
- an unknown `around_player` reference throws a descriptive error;
- the new fixture validates with the checked-in OCF validator;
- the new fixture composes all four frames without throwing;
- the existing `continuous-ball-screen.json` remains available and unchanged in meaning.

## Comparison output

Extend the local example index with the new fixture. The existing frame navigation is reused so each of the four frames can be opened independently. The comparison is manual and visual:

- supplied source image: four panels;
- existing interpretation: `continuous-ball-screen.json`;
- source-faithful interpretation: `source-four-frame-ball-screen.json`.

The implementation should make it possible to compare corresponding frames at the same canvas dimensions. Pixel snapshots are useful for regression, but visual correctness is judged against the supplied source image rather than by self-comparison alone.

## Out of scope

- Replacing or rewriting the original fixture;
- adding defenders that are absent from the source image;
- modeling shot branches or every textual scoring option in the description;
- time-based movement of players while another player routes around them;
- redesigning the renderer's court style or symbol language;
- implementing a general-purpose path planner beyond the single deterministic `around_player` waypoint.
