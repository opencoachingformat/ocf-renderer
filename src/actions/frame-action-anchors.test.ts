import { describe, it, expect } from "vitest";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { resolveFrameActionAnchors } from "./frame-action-anchors";
import type { OcfDocument } from "../types/ocf";

// #1 dribbles to (0,0) then passes to #2; the pass must start where the dribble
// ended, not at #1's frame-start position.
const doc = {
  meta: { title: "chain" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: -3, y: 6 },
    { type: "offense", nr: 2, x: 3, y: 6 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [
    {
      id: "f1",
      actions: [
        { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }] },
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      ],
      end_state: { offense_1: { x: 0, y: 0 } },
    },
  ],
} as unknown as OcfDocument;

describe("resolveFrameActionAnchors — entity cursor chaining", () => {
  it("starts a follow-up action at the previous action's endpoint, not the frame start", () => {
    const t = new CoordinateTransformer(doc.court);
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t);

    // dribble starts at #1's frame-start position (-3, y->-6 in world z)
    expect(anchored[0].startOverride.x).toBeCloseTo(-3, 5);
    expect(anchored[0].startOverride.z).toBeCloseTo(-6, 5);

    // pass starts where the dribble ended: (0,0)
    expect(anchored[1].startOverride.x).toBeCloseTo(0, 5);
    expect(anchored[1].startOverride.z).toBeCloseTo(0, 5);
  });
});
