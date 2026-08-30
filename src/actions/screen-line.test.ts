import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { buildScreenLine } from "./screen-line";

describe("buildScreenLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildScreenLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("builds a group with a thick line and a perpendicular end bar", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)];
    const group = buildScreenLine(points);
    expect(group.name).toBe("screen-path");
    const line = group.getObjectByName("screen-line");
    const bar = group.getObjectByName("screen-bar");
    expect(line).toBeInstanceOf(Line2);
    expect(bar).toBeInstanceOf(Line2);
  });

  it("orients the end bar perpendicular to the path's end tangent", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)]; // tangent along -Z
    const group = buildScreenLine(points);
    const bar = group.getObjectByName("screen-bar") as Line2;
    // Line2 stores the single bar segment as instanceStart -> instanceEnd.
    const start = bar.geometry.getAttribute("instanceStart");
    const end = bar.geometry.getAttribute("instanceEnd");
    const barVec = new THREE.Vector3(
      end.getX(0) - start.getX(0),
      0,
      end.getZ(0) - start.getZ(0),
    ).normalize();
    const tangent = new THREE.Vector3(0, 0, -1);
    expect(Math.abs(barVec.dot(tangent))).toBeLessThan(1e-6); // perpendicular: dot ~ 0
  });
});
