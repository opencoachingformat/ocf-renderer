import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { composeFrame } from "./compose-frame";
import type { OcfDocument } from "../types/ocf";

// A cut with a curved (multi-waypoint) path. The arrowhead must point along the
// DRAWN line's final segment — not a stale tangent from before the final
// smoothing — otherwise the head visibly tilts off the line.
const doc = {
  meta: { title: "arrow-dir" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: -4, y: 3 }],
  balls: [],
  frames: [{ id: "f1", actions: [
    { player: "offense_1", type: "cut", moves: [{ to: { x: 0, y: 5 } }, { to: { x: 3, y: 5 } }] },
  ] }],
} as unknown as OcfDocument;

/** Ordered vertices of a Line2 (instanceStart of each segment + final end). */
function linePoints(line: THREE.Object3D): THREE.Vector3[] {
  const geom = (line as THREE.Mesh).geometry;
  const start = geom.getAttribute("instanceStart");
  const end = geom.getAttribute("instanceEnd");
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < start.count; i++) pts.push(new THREE.Vector3(start.getX(i), start.getY(i), start.getZ(i)));
  const last = end.count - 1;
  pts.push(new THREE.Vector3(end.getX(last), end.getY(last), end.getZ(last)));
  return pts;
}

/** Arrowhead tip direction (world XZ): the base-midpoint is the mesh position;
 *  the tip is the single vertex offset from the base line. Direction = tip minus
 *  the midpoint of the two base vertices. */
function arrowheadDirection(mesh: THREE.Object3D): THREE.Vector3 {
  mesh.updateMatrixWorld(true);
  const pos = (mesh as THREE.Mesh).geometry.getAttribute("position");
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  }
  // Geometry is [tip, baseLeft, baseRight] (see buildArrowhead): tip is vertex 0.
  const [tip, baseL, baseR] = verts;
  const baseMid = baseL.clone().add(baseR).multiplyScalar(0.5);
  return tip.clone().sub(baseMid).setY(0).normalize();
}

describe("composeFrame — arrowhead points along the drawn line", () => {
  it("aligns the move/cut arrowhead with the final segment of the rendered line", () => {
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    const line = actions.children.find((c) => c.name === "move-path")!;
    const arrow = actions.children.find((c) => c.name === "arrowhead")!;

    const pts = linePoints(line);
    const lineDir = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).setY(0).normalize();
    const arrowDir = arrowheadDirection(arrow);

    // The two directions should be nearly identical (dot ~ 1).
    expect(lineDir.dot(arrowDir)).toBeGreaterThan(0.98);
  });
});
