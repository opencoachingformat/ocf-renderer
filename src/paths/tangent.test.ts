import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { tangentBetween, perpendicularOf } from "./tangent";

describe("tangentBetween", () => {
  it("returns the normalized direction from `from` to `to`, flattened to y=0", () => {
    const from = new THREE.Vector3(0, 5, 0);
    const to = new THREE.Vector3(3, -2, 0);
    const tangent = tangentBetween(from, to);
    expect(tangent.length()).toBeCloseTo(1, 5);
    expect(tangent.y).toBe(0);
    expect(tangent.x).toBeCloseTo(1, 5);
    expect(tangent.z).toBeCloseTo(0, 5);
  });
});

describe("perpendicularOf", () => {
  it("returns a vector perpendicular to the given tangent, in the XZ plane", () => {
    const tangent = new THREE.Vector3(0, 0, -1);
    const normal = perpendicularOf(tangent);
    expect(normal.dot(tangent)).toBeCloseTo(0, 5);
    expect(normal.y).toBe(0);
  });
});
