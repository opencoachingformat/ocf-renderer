import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildConeSymbol } from "./cone-symbol";

describe("buildConeSymbol", () => {
  it("returns a group named 'cone-symbol' with an apex-up triangle mesh", () => {
    const group = buildConeSymbol("#e07b1f");
    expect(group.name).toBe("cone-symbol");
    const fill = group.getObjectByName("cone-fill") as THREE.Mesh;
    expect(fill).toBeInstanceOf(THREE.Mesh);
    fill.geometry.computeBoundingBox();
    const box = fill.geometry.boundingBox!;
    // apex-up triangle: max.y (apex) is farther from 0 than min.y (base) is close to 0
    expect(box.max.y).toBeGreaterThan(0);
  });
});
