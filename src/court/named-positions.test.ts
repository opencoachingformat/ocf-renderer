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

  it("throws with the list of known names for an unknown name", () => {
    expect(() => fibaNamedPosition("nonexistent", FIBA_DEFAULTS)).toThrow(/Unknown named position/);
  });
});
