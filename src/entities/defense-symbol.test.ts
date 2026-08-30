import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildDefenseSymbol, applyDefenseRotation } from "./defense-symbol";

describe("buildDefenseSymbol", () => {
  it("names the group and includes a body disc + arms children", () => {
    const group = buildDefenseSymbol("#c0392b");
    expect(group.name).toBe("defense-symbol");
    expect(group.getObjectByName("defense-body")).toBeInstanceOf(THREE.Mesh);
    // Arms are a group of two thick strokes (Line2), not a single hairline Line.
    expect(group.getObjectByName("defense-arms")).toBeInstanceOf(THREE.Group);
  });

  it("spreads two arms forward (toward -z) in a V opening from the body", () => {
    const group = buildDefenseSymbol("#c0392b");
    const arms = group.getObjectByName("defense-arms") as THREE.Group;
    expect(arms.children).toHaveLength(2); // left + right arm
    // Both arms reach forward (their far ends are at more-negative z than the body center).
    for (const arm of arms.children) {
      const pos = (arm as THREE.Mesh).geometry.getAttribute("instanceEnd");
      let minZ = Infinity;
      for (let i = 0; i < pos.count; i++) minZ = Math.min(minZ, pos.getZ(i));
      expect(minZ).toBeLessThan(0); // reaches out in front of the body
    }
  });
});

describe("applyDefenseRotation", () => {
  it("rotates 0 degrees to no rotation (arms toward -y)", () => {
    const group = buildDefenseSymbol("#c0392b");
    applyDefenseRotation(group, 0);
    expect(group.rotation.y).toBeCloseTo(0, 5);
  });

  it("rotates 90 degrees clockwise to rotation.y ~= PI/2", () => {
    const group = buildDefenseSymbol("#c0392b");
    applyDefenseRotation(group, 90);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });
});
