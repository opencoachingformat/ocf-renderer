import * as THREE from "three";
import { tangentBetween } from "../paths/tangent";

export const ARROWHEAD_LENGTH_M = 0.6;

/** Trims the end of a point path back by `distance` (measured along the path's
 *  arc length), so an arrowhead doesn't overlap the target symbol. Drops any
 *  trailing points that fall within `distance` of the end and places the new
 *  end exactly `distance` back along the final surviving segment, so the trimmed
 *  path never folds back on itself. Returns the trimmed points plus the tangent
 *  at the new end (which matches the drawn line's final direction). */
export function trimPathEnd(
  points: THREE.Vector3[],
  distance: number,
): { points: THREE.Vector3[]; endTangent: THREE.Vector3 } {
  if (points.length < 2) {
    return { points: [...points], endTangent: new THREE.Vector3(0, 0, -1) };
  }

  // Walk backward from the end, accumulating segment lengths, until the running
  // total passes `distance`. `i` becomes the index of the point at the far
  // (start-side) end of the segment the new endpoint falls on. `remaining` is
  // how far past points[i] (toward points[i+1]) the new endpoint sits.
  let acc = 0;
  let i = points.length - 1;
  while (i > 0) {
    const segLen = points[i].distanceTo(points[i - 1]);
    if (acc + segLen >= distance) break;
    acc += segLen;
    i -= 1;
  }
  // The new endpoint is on the segment points[i-1] -> points[i], `distance - acc`
  // back from points[i] toward points[i-1].
  const back = distance - acc;
  const from = points[i];
  const toward = points[i - 1] ?? points[0];
  const dirBack = new THREE.Vector3().subVectors(toward, from).setY(0);
  const segLen = dirBack.length() || 1;
  dirBack.multiplyScalar(1 / segLen);
  const newEnd = from.clone().addScaledVector(dirBack, back);

  // Keep every point strictly before the trimmed segment's near end, then the
  // new endpoint. Never re-add the original (now trimmed-away) tail.
  const kept = points.slice(0, i);
  kept.push(newEnd);
  const trimmed = kept.length >= 2 ? kept : [points[0].clone(), newEnd];
  const endTangent = tangentBetween(trimmed[trimmed.length - 2], trimmed[trimmed.length - 1]);
  return { points: trimmed, endTangent };
}

/** Trims the START of a point path forward by `distance` (along the path's arc
 *  length), so a line begins at the edge of the acting player's symbol rather
 *  than its centre — leaving a gap the player indicator fits into. Mirror of
 *  {@link trimPathEnd}; drops leading points within `distance` of the start. */
export function trimPathStart(points: THREE.Vector3[], distance: number): THREE.Vector3[] {
  if (points.length < 2) return [...points];

  // Walk forward from the start until the running total passes `distance`.
  let acc = 0;
  let i = 0;
  while (i < points.length - 1) {
    const segLen = points[i].distanceTo(points[i + 1]);
    if (acc + segLen >= distance) break;
    acc += segLen;
    i += 1;
  }
  // The new start is `distance - acc` forward from points[i] toward points[i+1].
  const forward = distance - acc;
  const from = points[i];
  const toward = points[i + 1] ?? points[points.length - 1];
  const dir = new THREE.Vector3().subVectors(toward, from).setY(0);
  const segLen = dir.length() || 1;
  dir.multiplyScalar(1 / segLen);
  const newStart = from.clone().addScaledVector(dir, forward);

  const kept = [newStart, ...points.slice(i + 1)];
  return kept.length >= 2 ? kept : [newStart, points[points.length - 1].clone()];
}

const ARROWHEAD_HALF_WIDTH_M = ARROWHEAD_LENGTH_M * 0.5;

/** Flat triangular arrowhead lying in the court plane (XZ), tip pointing along
 *  `direction`, base centered at `atPoint`. `direction` must be normalized with
 *  y=0. Built as a 2D ShapeGeometry rotated flat and yawed about the camera axis
 *  (the same flat-in-XZ pattern the entity glyphs use), so it always renders
 *  face-on to the top-down camera — unlike a ConeGeometry, whose axis tilts out
 *  of the view plane when composed rotations are applied. */
export function buildArrowhead(
  atPoint: THREE.Vector3,
  direction: THREE.Vector3,
  color: string,
): THREE.Mesh {
  // Build the triangle already lying flat in the court plane (XZ, at y=0), tip
  // toward -Z, base along X. Vertices are given directly in world-aligned axes
  // so the only transform needed is a yaw about Y — no composed rotations that
  // could tilt the face out of the camera's view plane.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, -ARROWHEAD_LENGTH_M, // tip (toward -Z)
        -ARROWHEAD_HALF_WIDTH_M, 0, 0, // base left
        ARROWHEAD_HALF_WIDTH_M, 0, 0, // base right
      ],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  // Yaw about the camera axis (Y) so the tip (local -Z) aligns with `direction`.
  // A yaw θ maps local (0,0,-1) to world (-sinθ, 0, -cosθ); solving that against
  // (dx, 0, dz) gives θ = atan2(-dx, -dz).
  mesh.rotation.y = Math.atan2(-direction.x, -direction.z);
  mesh.position.copy(atPoint);
  mesh.name = "arrowhead";
  return mesh;
}
