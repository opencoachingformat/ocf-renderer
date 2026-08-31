import * as THREE from "three";
import { tangentBetween } from "../paths/tangent";

export const ARROWHEAD_LENGTH_M = 0.6;

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
  // Yaw about the camera axis (Y) so the tip aligns with `direction`. At yaw 0
  // the tip points toward world -Z; measure the heading from -Z, clockwise.
  mesh.rotation.y = Math.atan2(direction.x, -direction.z);
  mesh.position.copy(atPoint);
  mesh.name = "arrowhead";
  return mesh;
}
