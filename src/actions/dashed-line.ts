import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { buildThickLine } from "./thick-line";

// Dash/gap in COURT UNITS (worldUnits), tuned to read as a clear dashed pass
// line at the thick ACTION_LINE_WIDTH stroke — long dashes, generous gaps.
const DASH_SIZE_M = 0.35;
const GAP_SIZE_M = 0.28;

/** Dashed line for pass/hand_off actions. Arrowhead attachment happens
 *  separately (Task 14) so this builder stays a single-purpose primitive. Uses
 *  the shared thick-line (Line2) so the stroke renders at a real, world-scaled
 *  width — dashed via LineMaterial's world-unit dash pattern. */
export function buildDashedLine(points: THREE.Vector3[], color = "#222222"): Line2 {
  if (points.length < 2) throw new Error("buildDashedLine requires at least 2 points");
  const line = buildThickLine(points, color, undefined, {
    dashed: true,
    dashSize: DASH_SIZE_M,
    gapSize: GAP_SIZE_M,
  });
  line.name = "pass-path";
  return line;
}
