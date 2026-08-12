import * as THREE from "three";

/** Builds a smooth curve through the given anchor points (world space).
 *  Two points -> straight line (CatmullRom degenerates gracefully but we
 *  special-case it to avoid curve overshoot on 2-point inputs). */
export function smoothPath(points: THREE.Vector3[]): THREE.Curve<THREE.Vector3> {
  if (points.length < 2) {
    throw new Error(`smoothPath requires at least 2 points, got ${points.length}`);
  }
  if (points.length === 2) {
    return new THREE.LineCurve3(points[0], points[1]);
  }
  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}

/** Arc-length-reparametrized sample points along a curve. */
export function resamplePath(curve: THREE.Curve<THREE.Vector3>, segments: number): THREE.Vector3[] {
  return curve.getSpacedPoints(segments);
}
