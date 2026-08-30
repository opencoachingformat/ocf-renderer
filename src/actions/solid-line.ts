import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { buildThickLine } from "./thick-line";

/** Plain solid line for move/cut actions. Arrowhead attachment happens
 *  separately so this builder stays a single-purpose primitive. Uses the shared
 *  thick-line (Line2) so the stroke renders at a real, world-scaled width. */
export function buildSolidLine(points: THREE.Vector3[], color = "#222222"): Line2 {
  if (points.length < 2) throw new Error("buildSolidLine requires at least 2 points");
  const line = buildThickLine(points, color);
  line.name = "move-path";
  return line;
}
