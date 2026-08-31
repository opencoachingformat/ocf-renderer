import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { composeFrame } from "./compose-frame";
import type { OcfDocument } from "../types/ocf";

// #1 dribbles to (0,0) then passes to #2. The pass line (name "pass-path")
// must START near (0,0), where the dribble ended — not at #1's start (-3,6).
const doc = {
  meta: { title: "chain-render" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: -3, y: 6 },
    { type: "offense", nr: 2, x: 4, y: 2 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [
    {
      id: "f1",
      actions: [
        { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }] },
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      ],
      end_state: { offense_1: { x: 0, y: 0 } },
    },
  ],
} as unknown as OcfDocument;

function firstPoint(line: THREE.Object3D): THREE.Vector3 {
  const geom = (line as THREE.Mesh).geometry;
  const attr = geom.getAttribute("instanceStart");
  return new THREE.Vector3(attr.getX(0), attr.getY(0), attr.getZ(0));
}

describe("composeFrame — sequential chaining", () => {
  it("starts the pass line where the dribble ended, not at the passer's frame-start", () => {
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    const pass = actions.children.find((c) => c.name === "pass-path")!;
    const p0 = firstPoint(pass);
    // near (0,0); the pass is trimmed slightly off the target end, not the start,
    // so the start stays at the dribble endpoint.
    expect(p0.x).toBeCloseTo(0, 1);
    expect(p0.z).toBeCloseTo(0, 1);
  });
});
