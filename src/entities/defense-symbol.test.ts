import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildDefenseSymbol, applyDefenseRotation } from "./defense-symbol";

describe("buildDefenseSymbol", () => {
  it("names the group and includes body + arms children", () => {
    const group = buildDefenseSymbol("#c0392b");
    expect(group.name).toBe("defense-symbol");
    expect(group.getObjectByName("defense-body")).toBeInstanceOf(THREE.Mesh);
    expect(group.getObjectByName("defense-arms")).toBeInstanceOf(THREE.Line);
  });

  it("preserves the spec's 51:23 icon aspect ratio without distortion", () => {
    const group = buildDefenseSymbol("#c0392b");
    const body = group.getObjectByName("defense-body") as THREE.Mesh;
    body.geometry.computeBoundingBox();
    const box = body.geometry.boundingBox!;
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    expect(width / height).toBeCloseTo(51 / 23, 1);
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
