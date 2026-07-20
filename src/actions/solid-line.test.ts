import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildSolidLine } from "./solid-line";

describe("buildSolidLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildSolidLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("builds a Line named 'move-path' with one vertex per input point", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 1), new THREE.Vector3(2, 0, 0)];
    const line = buildSolidLine(points);
    expect(line).toBeInstanceOf(THREE.Line);
    expect(line.name).toBe("move-path");
    expect(line.geometry.getAttribute("position").count).toBe(points.length);
  });
});
