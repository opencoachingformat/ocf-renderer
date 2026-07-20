import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildScreenLine } from "./screen-line";

describe("buildScreenLine", () => {
  it("builds a group with a line and a perpendicular end bar", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)];
    const group = buildScreenLine(points);
    expect(group.name).toBe("screen-path");
    const line = group.getObjectByName("screen-line");
    const bar = group.getObjectByName("screen-bar");
    expect(line).toBeInstanceOf(THREE.Line);
    expect(bar).toBeInstanceOf(THREE.Line);
  });

  it("orients the end bar perpendicular to the path's end tangent", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)]; // tangent along -Z
    const group = buildScreenLine(points);
    const bar = group.getObjectByName("screen-bar") as THREE.Line;
    const pos = bar.geometry.getAttribute("position");
    const barVec = new THREE.Vector3(
      pos.getX(1) - pos.getX(0),
      0,
      pos.getZ(1) - pos.getZ(0),
    ).normalize();
    const tangent = new THREE.Vector3(0, 0, -1);
    expect(Math.abs(barVec.dot(tangent))).toBeLessThan(1e-6); // perpendicular: dot ~ 0
  });
});
