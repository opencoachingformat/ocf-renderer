import * as THREE from "three";

const DASH_SIZE_M = 0.2;
const GAP_SIZE_M = 0.12;

/** Dashed line for pass/hand_off actions. Arrowhead attachment happens
 *  separately (Task 14) so this builder stays a single-purpose primitive. */
export function buildDashedLine(points: THREE.Vector3[], color = "#222222"): THREE.Line {
  if (points.length < 2) throw new Error("buildDashedLine requires at least 2 points");
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({ color, dashSize: DASH_SIZE_M, gapSize: GAP_SIZE_M }),
  );
  line.computeLineDistances();
  line.name = "pass-path";
  return line;
}
