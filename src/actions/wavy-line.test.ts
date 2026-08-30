import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { buildWavyLine } from "./wavy-line";

// Line2 stores geometry as per-segment instanceStart/instanceEnd rather than a
// single "position" attribute. Reconstruct the ordered list of vertices the
// polyline passes through (each segment start, plus the final segment's end) so
// the wave-shape assertions below read against the same points as before.
function wavyPoints(line: Line2): THREE.Vector3[] {
  const start = line.geometry.getAttribute("instanceStart");
  const end = line.geometry.getAttribute("instanceEnd");
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < start.count; i++) {
    pts.push(new THREE.Vector3(start.getX(i), start.getY(i), start.getZ(i)));
  }
  const last = end.count - 1;
  pts.push(new THREE.Vector3(end.getX(last), end.getY(last), end.getZ(last)));
  return pts;
}

describe("buildWavyLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildWavyLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("builds a thick Line2 named 'dribble-path'", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2)];
    const line = buildWavyLine(points);
    expect(line).toBeInstanceOf(Line2);
    expect(line.name).toBe("dribble-path");
  });

  it("keeps endpoints exactly on the original path", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2)].map((p) =>
      Array.from({ length: 20 }, (_, i) => p.clone()),
    ).flat().map((p, i, arr) => p.lerp(arr[arr.length - 1], i / (arr.length - 1)));
    const line = buildWavyLine(points);
    const pts = wavyPoints(line);
    expect(pts[0].x).toBeCloseTo(points[0].x);
    expect(pts[pts.length - 1].x).toBeCloseTo(points[points.length - 1].x);
  });

  it("produces at least one full wave cycle even on a short path", () => {
    const points = Array.from({ length: 10 }, (_, i) =>
      new THREE.Vector3(0, 0, -i * 0.02), // total length 0.18m, well under one wavelength
    );
    const line = buildWavyLine(points);
    const pts = wavyPoints(line);
    let maxAbsX = 0;
    for (const p of pts) maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
    expect(maxAbsX).toBeGreaterThan(0); // visibly wavy, not squashed to a flat line
  });

  // A long, straight dribble down -z. The line is displaced in x.
  const straightDribble = Array.from({ length: 30 }, (_, i) =>
    new THREE.Vector3(0, 0, -i * (6 / 29)), // 6 court units long
  );

  it("emits a densely resampled smooth curve, not a sparse poly-line", () => {
    const line = buildWavyLine(straightDribble);
    const pts = wavyPoints(line);
    // A smooth-resampled curve has many more vertices than the ~30 input points.
    expect(pts.length).toBeGreaterThan(100);
  });

  it("eases the wave amplitude to ~0 at the tail (clean landing)", () => {
    const line = buildWavyLine(straightDribble);
    const pts = wavyPoints(line);
    const n = pts.length;
    const absX = (i: number) => Math.abs(pts[i].x);
    // Body amplitude = max |x| over the middle third; tail = mean |x| over the last 8%.
    let body = 0;
    for (let i = Math.floor(n / 3); i < Math.floor((2 * n) / 3); i++) body = Math.max(body, absX(i));
    let tail = 0;
    let tailCount = 0;
    for (let i = Math.floor(n * 0.92); i < n; i++) { tail += absX(i); tailCount++; }
    tail /= tailCount;
    expect(body).toBeGreaterThan(0.15); // meaningfully waved (a fine texture under the thick stroke)
    expect(tail).toBeLessThan(body * 0.25); // decays to a clean finish
  });

  it("keeps the wave centered on the path (net displacement near zero)", () => {
    const line = buildWavyLine(straightDribble);
    const pts = wavyPoints(line);
    let sum = 0;
    for (const p of pts) sum += p.x;
    const mean = sum / pts.length;
    expect(Math.abs(mean)).toBeLessThan(0.1); // waves either side of the centerline
  });
});
