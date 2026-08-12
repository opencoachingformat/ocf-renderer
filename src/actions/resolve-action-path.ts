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

function expandMoveSteps(
  action: Extract<Action, { type: "move" | "cut" | "dribble" }>,
  startState: ResolvedFrameState,
  transformer: CoordinateTransformer,
): THREE.Vector3[] {
  const points = [entityWorldPos(startState, action.player, transformer)];
  let current = points[0];

  for (const move of action.moves) {
    if (!move.to) continue;
    const destination = transformer.resolveToWorld(move.to);
    if (move.around_player) {
      const obstacle = entityWorldPos(startState, move.around_player, transformer);
      const direction = new THREE.Vector3().subVectors(destination, current).setY(0);
      const length = direction.length();
      if (length < 1e-8) {
        points.push(destination);
        current = destination;
        continue;
      }
      direction.normalize();
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      const obstacleDelta = new THREE.Vector3().subVectors(obstacle, current).setY(0);
      if (side.dot(obstacleDelta) > 0) side.negate();
      const waypoint = obstacle.clone().addScaledVector(side, 0.6);
      points.push(waypoint);
    }
    points.push(destination);
    current = destination;
  }

  return points;
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
      const points = expandMoveSteps(action, startState, transformer);
      if (points.length <= 1) return null;
      return points;
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
