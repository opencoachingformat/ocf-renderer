import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { smoothPath, resamplePath } from "./smooth-path";

describe("smoothPath", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => smoothPath([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("returns a straight line for 2-point input, midpoint sample equals the arithmetic midpoint", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(4, 0, 2);
    const curve = smoothPath([a, b]);
    const mid = curve.getPoint(0.5);
    expect(mid.x).toBeCloseTo(2, 5);
    expect(mid.z).toBeCloseTo(1, 5);
  });

  it("passes through each anchor for 3+ point input", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 3),
      new THREE.Vector3(5, 0, 1),
      new THREE.Vector3(7, 0, 4),
    ];
    const curve = smoothPath(points);
    // CatmullRomCurve3.getPoint(u) passes through anchors at u = i / (n - 1)
    for (let i = 0; i < points.length; i++) {
      const u = i / (points.length - 1);
      const sample = curve.getPoint(u);
      expect(sample.distanceTo(points[i])).toBeLessThan(0.05);
    }
  });
});

describe("resamplePath", () => {
  it("returns segments + 1 points", () => {
    const curve = smoothPath([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const points = resamplePath(curve, 10);
    expect(points).toHaveLength(11);
  });

  it("produces roughly equal arc-length spacing on a curved 4-point input", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 5),
      new THREE.Vector3(6, 0, 6),
      new THREE.Vector3(8, 0, 0),
    ];
    const curve = smoothPath(points);
    const sampled = resamplePath(curve, 20);
    const segmentLengths: number[] = [];
    for (let i = 1; i < sampled.length; i++) {
      segmentLengths.push(sampled[i].distanceTo(sampled[i - 1]));
    }
    const max = Math.max(...segmentLengths);
    const min = Math.min(...segmentLengths);
    expect(max / min).toBeLessThan(1.3);
  });
});
