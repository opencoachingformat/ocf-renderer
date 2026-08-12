import * as THREE from "three";
import { tangentBetween } from "../paths/tangent";

const ARROWHEAD_LENGTH_M = 0.25;

/** Trims the end of a point path back by `distance` along the final tangent,
 *  so an arrowhead (or any end marker) doesn't visually overlap the target
 *  symbol's border. Returns the trimmed points plus the tangent at the new end. */
export function trimPathEnd(
  points: THREE.Vector3[],
  distance: number,
): { points: THREE.Vector3[]; endTangent: THREE.Vector3 } {
  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? points[0];
  const tangent = tangentBetween(prev, last);
  const trimmedEnd = last.clone().addScaledVector(tangent, -distance);
  return { points: [...points.slice(0, -1), trimmedEnd], endTangent: tangent };
}

/** Cone mesh oriented so its tip points along `direction`, with its base at
 *  `atPoint`. `direction` must already be normalized with y=0. */
export function buildArrowhead(
  atPoint: THREE.Vector3,
  direction: THREE.Vector3,
  color: string,
): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(ARROWHEAD_LENGTH_M * 0.4, ARROWHEAD_LENGTH_M, 12);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
  mesh.rotation.x = Math.PI / 2; // cone default points +Y; lay flat pointing along +Z
  const angle = Math.atan2(direction.x, direction.z);
  mesh.rotation.z = -angle;
  mesh.position.copy(atPoint).addScaledVector(direction, ARROWHEAD_LENGTH_M * 0.5);
  mesh.name = "arrowhead";
  return mesh;
}
