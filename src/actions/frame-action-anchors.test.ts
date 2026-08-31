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

describe("resolveFrameActionAnchors — pass target (receiver's first action)", () => {
  const t = () => new CoordinateTransformer({ ruleset: "fiba", type: "half_court" } as never);

  it("catches at the receiver's START when their first action needs the ball", () => {
    const doc = {
      meta: { title: "catch-and-dribble" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [
        { type: "offense", nr: 1, x: -3, y: 6 },
        { type: "offense", nr: 2, x: 3, y: 6 },
      ],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
        { player: "offense_2", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 5, y: 2 } }], after: "offense_1.pass" },
      ], end_state: { offense_2: { x: 5, y: 2 } } }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t());
    const pass = anchored.find((a) => a.action.type === "pass")!;
    expect(pass.endOverride!.x).toBeCloseTo(3, 5); // #2 START x
    expect(pass.endOverride!.z).toBeCloseTo(-6, 5); // #2 START y -> world z
  });

  it("catches at the receiver's START when they have no action in the frame", () => {
    const doc = {
      meta: { title: "no-receiver-action" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [
        { type: "offense", nr: 1, x: -3, y: 6 },
        { type: "offense", nr: 2, x: 3, y: 6 },
      ],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      ], end_state: { offense_2: { x: 5, y: 8 } } }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t());
    const pass = anchored[0];
    expect(pass.endOverride!.x).toBeCloseTo(3, 5); // #2 START, not end (5,8)
    expect(pass.endOverride!.z).toBeCloseTo(-6, 5);
  });

  it("catches at the END of the receiver's last no-ball run when they run first", () => {
    const doc = {
      meta: { title: "run-then-catch" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [
        { type: "offense", nr: 1, x: -3, y: 6 },
        { type: "offense", nr: 2, x: 3, y: 6 },
      ],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
        { player: "offense_2", type: "move", moves: [{ to: { x: 4, y: 7 } }] },
        { player: "offense_2", type: "cut", moves: [{ to: { x: 5, y: 8 } }], after: "offense_2.move" },
      ], end_state: { offense_2: { x: 5, y: 8 } } }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, t());
    const pass = anchored.find((a) => a.action.type === "pass")!;
    expect(pass.endOverride!.x).toBeCloseTo(5, 5); // end of the cut (last run)
    expect(pass.endOverride!.z).toBeCloseTo(-8, 5);
  });
});

describe("resolveFrameActionAnchors — conflict flag", () => {
  it("marks actions in an after-cycle as conflicts", () => {
    const doc = {
      meta: { title: "cycle" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [{ id: "f1", actions: [
        { player: "offense_1", type: "pass", to_player: "offense_1", ball_id: "ball_1", after: "offense_1.dribble" },
        { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 1, y: 6 } }], after: "offense_1.pass" },
      ] }],
    } as unknown as OcfDocument;
    const start = resolveFrameState(doc, 0, "start");
    const end = resolveFrameState(doc, 0, "end");
    const anchored = resolveFrameActionAnchors(doc.frames[0].actions!, start, end, new CoordinateTransformer({ ruleset: "fiba", type: "half_court" } as never));
    expect(anchored.every((a) => a.conflict)).toBe(true);
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
