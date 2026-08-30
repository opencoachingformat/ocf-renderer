# Sequential Action Resolution — Design

**Date:** 2026-08-31
**Component:** ocf-renderer
**Status:** Approved (design), pending implementation plan

## Problem

The renderer anchors every action's path at the acting player's **frame-start**
position. When a player performs multiple actions in one frame — e.g. dribble
A→B then pass B→C, or dribble→pass→run — all of those paths are drawn from the
same origin (A). Passes also target the receiver's *start* position rather than
where the receiver ends up.

Visible symptoms in the fixtures:

- **3-man-weave:** `offense_1` has both a `pass` (to `offense_2`) and a `cut` in
  the same frame; both are drawn starting from `offense_1`'s start point, so it
  reads as the player passing and cutting *simultaneously* from one spot.
- **transition-3v2:** path starts don't sit cleanly relative to the players'
  motion.
- **pick-and-roll:** a dribble that should continue from a prior position starts
  from the wrong origin.

## Governing model: the possession relay

A player either holds the ball or does not, at any instant:

- **Has the ball → covers ground only by `dribble`.** No `move`/`cut` while in
  possession.
- **No ball → `move`/`cut` (runs);** the ball reaches them via `pass` (later:
  handoff), `pickup`, or `rebound`.

So a player's actions within a frame form a non-overlapping relay:

```
run (no ball) → [receive pass | pickup loose ball | rebound miss]
             → has ball → dribble → [pass | shoot] → no ball → run → …
```

There is never a run and a dribble competing from the same origin, because
possession forbids it.

The renderer **assumes** this invariant holds (enforcing it is the validator's
job — see follow-up) and simply draws the relay. If it observes a `move`/`cut`
by the current ball-holder, it may emit a console warning but still draws the
action as declared; it does not try to reconcile the document.

### Ball-possession / position drivers

| Action    | Effect on ball                                  | Draws a path? |
|-----------|-------------------------------------------------|---------------|
| `dribble` | carrier keeps ball, moves it along the path     | yes (wavy)    |
| `pass`    | ball leaves passer → receiver                   | yes (dashed)  |
| `pickup`  | player gains a loose ball off the floor         | no            |
| `rebound` | player grabs the ball after a missed shot       | no            |
| `shoot`   | ball leaves shooter toward the basket           | glyph (sep.)  |

`pickup` and `rebound` change possession/position but draw **no** movement path.
They must still advance the ball cursor so a following `dribble` starts from the
right place.

## Resolution rules

Walk `frame.actions[]` **in document order**, maintaining two cursors:

- `entityCursor: Record<ref, Vector3>` — seeded from each entity's frame-start
  position; advanced to an action's final destination after that action is
  processed.
- `ballCursor: { holder: ref | null, pos: Vector3 }` — driven by the
  possession drivers above.

For each action:

1. Its path **starts** at `entityCursor[player]` (its previous action's
   endpoint), **not** the frame-start position.
2. After processing, `entityCursor[player]` advances to that action's
   destination.

**Passes** are special:

- Start at `entityCursor[passer]`.
- **End at the receiver's frame-END position** — always, regardless of where the
  `pass` sits relative to the receiver's `move` in the action list. Rationale:
  a player cannot run while holding the ball, so the receiver must finish
  running *before* catching; the ball is therefore caught where the receiver
  finishes the frame. After catching, the receiver may `dribble` onward from
  that point (their cursor is already there).

## Architecture

### New unit: frame possession/position resolver

A **pure** function (no three.js scene, no DOM) that takes a frame's ordered
actions plus the resolved start/end states and returns, for each action, its
resolved start point and (for passes) resolved end point:

```
resolveFrameActionAnchors(
  actions: Action[],
  startState: ResolvedFrameState,
  endState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): Array<{ action: Action; startOverride: Vector3; endOverride?: Vector3 }>
```

It owns the two cursors and the possession relay. Because it is pure and
three.js-free, it is unit-tested directly by asserting the cursor sequence.

`startState` / `endState` are `resolveFrameState(doc, frameIndex, "start")` and
`resolveFrameState(doc, frameIndex, "end")` respectively — the existing frame
resolver already exposes both. `entityCursor` is seeded from `startState`;
pass endpoints read from `endState`.

### Changes to existing units

- **`resolveActionPath`** gains optional `startOverride` / `endOverride`
  parameters. When present, they replace the `entityWorldPos(startState, …)`
  lookups. Backward-compatible: absent overrides preserve current behaviour.
- **`compose-frame`** calls the new resolver once per frame, then passes each
  action's overrides into `resolveActionPath`. Scene assembly is otherwise
  unchanged. `pickup`/`rebound` continue to draw nothing.

`avoidCollisions` runs afterwards, unchanged.

### around_player apex hook (in scope)

`around_player` runs after start/end resolution. Correcting the start origin
improves it, but the apex geometry itself can still produce an "up-then-down"
hook: when the obstacle sits roughly between the (now correct) start and a
destination on the same side, the approach/apex/exit waypoints backtrack instead
of arcing cleanly around the player.

This fix is **in scope**. The apex-geometry correction:

- Places the apex beside the obstacle on the chosen side (unchanged intent).
- Derives approach/exit points by projecting along the **start→destination
  heading**, not the raw `current→apex` / `apex→destination` legs, so the detour
  never doubles back past its own start or overshoots the destination.
- Clamps the ease nudge so short legs cannot invert the path direction.

Verification: `pick-and-roll` frame 1 dribble (`around_player: defense_1`) must
trace a monotonic-ish arc from start to destination with no reversal in the
dominant travel direction.

## Testing

Pure unit tests on the resolver (no DOM):

1. **Chaining:** dribble A→B then pass B→C → dribble starts at A, pass starts
   at B.
2. **Dribble→pass→run:** trailing run starts where the pass left the player (B).
3. **Pass target = receiver frame-end:** receiver runs start→end and is passed
   to → pass ends at receiver's end point, independent of action order.
4. **Receiver dribbles after catch:** post-pass dribble starts at the catch
   point (receiver's end position).
5. **pickup / rebound:** transfer possession without drawing a path; a following
   dribble by that player starts at the pickup/rebound point.
6. **Invariant assumed, not enforced:** a move/cut by the current ball-holder
   still renders as declared (optional console warning), no crash.
7. **around_player arc is monotonic:** for a dribble with `around_player`, the
   resolved path's projection onto the start→destination heading is
   non-decreasing (no backtracking / up-then-down hook).

Visual regression via the screenshot harness: re-render `3-man-weave`,
`transition-3v2`, `pick-and-roll` (all frames), plus a full-gallery smoke test.

## Scope boundary (YAGNI)

This change covers **path anchoring, possession chaining, and the
`around_player` apex hook**. Out of scope, tracked separately:

- shoot glyph (a real shot notation, not the reused defender glyph)
- custom-court 3-point corner segments
- screen glyph polish

## No schema / spec change

No JSON-schema change: every field the resolver needs already exists
(ordered `frame.actions[]`, action `player`/`to_player`/`moves[].to`, entity/ball
positions, `end_state`). The possession invariant and sequencing semantics are
**constraints on validity**, not new data.

**Follow-up (after this fix, separate PR):** document the possession invariant,
sequential-action semantics, and pass-reception rule in the spec *prose*, then
add corresponding **validator** rules (reject a move/cut by the current
ball-holder). Renderer relies on these being enforced upstream.
