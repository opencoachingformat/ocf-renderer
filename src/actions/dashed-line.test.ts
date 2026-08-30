import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildDashedLine } from "./dashed-line";

describe("buildDashedLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildDashedLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("builds a thick Line2 named 'pass-path' with a dashed material and line distances computed", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const line = buildDashedLine(points);
    expect(line).toBeInstanceOf(Line2);
    expect(line.name).toBe("pass-path");
    const material = line.material as LineMaterial;
    expect(material).toBeInstanceOf(LineMaterial);
    expect(material.dashed).toBe(true); // renders as a dashed pass line
    // computeLineDistances() populates the per-instance dash distances the
    // dashed shader needs (Line2's equivalent of BufferGeometry lineDistance).
    expect(line.geometry.getAttribute("instanceDistanceStart")).toBeDefined();
  });

  it("accepts an optional color argument and applies it to the dashed material", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)];
    const line = buildDashedLine(points, "#ff8800");
    const material = line.material as LineMaterial;
    expect(material.color.getHexString()).toBe("ff8800");
  });
});
