import * as THREE from "three";
import type { Coordinate, Court } from "../types/ocf";
import { FIBA_DEFAULTS, type CourtDimensions } from "./fiba-constants";
import { fibaNamedPosition } from "./named-positions";

const FT_TO_M = 0.3048;

export function resolveCourtDimensions(court: Court): CourtDimensions {
  const merged = { ...FIBA_DEFAULTS, ...(court.custom_dimensions ?? {}) };
  if (court.custom_dimensions?.unit !== "ft") return merged;
  const scaled = { ...merged };
  for (const key of Object.keys(scaled) as (keyof CourtDimensions)[]) {
    scaled[key] = (merged[key] as number) * FT_TO_M;
  }
  return scaled;
}

export class CoordinateTransformer {
  readonly dimensions: CourtDimensions;

  constructor(private readonly court: Court) {
    this.dimensions = resolveCourtDimensions(court);
  }

  /** Resolve any Coordinate variant to absolute court meters. */
  resolve(coord: Coordinate): { x: number; y: number } {
    if ("x" in coord && "y" in coord) return { x: coord.x, y: coord.y };
    if ("named" in coord) return fibaNamedPosition(coord.named, this.dimensions);
    if ("relative_to" in coord) {
      const base = fibaNamedPosition(coord.relative_to, this.dimensions);
      return { x: base.x + coord.dx, y: base.y + coord.dy };
    }
    throw new Error(`CoordinateTransformer: unrecognized coordinate shape ${JSON.stringify(coord)}`);
  }

  /** Court meters -> Three.js world space (see module doc for the axis convention). */
  toWorld(courtXY: { x: number; y: number }): THREE.Vector3 {
    return new THREE.Vector3(courtXY.x, 0, -courtXY.y);
  }

  resolveToWorld(coord: Coordinate): THREE.Vector3 {
    return this.toWorld(this.resolve(coord));
  }
}
