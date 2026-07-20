import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildDashedLine } from "./dashed-line";

describe("buildDashedLine", () => {
  it("builds a Line named 'pass-path' using a dashed material with line distances computed", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const line = buildDashedLine(points);
    expect(line.name).toBe("pass-path");
    expect(line.material).toBeInstanceOf(THREE.LineDashedMaterial);
    expect(line.geometry.getAttribute("lineDistance")).toBeDefined();
  });

  it("accepts an optional color argument and applies it to the dashed material", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const line = buildDashedLine(points, "#ff8800");
    const material = line.material as THREE.LineDashedMaterial;
    expect(material.color.getHexString()).toBe("ff8800");
  });
});
