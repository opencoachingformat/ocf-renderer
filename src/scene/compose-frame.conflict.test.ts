import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { composeFrame } from "./compose-frame";
import { DEFAULT_COLOR_SCHEME } from "../style/color-scheme";
import type { OcfDocument } from "../types/ocf";

// Two actions forming an after-cycle → both drawn in the conflict (red) colour.
const doc = {
  meta: { title: "conflict" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: -3, y: 6 },
    { type: "offense", nr: 2, x: 3, y: 6 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [{ id: "f1", actions: [
    { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1", after: "offense_1.cut" },
    { player: "offense_1", type: "cut", moves: [{ to: { x: -1, y: 8 } }], after: "offense_1.pass" },
  ] }],
} as unknown as OcfDocument;

function materialColors(obj: THREE.Object3D): number[] {
  const hexes: number[] = [];
  obj.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat && "color" in mat) hexes.push((mat as THREE.MeshBasicMaterial).color.getHex());
  });
  return hexes;
}

describe("composeFrame — conflict highlighting", () => {
  it("draws an after-cycle action's glyphs in the red conflict colour", () => {
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    const redHex = new THREE.Color(DEFAULT_COLOR_SCHEME.red).getHex();
    const allColors = materialColors(actions);
    expect(allColors).toContain(redHex);
  });
});
