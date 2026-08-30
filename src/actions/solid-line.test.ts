import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { buildSolidLine } from "./solid-line";

describe("buildSolidLine", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => buildSolidLine([new THREE.Vector3(0, 0, 0)])).toThrow(/at least 2 points/);
  });

  it("builds a thick Line2 named 'move-path' carrying every input point", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 1), new THREE.Vector3(2, 0, 0)];
    const line = buildSolidLine(points);
    expect(line).toBeInstanceOf(Line2);
    expect(line.name).toBe("move-path");
    // Line2 stores one segment (instanceStart/End) per adjacent point pair,
    // so N points → N-1 segments.
    expect(line.geometry.getAttribute("instanceStart").count).toBe(points.length - 1);
    // Endpoints are preserved: first segment start & last segment end.
    const start = line.geometry.getAttribute("instanceStart");
    const end = line.geometry.getAttribute("instanceEnd");
    expect(start.getX(0)).toBeCloseTo(points[0].x);
    expect(end.getX(end.count - 1)).toBeCloseTo(points[points.length - 1].x);
  });
});
