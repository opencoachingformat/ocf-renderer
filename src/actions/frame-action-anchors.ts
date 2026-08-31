import * as THREE from "three";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { entityWorldPos } from "./resolve-action-path";
import { orderFrameActions } from "./order-actions";

/** An action plus the world-space points the renderer should draw it between.
 *  `startOverride` replaces the acting player's frame-start position;
 *  `endOverride` (passes only) replaces the target lookup. */
export interface AnchoredAction {
  action: Action;
  startOverride: THREE.Vector3;
  endOverride?: THREE.Vector3;
  /** True when this action is part of a broken/cyclic `after` chain — the
   *  renderer draws it highlighted. */
  conflict: boolean;
}

/** Who holds a ball and where it is, in world space. `holder` is null when the
 *  ball is loose (on the floor or in flight toward the basket). */
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
  displayPositions?: Map<string, THREE.Vector3>,
): THREE.Vector3 {
  const startPos = (): THREE.Vector3 =>
    displayPositions?.get(receiver)?.clone() ?? entityWorldPos(startState, receiver, transformer);

  const receiverActions = orderedActions.filter((a) => a.player === receiver);
  const first = receiverActions[0];
  if (!first || BALL_REQUIRING.has(first.type)) {
    return startPos();
  }
  // Runs first: walk the leading run of no-ball actions, tracking the last
  // destination, until a ball-requiring action (or the end of the list).
  let catchPoint = startPos();
  for (const a of receiverActions) {
    if (BALL_REQUIRING.has(a.type)) break;
    if (NO_BALL_RUN.has(a.type)) {
      const dest = lastDestination(a as Extract<Action, { moves: unknown }>, transformer);
      if (dest) catchPoint = dest;
    }
  }
  return catchPoint;
}

/** Walk a frame's actions in order, chaining each action's start point to the
 *  acting player's previous action endpoint (the "possession relay"), and
 *  tracking ball possession through pass/dribble/pickup/rebound/shoot. See
 *  docs/superpowers/specs/2026-08-31-sequential-action-resolution-design.md. */
export function resolveFrameActionAnchors(
  actions: Action[],
  startState: ResolvedFrameState,
  endState: ResolvedFrameState,
  transformer: CoordinateTransformer,
  displayPositions?: Map<string, THREE.Vector3>,
): AnchoredAction[] {
  const entityCursor = new Map<string, THREE.Vector3>();
  const cursorFor = (ref: string): THREE.Vector3 => {
    const existing = entityCursor.get(ref);
    if (existing) return existing;
    const seeded = displayPositions?.get(ref)?.clone() ?? entityWorldPos(startState, ref, transformer);
    entityCursor.set(ref, seeded);
    return seeded;
  };

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

  const { ordered, conflicts } = orderFrameActions(actions);

  const result: AnchoredAction[] = [];
  for (const action of ordered) {
    const startOverride = cursorFor(action.player).clone();
    const anchored: AnchoredAction = { action, startOverride, conflict: conflicts.has(action) };

    if (action.type === "pass") {
      // Ball is caught where the receiver is when it arrives (design pass-target
      // rule): their start position, or the end of their last run if they run
      // first — a player cannot run while holding the ball.
      anchored.endOverride = passCatchPoint(action.to_player, ordered, startState, transformer, displayPositions);
      const id = ballIdFor(action);
      if (id) ballCursor.set(id, { holder: action.to_player, pos: anchored.endOverride.clone() });
    } else if (action.type === "pickup" || action.type === "rebound") {
      // Possession-changing but path-less: gain the ball at the player's spot.
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
      // Ball leaves the shooter toward the basket and becomes loose.
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
}
