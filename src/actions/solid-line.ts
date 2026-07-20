import * as THREE from "three";

/** Plain solid line for move/cut actions. Arrowhead attachment happens
 *  separately (Task 14) so this builder stays a single-purpose primitive. */
export function buildSolidLine(points: THREE.Vector3[], color = "#222222"): THREE.Line {
  if (points.length < 2) throw new Error("buildSolidLine requires at least 2 points");
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
  line.name = "move-path";
  return line;
}
