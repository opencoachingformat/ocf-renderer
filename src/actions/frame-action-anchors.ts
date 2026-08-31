import * as THREE from "three";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { entityWorldPos } from "./resolve-action-path";

/** An action plus the world-space points the renderer should draw it between.
 *  `startOverride` replaces the acting player's frame-start position;
 *  `endOverride` (passes only) replaces the target lookup. */
export interface AnchoredAction {
  action: Action;
  startOverride: THREE.Vector3;
  endOverride?: THREE.Vector3;
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

/** Walk a frame's actions in order, chaining each action's start point to the
 *  acting player's previous action endpoint (the "possession relay"), and
 *  tracking ball possession through pass/dribble/pickup/rebound/shoot. See
 *  docs/superpowers/specs/2026-08-31-sequential-action-resolution-design.md. */
export function resolveFrameActionAnchors(
  actions: Action[],
  startState: ResolvedFrameState,
  endState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): AnchoredAction[] {
  const entityCursor = new Map<string, THREE.Vector3>();
  const cursorFor = (ref: string): THREE.Vector3 => {
    const existing = entityCursor.get(ref);
    if (existing) return existing;
    const seeded = entityWorldPos(startState, ref, transformer);
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

  const result: AnchoredAction[] = [];
  for (const action of actions) {
    const startOverride = cursorFor(action.player).clone();
    const anchored: AnchoredAction = { action, startOverride };

    if (action.type === "pass") {
      // Ball is caught where the receiver finishes the frame — a player cannot
      // run while holding the ball, so they must arrive before receiving.
      anchored.endOverride = entityWorldPos(endState, action.to_player, transformer);
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
