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

  // A long, straight dribble down -z. The line is displaced in x.
  const straightDribble = Array.from({ length: 30 }, (_, i) =>
    new THREE.Vector3(0, 0, -i * (6 / 29)), // 6 court units long
  );

  it("emits a densely resampled smooth curve, not a sparse poly-line", () => {
    const line = buildWavyLine(straightDribble);
    const pos = line.geometry.getAttribute("position");
    // A smooth-resampled curve has many more vertices than the ~30 input points.
    expect(pos.count).toBeGreaterThan(100);
  });

  it("eases the wave amplitude to ~0 at the tail (clean landing)", () => {
    const line = buildWavyLine(straightDribble);
    const pos = line.geometry.getAttribute("position");
    const n = pos.count;
    const absX = (i: number) => Math.abs(pos.getX(i));
    // Body amplitude = max |x| over the middle third; tail = mean |x| over the last 8%.
    let body = 0;
    for (let i = Math.floor(n / 3); i < Math.floor((2 * n) / 3); i++) body = Math.max(body, absX(i));
    let tail = 0;
    let tailCount = 0;
    for (let i = Math.floor(n * 0.92); i < n; i++) { tail += absX(i); tailCount++; }
    tail /= tailCount;
    expect(body).toBeGreaterThan(0.2); // meaningfully waved (amplitude raised toward the measured target)
    expect(tail).toBeLessThan(body * 0.25); // decays to a clean finish
  });

  it("keeps the wave centered on the path (net displacement near zero)", () => {
    const line = buildWavyLine(straightDribble);
    const pos = line.geometry.getAttribute("position");
    let sum = 0;
    for (let i = 0; i < pos.count; i++) sum += pos.getX(i);
    const mean = sum / pos.count;
    expect(Math.abs(mean)).toBeLessThan(0.1); // waves either side of the centerline
  });
});
