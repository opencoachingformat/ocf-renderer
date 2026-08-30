import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

// Default stroke width for action lines, in COURT UNITS. LineMaterial with
// worldUnits:true interprets linewidth in world space, so a line keeps a
// consistent on-court thickness at any zoom — and no canvas resolution needs to
// be threaded through. Tuned to read like a coaching-tool stroke (thicker than
// the old 1px LineBasicMaterial) rather than a hairline.
export const ACTION_LINE_WIDTH = 0.16;

/** Optional dashing for a thick line. World-unit dash/gap sizes so the pattern
 *  stays consistent at any zoom (matching worldUnits:true stroke width). */
export interface ThickLineDashOptions {
  dashed: true;
  dashSize: number;
  gapSize: number;
}

/** A thick, world-scaled polyline (three.js Line2). Replaces LineBasicMaterial,
 *  whose linewidth is ignored in WebGL, so strokes render at a real width. Pass
 *  `dash` to render a thick *dashed* line (dash distances are computed here). */
export function buildThickLine(
  points: THREE.Vector3[],
  color = "#222222",
  width = ACTION_LINE_WIDTH,
  dash?: ThickLineDashOptions,
): Line2 {
  if (points.length < 2) throw new Error("buildThickLine requires at least 2 points");

  const positions: number[] = [];
  for (const p of points) positions.push(p.x, p.y, p.z);

  const geometry = new LineGeometry();
  geometry.setPositions(positions);

  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: width,
    worldUnits: true,
    ...(dash
      ? { dashed: true, dashSize: dash.dashSize, gapSize: dash.gapSize }
      : {}),
  });

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  return line;
}
