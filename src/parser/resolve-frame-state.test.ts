import { describe, it, expect } from "vitest";
import { resolveFrameState } from "./resolve-frame-state";
import type { OcfDocument } from "../types/ocf";

const baseDoc = (frames: OcfDocument["frames"]): OcfDocument => ({
  version: "1.0",
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ id: "o1", type: "offense", number: 4 }],
  frames,
});

describe("resolveFrameState", () => {
  it("uses frame 0's own start_state when present", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { entities: [{ entity_ref: "o1", position: { x: 1, y: 2 } }] } },
    ]);
    const state = resolveFrameState(doc, 0, "start");
    expect(state.entities[0].position).toEqual({ x: 1, y: 2 });
  });

  it("falls back to the previous frame's end_state when start_state is omitted", () => {
    const doc = baseDoc([
      { id: "f1", end_state: { entities: [{ entity_ref: "o1", position: { x: 3, y: 4 } }] } },
      { id: "f2", end_state: { entities: [{ entity_ref: "o1", position: { x: 5, y: 6 } }] } },
    ]);
    const state = resolveFrameState(doc, 1, "start");
    expect(state.entities[0].position).toEqual({ x: 3, y: 4 });
  });

  it("throws a descriptive error when frame 0 has no start_state and none can be inherited", () => {
    const doc = baseDoc([{ id: "f1", actions: [] }]);
    expect(() => resolveFrameState(doc, 0, "start")).toThrow(/start_state/);
  });

  it("resolves end_state, defaulting to start_state if end_state is omitted (static frame)", () => {
    const doc = baseDoc([
      { id: "f1", start_state: { entities: [{ entity_ref: "o1", position: { x: 1, y: 1 } }] } },
    ]);
    const state = resolveFrameState(doc, 0, "end");
    expect(state.entities[0].position).toEqual({ x: 1, y: 1 });
  });
});
