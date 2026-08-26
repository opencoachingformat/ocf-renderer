import { describe, it, expect } from "vitest";
import { fibaNamedPosition } from "./named-positions";
import { FIBA_DEFAULTS } from "./fiba-constants";

describe("fibaNamedPosition", () => {
  it("places the basket 1.575m from the baseline on the frontcourt half", () => {
    const p = fibaNamedPosition("basket", FIBA_DEFAULTS);
    expect(p.x).toBe(0);
    expect(p.y).toBeCloseTo(14 - 1.575);
  });

  it("resolves top_of_the_key to the apex of the 3-point arc", () => {
    const p = fibaNamedPosition("top_of_the_key", FIBA_DEFAULTS);
    expect(p.x).toBe(0);
    expect(p.y).toBeCloseTo(12.425 - 6.75);
  });

  it("mirrors left/right elbows across the paint centerline", () => {
    const left = fibaNamedPosition("left_elbow", FIBA_DEFAULTS);
    const right = fibaNamedPosition("right_elbow", FIBA_DEFAULTS);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.y).toBeCloseTo(right.y);
  });

  it("resolves backcourt positions as mirror of frontcourt", () => {
    const front = fibaNamedPosition("basket", FIBA_DEFAULTS);
    const back = fibaNamedPosition("backcourt.basket", FIBA_DEFAULTS);
    expect(back.x).toBe(front.x);
    expect(back.y).toBeCloseTo(-front.y);
  });

  it("resolves backcourt.free_throw_line as mirror of free_throw_line", () => {
    const front = fibaNamedPosition("free_throw_line", FIBA_DEFAULTS);
    const back = fibaNamedPosition("backcourt.free_throw_line", FIBA_DEFAULTS);
    expect(back.x).toBe(front.x);
    expect(back.y).toBeCloseTo(-front.y);
  });

  it("resolves paint_center to the defined lane landmark (10.5m in FIBA)", () => {
    const p = fibaNamedPosition("paint_center", FIBA_DEFAULTS);
    expect(p.x).toBe(0);
    // "Center of the lane" is a fixed landmark, matching @opencoachingformat/spec
    // fiba-v1.json (10.5), not the geometric midpoint of basket↔free-throw line.
    expect(p.y).toBeCloseTo(10.5);
  });

  it("resolves high_post above the elbow, toward midcourt (7.0m in FIBA)", () => {
    const elbow = fibaNamedPosition("left_elbow", FIBA_DEFAULTS);
    const hp = fibaNamedPosition("high_post_left", FIBA_DEFAULTS);
    expect(hp.x).toBeCloseTo(elbow.x);
    // "Above the elbow" = smaller y (toward midcourt), matching spec (7.0).
    expect(hp.y).toBeCloseTo(7.0);
    expect(hp.y).toBeLessThan(elbow.y);
  });

  it("places midcourt positions on the halfcourt line", () => {
    const center = fibaNamedPosition("midcourt.center", FIBA_DEFAULTS);
    const left = fibaNamedPosition("midcourt.left", FIBA_DEFAULTS);
    const right = fibaNamedPosition("midcourt.right", FIBA_DEFAULTS);
    expect(center).toEqual({ x: 0, y: 0 });
    expect(left.y).toBe(0);
    expect(right.y).toBe(0);
    expect(left.x).toBeCloseTo(-right.x);
  });

  it("resolves sideline inbound positions on the sideline at each court zone", () => {
    const fc = fibaNamedPosition("inbound.sideline_left_fc", FIBA_DEFAULTS);
    const mid = fibaNamedPosition("inbound.sideline_left_mid", FIBA_DEFAULTS);
    const bc = fibaNamedPosition("inbound.sideline_left_bc", FIBA_DEFAULTS);
    expect(fc.x).toBeCloseTo(mid.x);
    expect(mid.x).toBeCloseTo(bc.x);
    expect(mid.y).toBe(0);
    expect(fc.y).toBeCloseTo(-bc.y);

    const rightFc = fibaNamedPosition("inbound.sideline_right_fc", FIBA_DEFAULTS);
    expect(rightFc.x).toBeCloseTo(-fc.x);
  });

  it("throws with the list of known names for an unknown name", () => {
    expect(() => fibaNamedPosition("nonexistent", FIBA_DEFAULTS)).toThrow(/Unknown named position/);
  });
});
