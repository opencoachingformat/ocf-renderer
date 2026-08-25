import { describe, it, expect } from "vitest";
import { entityRef, type FrameState, type OcfDocument } from "./ocf";

describe("OcfDocument shape", () => {
  it("accepts a minimal valid v1 document literal", () => {
    const doc: OcfDocument = {
      meta: { id: "doc-1", title: "Minimal" },
      court: { ruleset: "fiba", type: "half_court" },
      entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
      balls: [{ id: "ball_1", carried_by: "offense_1" }],
      frames: [
        {
          id: "f1",
          actions: [
            { type: "move", player: "offense_1", moves: [{ to: { named: "basket" } }], intensity: "fast" },
            { type: "pass", player: "offense_1", to_player: "offense_1", variant: "hand_off" },
            { type: "screen", player: "offense_1", for_player: "offense_1" },
            { type: "defend", player: "offense_1", guards_player: "offense_1", variant: "on_ball" },
            { type: "rebound", player: "offense_1", variant: "defensive" },
            { type: "pickup", player: "offense_1", ball_id: "ball_1" },
          ],
          // See resolve-frame-state.test.ts for why the cast is needed here.
          end_state: { offense_1: { x: 1, y: 6 }, balls: { ball_1: { dead: true } } } as unknown as FrameState,
        },
      ],
    };
    expect(doc.meta.title).toBe("Minimal");
    expect(doc.frames[0].actions[0].type).toBe("move");
  });
});

describe("entityRef", () => {
  it("derives type_nr for offense/defense", () => {
    expect(entityRef({ type: "offense", nr: 3, x: 0, y: 0 })).toBe("offense_3");
    expect(entityRef({ type: "defense", nr: 1, x: 0, y: 0 })).toBe("defense_1");
  });
  it("derives bare 'coach' for the coach singleton", () => {
    expect(entityRef({ type: "coach", x: 0, y: 0 })).toBe("coach");
  });
  it("derives type_nr for cone and station", () => {
    expect(entityRef({ type: "cone", nr: 2, x: 0, y: 0 })).toBe("cone_2");
    expect(entityRef({ type: "station", nr: 4, x: 0, y: 0 })).toBe("station_4");
  });
});
