import * as THREE from "three";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { OFFENSE_SYMBOL_RADIUS_M } from "../entities/offense-symbol";

/** How far (court units) the around_player detour waypoint sits from the
 *  obstacle's CENTER, per `arc` value. The renderer owns this enum→distance
 *  mapping (RFC 0004). Values must clear the player symbol (radius
 *  {@link OFFENSE_SYMBOL_RADIUS_M} = 0.5 court units) with a visible margin, so
 *  the detour actually arcs *around* the player instead of cutting through the
 *  symbol. Overridable via {@link ResolveActionPathOptions.arcDistances}. */
export interface ArcDistances {
  tight: number;
  normal: number;
  wide: number;
}

// Clearance = symbol radius + a per-arc gap (tight brushes past, wide swings out).
export const DEFAULT_ARC_DISTANCES: ArcDistances = {
  tight: OFFENSE_SYMBOL_RADIUS_M + 0.35, // ~0.85
  normal: OFFENSE_SYMBOL_RADIUS_M + 0.7, // ~1.2
  wide: OFFENSE_SYMBOL_RADIUS_M + 1.2, // ~1.7
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

      // The apex sits right next to the obstacle, pushed `distance` to the chosen
      // side of the player's centre — this is the "wrap around the player" point.
      const apex = obstacle.clone().addScaledVector(side, distance);

      // Round the corner: place an approach point between current→apex and an
      // exit point between apex→destination, each nudged toward the apex side so
      // the smoothing spline eases in and out instead of kinking at the apex.
      // The nudge is a fraction of the clearance, capped so it can't overshoot
      // short legs.
      const easeSide = distance * 0.4;
      const approachT = 0.5; // midpoint of the current→apex leg
      const exitT = 0.5; // midpoint of the apex→destination leg
      const approach = current.clone().lerp(apex, approachT).addScaledVector(side, easeSide);
      const exit = apex.clone().lerp(destination, exitT).addScaledVector(side, easeSide);

      points.push(approach);
      points.push(apex);
      points.push(exit);
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
