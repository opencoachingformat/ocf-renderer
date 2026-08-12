import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildBallSymbol, BALL_SYMBOL_RADIUS_M } from "./ball-symbol";

describe("buildBallSymbol", () => {
  it("returns a group named 'ball-symbol' with a filled circle mesh", () => {
    const group = buildBallSymbol("#e07b1f");
    expect(group.name).toBe("ball-symbol");
    const fill = group.getObjectByName("ball-fill") as THREE.Mesh;
    expect(fill).toBeInstanceOf(THREE.Mesh);
    const material = fill.material as THREE.MeshBasicMaterial;
    expect(material.color.getHexString()).toBe("e07b1f");
  });

  it("uses a radius smaller than the offense symbol radius", () => {
    expect(BALL_SYMBOL_RADIUS_M).toBeLessThan(0.5);
    expect(BALL_SYMBOL_RADIUS_M).toBeCloseTo(0.15, 2);
  });
});
