import { describe, it, expect } from "vitest";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { resolveFrameState } from "../parser/resolve-frame-state";
import { resolveFrameActionAnchors, ballCursorAfter } from "./frame-action-anchors";
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

describe("resolveFrameActionAnchors — pass endpoint", () => {
  // #2 runs from (3,6) to (5,8); #1 passes to #2. Pass must END at #2's
  // frame-END position (5,8), regardless of action order.
  const passDoc = {
    meta: { title: "pass-to-mover" },
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
          { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
          { player: "offense_2", type: "move", moves: [{ to: { x: 5, y: 8 } }] },
        ],
        end_state: { offense_2: { x: 5, y: 8 } },
      },
    ],
  } as unknown as OcfDocument;

  it("routes a pass to the receiver's frame-end position even when the pass precedes the run", () => {
    const t = new CoordinateTransformer(passDoc.court);
    const start = resolveFrameState(passDoc, 0, "start");
    const end = resolveFrameState(passDoc, 0, "end");
    const anchored = resolveFrameActionAnchors(passDoc.frames[0].actions!, start, end, t);

    const pass = anchored[0];
    expect(pass.action.type).toBe("pass");
    expect(pass.endOverride).toBeDefined();
    expect(pass.endOverride!.x).toBeCloseTo(5, 5); // #2's end x
    expect(pass.endOverride!.z).toBeCloseTo(-8, 5); // #2's end y -> world z
  });
});

describe("resolveFrameActionAnchors — ball cursor", () => {
  // #1 has no ball at start; picks up a loose ball at their spot, then dribbles.
  const doc = {
    meta: { title: "pickup" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [{ type: "offense", nr: 1, x: -2, y: 5 }],
    balls: [{ id: "ball_1", at: { x: -2, y: 5 } }],
    frames: [
      {
        id: "f1",
        actions: [
          { player: "offense_1", type: "pickup", ball_id: "ball_1" },
          { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 1 } }] },
        ],
        end_state: { offense_1: { x: 0, y: 1 } },
      },
    ],
  } as unknown as OcfDocument;

  it("sets the ball holder to the picker-up and its position to their cursor", () => {
    const t = new CoordinateTransformer(doc.court);
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t);
    const ball = ballCursorAfter("ball_1");
    expect(ball?.holder).toBe("offense_1");
    // dribble then carried the ball to (0,1)
    expect(ball?.pos.x).toBeCloseTo(0, 5);
    expect(ball?.pos.z).toBeCloseTo(-1, 5);
  });
});
