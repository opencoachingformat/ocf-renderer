import * as THREE from "three";
import type { Action, FrameState } from "../types/ocf";
import { CoordinateTransformer } from "../court/coordinate-transformer";

export function entityWorldPos(
  state: FrameState,
  entityRef: string,
  transformer: CoordinateTransformer,
): THREE.Vector3 {
  const entityState = state.entities.find((e) => e.entity_ref === entityRef);
  if (!entityState) {
    throw new Error(`entityWorldPos: no entity state for entity_ref "${entityRef}" in frame state`);
  }
  return transformer.resolveToWorld(entityState.position);
}

/** Returns null for actions with no path (shoot). */
export function resolveActionPath(
  action: Action,
  startState: FrameState,
  transformer: CoordinateTransformer,
): THREE.Vector3[] | null {
  switch (action.type) {
    case "move":
    case "cut":
    case "dribble": {
      const start = entityWorldPos(startState, action.entity_ref, transformer);
      const rest = action.moves.map((m) => transformer.resolveToWorld(m.to));
      return [start, ...rest];
    }
    case "pass":
    case "hand_off": {
      const start = entityWorldPos(startState, action.entity_ref, transformer);
      const end = entityWorldPos(startState, action.to_entity_ref, transformer);
      return [start, end];
    }
    case "screen": {
      const start = entityWorldPos(startState, action.entity_ref, transformer);
      const end = transformer.resolveToWorld(action.at);
      return [start, end];
    }
    case "shoot":
      return null;
    default: {
      const exhaustive: never = action;
      throw new Error(`resolveActionPath: unhandled action type ${JSON.stringify(exhaustive)}`);
    }
  }
}
