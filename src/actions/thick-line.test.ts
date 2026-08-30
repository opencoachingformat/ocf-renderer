import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { buildThickLine, ACTION_LINE_WIDTH } from "./thick-line";

describe("buildThickLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildThickLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("returns a Line2 with world-units width so it scales with the court", () => {
    const line = buildThickLine([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
    ]);
    expect(line).toBeInstanceOf(Line2);
    expect(line.material.worldUnits).toBe(true);
    expect(line.material.linewidth).toBeGreaterThan(0);
  });

  it("uses the given color and width", () => {
    const line = buildThickLine(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)],
      "#ff0000",
      0.25,
    );
    expect(line.material.color.getHexString()).toBe("ff0000");
    expect(line.material.linewidth).toBeCloseTo(0.25, 5);
  });

  it("defaults to the shared ACTION_LINE_WIDTH", () => {
    const line = buildThickLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]);
    expect(line.material.linewidth).toBeCloseTo(ACTION_LINE_WIDTH, 5);
  });

  it("carries all input points through to the geometry", () => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(2, 0, 0),
    ];
    const line = buildThickLine(pts);
    // LineGeometry stores 3 components per point in its instanceStart buffer.
    const posAttr = line.geometry.getAttribute("instanceStart");
    expect(posAttr.count).toBe(pts.length - 1); // one segment per adjacent pair
  });
});
