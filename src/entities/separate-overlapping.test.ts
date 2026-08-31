import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { separateOverlappingSymbols } from "./separate-overlapping";

const RADIUS = 0.5;
const MARGIN = 0.15;
const MIN_GAP = 2 * RADIUS + MARGIN;

describe("separateOverlappingSymbols", () => {
  it("pushes two near-coincident symbols at least the minimum gap apart", () => {
    const input = new Map<string, THREE.Vector3>([
      ["a", new THREE.Vector3(0, 0, 0)],
      ["b", new THREE.Vector3(0.05, 0, 0)],
    ]);
    const out = separateOverlappingSymbols(input, RADIUS, MARGIN);
    const d = out.get("a")!.distanceTo(out.get("b")!);
    expect(d).toBeGreaterThanOrEqual(MIN_GAP - 1e-6);
  });

  it("leaves already-separated symbols unchanged", () => {
    const a = new THREE.Vector3(-3, 0, 0);
    const b = new THREE.Vector3(3, 0, 0);
    const out = separateOverlappingSymbols(new Map([["a", a], ["b", b]]), RADIUS, MARGIN);
    expect(out.get("a")!.equals(a)).toBe(true);
    expect(out.get("b")!.equals(b)).toBe(true);
  });

  it("displaces an overlapping pair symmetrically about their midpoint", () => {
    const input = new Map<string, THREE.Vector3>([
      ["a", new THREE.Vector3(-0.1, 0, 0)],
      ["b", new THREE.Vector3(0.1, 0, 0)],
    ]);
    const out = separateOverlappingSymbols(input, RADIUS, MARGIN);
    const mid = out.get("a")!.clone().add(out.get("b")!).multiplyScalar(0.5);
    expect(mid.x).toBeCloseTo(0, 5);
    expect(mid.z).toBeCloseTo(0, 5);
  });
});
