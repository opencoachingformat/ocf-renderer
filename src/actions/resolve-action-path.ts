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
  /** Replaces the acting player's frame-start position as the path's origin
   *  (used for sequential action chaining — see frame-action-anchors). */
  startOverride?: THREE.Vector3;
  /** Replaces a pass's target lookup (the receiver's frame-end position). */
  endOverride?: THREE.Vector3;
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
  startOverride?: THREE.Vector3,
): THREE.Vector3[] {
  const points = [
    startOverride ? startOverride.clone() : entityWorldPos(startState, action.player, transformer),
  ];
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

      // Decompose the detour into the start→destination heading (`direction`,
      // already normalized above) and the chosen perpendicular `side`, so the
      // whole arc advances monotonically along the heading and never doubles
      // back into an up-then-down hook — even when the obstacle sits behind the
      // start relative to that heading.
      const heading = direction;
      // Where the obstacle projects onto the heading, measured from `current`.
      const obstacleAlong = new THREE.Vector3().subVectors(obstacle, current).dot(heading);
      // Clamp the apex's along-heading position into (0, length): the wrap-around
      // point must lie between the start and the destination, never behind either.
      const ease = Math.min(distance * 0.4, length * 0.25); // keeps short legs from inverting
      const apexAlong = Math.min(Math.max(obstacleAlong, ease), length - ease);
      const at = (along: number, sideClearance: number): THREE.Vector3 =>
        current
          .clone()
          .addScaledVector(heading, along)
          .addScaledVector(side, sideClearance);

      // Apex clears the obstacle fully to the side; approach/exit ease in and out.
      const apex = at(apexAlong, distance);
      const approach = at(Math.max(0, apexAlong - ease), distance * 0.6);
      const exit = at(Math.min(length, apexAlong + ease), distance * 0.6);

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
      const points = expandMoveSteps(action, startState, transformer, arcDistances, options.startOverride);
      if (points.length <= 1) return null;
      return points;
    }
    case "pass": {
      const start = options.startOverride ?? entityWorldPos(startState, action.player, transformer);
      const end = options.endOverride ?? entityWorldPos(startState, action.to_player, transformer);
      return [start.clone(), end.clone()];
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
