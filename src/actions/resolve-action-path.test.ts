import { describe, it, expect } from "vitest";
import type { Action, FrameState } from "../types/ocf";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { entityWorldPos, resolveActionPath } from "./resolve-action-path";

const transformer = new CoordinateTransformer({ ruleset: "fiba", type: "half_court" });

const startState: FrameState = {
  entities: [
    { entity_ref: "o1", position: { x: 0, y: 0 } },
    { entity_ref: "o2", position: { x: 3, y: 3 } },
  ],
};

describe("entityWorldPos", () => {
  it("resolves the world position of a known entity_ref", () => {
    const expected = transformer.resolveToWorld({ x: 0, y: 0 });
    const pos = entityWorldPos(startState, "o1", transformer);
    expect(pos.equals(expected)).toBe(true);
  });

  it("throws a descriptive error for an unknown entity_ref", () => {
    expect(() => entityWorldPos(startState, "ghost", transformer)).toThrow(/ghost/);
  });
});

describe("resolveActionPath", () => {
  it("chains through multiple `moves` for move/cut/dribble", () => {
    const action: Action = {
      type: "cut",
      entity_ref: "o1",
      moves: [{ to: { x: 1, y: 1 } }, { to: { x: 2, y: 2 } }],
    };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(3); // start + 2 moves
    expect(path[0].equals(transformer.resolveToWorld({ x: 0, y: 0 }))).toBe(true);
    expect(path[2].equals(transformer.resolveToWorld({ x: 2, y: 2 }))).toBe(true);
  });

  it("resolves both entity refs from startState for pass/hand_off", () => {
    const action: Action = { type: "pass", entity_ref: "o1", to_entity_ref: "o2" };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
    expect(path[1].equals(transformer.resolveToWorld({ x: 3, y: 3 }))).toBe(true);
  });

  it("resolves a free coordinate `at` for screen", () => {
    const action: Action = { type: "screen", entity_ref: "o1", at: { x: 5, y: 5 } };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
    expect(path[1].equals(transformer.resolveToWorld({ x: 5, y: 5 }))).toBe(true);
  });

  it("resolves a named coordinate `at` for screen", () => {
    const action: Action = { type: "screen", entity_ref: "o1", at: { named: "basket" } };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
  });

  it("returns null for shoot (no path)", () => {
    const action: Action = { type: "shoot", entity_ref: "o1" };
    expect(resolveActionPath(action, startState, transformer)).toBeNull();
  });

  it("throws when entity_ref is missing from startState.entities", () => {
    const action: Action = { type: "move", entity_ref: "ghost", moves: [{ to: { x: 1, y: 1 } }] };
    expect(() => resolveActionPath(action, startState, transformer)).toThrow(/ghost/);
  });
});
