import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildCourt } from "./build-court";
import { resolveCourtDimensions } from "./coordinate-transformer";
import { DEFAULT_COLOR_SCHEME } from "../style/color-scheme";

describe("buildCourt", () => {
  const court = { ruleset: "fiba", type: "half_court" } as const;
  const dims = resolveCourtDimensions(court);

  it("returns a THREE.Group named 'court'", () => {
    const group = buildCourt(court, dims, DEFAULT_COLOR_SCHEME);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe("court");
  });

  it("includes a floor mesh sized to the half-court bounds", () => {
    const group = buildCourt(court, dims, DEFAULT_COLOR_SCHEME);
    const floor = group.getObjectByName("court-floor") as THREE.Mesh;
    expect(floor).toBeDefined();
    floor.geometry.computeBoundingBox();
    const box = floor.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(dims.width);
  });

  it("omits the center circle for half_court and includes it for full_court", () => {
    const half = buildCourt(court, dims, DEFAULT_COLOR_SCHEME);
    const full = buildCourt({ ...court, type: "full_court" }, dims, DEFAULT_COLOR_SCHEME);
    expect(half.getObjectByName("center-circle")).toBeUndefined();
    expect(full.getObjectByName("center-circle")).toBeDefined();
  });
});
