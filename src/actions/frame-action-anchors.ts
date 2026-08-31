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
 *  acting player's previous action endpoint (the "possession relay"). See
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

  const result: AnchoredAction[] = [];
  for (const action of actions) {
    const startOverride = cursorFor(action.player).clone();
    const anchored: AnchoredAction = { action, startOverride };

    if (action.type === "move" || action.type === "cut" || action.type === "dribble") {
      const dest = lastDestination(action, transformer);
      if (dest) entityCursor.set(action.player, dest);
    }

    result.push(anchored);
  }
  return result;
}
