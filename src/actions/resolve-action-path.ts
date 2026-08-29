import * as THREE from "three";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";

/** How far (court units) the around_player detour waypoint sits from the
 *  obstacle, per `arc` value. The renderer owns this enum→distance mapping
 *  (RFC 0004); `normal` keeps the historical 0.6 so absent/`normal` arcs are
 *  unchanged. Overridable via {@link ResolveActionPathOptions.arcDistances}. */
export interface ArcDistances {
  tight: number;
  normal: number;
  wide: number;
}

export const DEFAULT_ARC_DISTANCES: ArcDistances = {
  tight: 0.35,
  normal: 0.6,
  wide: 0.9,
};

export interface ResolveActionPathOptions {
  arcDistances?: Partial<ArcDistances>;
}

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
  arcDistances: ArcDistances,
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
      // `side` is the unit vector left of the direction of travel (in world
      // space, where court +y maps to -z; left-of-heading is (-dz, 0, dx)).
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      if (move.side === "left" || move.side === "right") {
        // Author-chosen side, relative to the direction of travel.
        if (move.side === "right") side.negate();
      } else {
        // No explicit side: keep the geometry heuristic (pass on the side the
        // obstacle is NOT on, so the detour bulges away from a head-on line).
        const obstacleDelta = new THREE.Vector3().subVectors(obstacle, current).setY(0);
        if (side.dot(obstacleDelta) > 0) side.negate();
      }
      const arc = move.arc ?? "normal";
      const distance = arcDistances[arc];
      const waypoint = obstacle.clone().addScaledVector(side, distance);
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
  options: ResolveActionPathOptions = {},
): THREE.Vector3[] | null {
  const arcDistances: ArcDistances = { ...DEFAULT_ARC_DISTANCES, ...options.arcDistances };
  switch (action.type) {
    case "move":
    case "cut":
    case "dribble": {
      const points = expandMoveSteps(action, startState, transformer, arcDistances);
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
    // Reserved non-basketball actions (RFC 0003, schema v1.4.0). They draw no
    // movement path here; treated like the other point-actions until a sport
    // renderer defines their glyphs.
    case "tackle":
    case "clear":
    case "faceoff":
    case "check":
      return null;
    default: {
      const exhaustive: never = action;
      throw new Error(`resolveActionPath: unhandled action type ${JSON.stringify(exhaustive)}`);
    }
  }
}
