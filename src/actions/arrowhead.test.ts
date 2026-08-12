import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { trimPathEnd, buildArrowhead } from "./arrowhead";

function polylineLength(points: THREE.Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);
  return total;
}

describe("trimPathEnd", () => {
  it("shortens the polyline length by exactly `distance`", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)];
    const before = polylineLength(points);
    const { points: trimmed } = trimPathEnd(points, 0.5);
    const after = polylineLength(trimmed);
    expect(before - after).toBeCloseTo(0.5, 5);
  });

  it("returns the end tangent pointing from the second-to-last point toward the last", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const { endTangent } = trimPathEnd(points, 0.3);
    expect(endTangent.x).toBeCloseTo(1, 5);
    expect(endTangent.z).toBeCloseTo(0, 5);
  });

  it("keeps the point count unchanged (only the last point moves)", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(2, 0, 0),
    ];
    const { points: trimmed } = trimPathEnd(points, 0.2);
    expect(trimmed).toHaveLength(points.length);
    expect(trimmed[0].equals(points[0])).toBe(true);
    expect(trimmed[1].equals(points[1])).toBe(true);
  });
});

describe("buildArrowhead", () => {
  it("names the mesh 'arrowhead'", () => {
    const mesh = buildArrowhead(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), "#ff0000");
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.name).toBe("arrowhead");
  });

  it("orients the cone's tip (local +Y) to point along the given (normalized, y=0) direction", () => {
    const direction = new THREE.Vector3(1, 0, 1).normalize();
    const mesh = buildArrowhead(new THREE.Vector3(0, 0, 0), direction, "#00ff00");
    const tip = new THREE.Vector3(0, 1, 0).applyEuler(mesh.rotation);
    expect(tip.x).toBeCloseTo(direction.x, 5);
    expect(tip.y).toBeCloseTo(direction.y, 5);
    expect(tip.z).toBeCloseTo(direction.z, 5);
  });
});
