import { describe, it, expect } from "vitest";
import type { Action } from "../types/ocf";
import type { ResolvedFrameState } from "../parser/resolve-frame-state";
import { CoordinateTransformer } from "../court/coordinate-transformer";
import { entityWorldPos, resolveActionPath } from "./resolve-action-path";

const transformer = new CoordinateTransformer({ ruleset: "fiba", type: "half_court" });

const startState: ResolvedFrameState = {
  positions: {
    offense_1: { x: 0, y: 0 },
    offense_2: { x: 3, y: 3 },
  },
  balls: {},
};

describe("entityWorldPos", () => {
  it("resolves the world position of a known entity ref", () => {
    const expected = transformer.resolveToWorld({ x: 0, y: 0 });
    expect(entityWorldPos(startState, "offense_1", transformer).equals(expected)).toBe(true);
  });

  it("throws a descriptive error for an unknown ref", () => {
    expect(() => entityWorldPos(startState, "ghost", transformer)).toThrow(/ghost/);
  });
});

describe("resolveActionPath", () => {
  it("chains through multiple `moves` for move/cut/dribble", () => {
    const action: Action = {
      type: "cut",
      player: "offense_1",
      moves: [{ to: { x: 1, y: 1 } }, { to: { x: 2, y: 2 } }],
    };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(3);
    expect(path[2].equals(transformer.resolveToWorld({ x: 2, y: 2 }))).toBe(true);
  });

  it("skips move steps without `to`, and returns null when no step has `to` (move on the spot)", () => {
    const withGap: Action = {
      type: "move",
      player: "offense_1",
      moves: [{ variant: "v_cut" }, { to: { x: 1, y: 1 } }],
    };
    expect(resolveActionPath(withGap, startState, transformer)).toHaveLength(2);
    const onTheSpot: Action = { type: "move", player: "offense_1", moves: [{}] };
    expect(resolveActionPath(onTheSpot, startState, transformer)).toBeNull();
  });

  it("resolves player -> to_player for pass (hand_off is now a pass variant)", () => {
    const action: Action = { type: "pass", player: "offense_1", to_player: "offense_2", variant: "hand_off" };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path).toHaveLength(2);
    expect(path[1].equals(transformer.resolveToWorld({ x: 3, y: 3 }))).toBe(true);
  });

  it("resolves an explicit `at` for screen", () => {
    const action: Action = { type: "screen", player: "offense_1", for_player: "offense_2", at: { x: 5, y: 5 } };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path[1].equals(transformer.resolveToWorld({ x: 5, y: 5 }))).toBe(true);
  });

  it("falls back to for_player's position when screen has no `at`", () => {
    const action: Action = { type: "screen", player: "offense_1", for_player: "offense_2" };
    const path = resolveActionPath(action, startState, transformer)!;
    expect(path[1].equals(transformer.resolveToWorld({ x: 3, y: 3 }))).toBe(true);
  });

  it("returns null for shoot, defend, rebound, and pickup (no drawn path)", () => {
    const actions: Action[] = [
      { type: "shoot", player: "offense_1" },
      { type: "defend", player: "offense_1", guards_player: "offense_2" },
      { type: "rebound", player: "offense_1" },
      { type: "pickup", player: "offense_1", ball_id: "ball_1" },
    ];
    for (const action of actions) {
      expect(resolveActionPath(action, startState, transformer)).toBeNull();
    }
  });

  it("throws when player is missing from the resolved state", () => {
    const action: Action = { type: "move", player: "ghost", moves: [{ to: { x: 1, y: 1 } }] };
    expect(() => resolveActionPath(action, startState, transformer)).toThrow(/ghost/);
  });
});
