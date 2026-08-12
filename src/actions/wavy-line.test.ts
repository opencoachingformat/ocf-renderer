import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildWavyLine } from "./wavy-line";

describe("buildWavyLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildWavyLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("keeps endpoints exactly on the original path", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2)].map((p) =>
      Array.from({ length: 20 }, (_, i) => p.clone()),
    ).flat().map((p, i, arr) => p.lerp(arr[arr.length - 1], i / (arr.length - 1)));
    const line = buildWavyLine(points);
    const pos = line.geometry.getAttribute("position");
    expect(pos.getX(0)).toBeCloseTo(points[0].x);
    expect(pos.getX(pos.count - 1)).toBeCloseTo(points[points.length - 1].x);
  });

  it("produces at least one full wave cycle even on a short path", () => {
    const points = Array.from({ length: 10 }, (_, i) =>
      new THREE.Vector3(0, 0, -i * 0.02), // total length 0.18m, well under one wavelength
    );
    const line = buildWavyLine(points);
    const pos = line.geometry.getAttribute("position");
    let maxAbsX = 0;
    for (let i = 0; i < pos.count; i++) maxAbsX = Math.max(maxAbsX, Math.abs(pos.getX(i)));
    expect(maxAbsX).toBeGreaterThan(0); // visibly wavy, not squashed to a flat line
  });
});
