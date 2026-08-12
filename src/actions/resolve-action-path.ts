import * as THREE from "three";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";

export function entityWorldPos(
  state: ResolvedFrameState,
  ref: string,
  transformer: CoordinateTransformer,
): THREE.Vector3 {
  const coord = state.positions[ref];
  if (!coord) {
    throw new Error(`entityWorldPos: no resolved position for entity ref "${ref}" in frame state`);
  }
  return transformer.resolveToWorld(coord);
}

/** Returns null for actions with no drawn path (shoot/defend/rebound/pickup, or moves without `to`).
 *  Note: `hand_off` was removed from the v1 schema; if reintroduced, treat as `pass` variant. */
export function resolveActionPath(
  action: Action,
  startState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): THREE.Vector3[] | null {
  switch (action.type) {
    case "move":
    case "cut":
    case "dribble": {
      const start = entityWorldPos(startState, action.player, transformer);
      const rest = action.moves
        .filter((m) => m.to !== undefined)
        .map((m) => transformer.resolveToWorld(m.to!));
      if (rest.length === 0) return null; // move on the spot
      return [start, ...rest];
    }
    case "pass": {
      const start = entityWorldPos(startState, action.player, transformer);
      const end = entityWorldPos(startState, action.to_player, transformer);
      return [start, end];
    }
    case "screen": {
      const start = entityWorldPos(startState, action.player, transformer);
      const end = action.at
        ? transformer.resolveToWorld(action.at)
        : entityWorldPos(startState, action.for_player, transformer);
      return [start, end];
    }
    case "shoot":
    case "defend":
    case "rebound":
    case "pickup":
      return null;
    default: {
      const exhaustive: never = action;
      throw new Error(`resolveActionPath: unhandled action type ${JSON.stringify(exhaustive)}`);
    }
  }
}
