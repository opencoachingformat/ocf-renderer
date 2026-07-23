import { describe, it, expect } from "vitest";
import { resolveFrameState } from "./resolve-frame-state";
import type { OcfDocument } from "../types/ocf";

const baseDoc = (frames: OcfDocument["frames"], balls?: OcfDocument["balls"]): OcfDocument => ({
  version: "1.0",
  meta: { id: "t", title: "test" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [
    { type: "offense", nr: 1, x: 0, y: 3 },
    { type: "defense", nr: 1, x: 1, y: 4 },
  ],
  balls,
  frames,
});

describe("resolveFrameState", () => {
  it("seeds start of frame 0 from entity initial positions when start_state is absent", () => {
    const doc = baseDoc([{ id: "f1", actions: [], end_state: {} }]);
    const state = resolveFrameState(doc, 0, "start");
    expect(state.positions["offense_1"]).toEqual({ x: 0, y: 3 });
    expect(state.positions["defense_1"]).toEqual({ x: 1, y: 4 });
  });

  it("frame start_state overrides only the entities it names", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { offense_1: { x: 5, y: 5 } }, actions: [], end_state: {} },
    ]);
    const state = resolveFrameState(doc, 0, "start");
    expect(state.positions["offense_1"]).toEqual({ x: 5, y: 5 });
    expect(state.positions["defense_1"]).toEqual({ x: 1, y: 4 }); // untouched seed
  });

  it("chains: frame 1 start inherits frame 0 end_state merges", () => {
    const doc = baseDoc([
      { id: "f1", actions: [], end_state: { offense_1: { x: 7, y: 7 } } },
      { id: "f2", actions: [], end_state: {} },
    ]);
    const state = resolveFrameState(doc, 1, "start");
    expect(state.positions["offense_1"]).toEqual({ x: 7, y: 7 });
    expect(state.positions["defense_1"]).toEqual({ x: 1, y: 4 });
  });

  it("end resolves start merged with the frame's own end_state", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { offense_1: { x: 5, y: 5 } }, actions: [], end_state: { offense_1: { x: 9, y: 9 } } },
    ]);
    expect(resolveFrameState(doc, 0, "end").positions["offense_1"]).toEqual({ x: 9, y: 9 });
    expect(resolveFrameState(doc, 0, "start").positions["offense_1"]).toEqual({ x: 5, y: 5 });
  });

  it("seeds balls from doc.balls and merges frame-state ball overrides", () => {
    const doc = baseDoc(
      [
        { id: "f1", actions: [], end_state: { balls: { ball_1: { at: { x: 2, y: 2 } } } } },
        { id: "f2", actions: [], end_state: { balls: { ball_2: { dead: true } } } },
      ],
      [
        { id: "ball_1", carried_by: "offense_1" },
        { id: "ball_2", at: { x: 0, y: 0 } },
      ],
    );
    expect(resolveFrameState(doc, 0, "start").balls).toEqual({
      ball_1: { carried_by: "offense_1" },
      ball_2: { at: { x: 0, y: 0 } },
    });
    expect(resolveFrameState(doc, 1, "end").balls).toEqual({
      ball_1: { at: { x: 2, y: 2 } },
      ball_2: { dead: true },
    });
  });

  it("throws for an out-of-range frame index", () => {
    const doc = baseDoc([{ id: "f1", actions: [], end_state: {} }]);
    expect(() => resolveFrameState(doc, 5, "start")).toThrow(/out of range/);
  });
});
