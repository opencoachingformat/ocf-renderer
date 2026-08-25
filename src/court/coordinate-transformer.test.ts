import { describe, it, expect } from "vitest";
import { CoordinateTransformer } from "./coordinate-transformer";

describe("CoordinateTransformer", () => {
  const court = { ruleset: "fiba", type: "half_court" } as const;

  it("resolves free x/y coordinates unchanged", () => {
    const t = new CoordinateTransformer(court);
    expect(t.resolve({ x: 2, y: 3 })).toEqual({ x: 2, y: 3 });
  });

  it("resolves relative_to as an offset from a named position", () => {
    const t = new CoordinateTransformer(court);
    const base = t.resolve({ named: "basket" });
    const rel = t.resolve({ relative_to: "basket", dx: 1, dy: -1 });
    expect(rel).toEqual({ x: base.x + 1, y: base.y - 1 });
  });

  it("maps court +y to world -z and court +x to world +x", () => {
    const t = new CoordinateTransformer(court);
    const world = t.toWorld({ x: 2, y: 5 });
    expect(world.x).toBe(2);
    expect(world.z).toBe(-5);
    expect(world.y).toBe(0);
  });

  it("scales custom_dimensions from feet to meters when unit is ft", () => {
    const t = new CoordinateTransformer({
      ...court,
      custom_dimensions: {
        unit: "ft",
        length: 91.86,
        width: 49.21,
        basket_from_baseline: 5.25,
        three_point_distance: 22.15,
        paint_width: 16.08,
        paint_depth: 19.03,
        free_throw_distance: 19.03,
      },
    });
    expect(t.dimensions.length).toBeCloseTo(28, 1);
  });
});
