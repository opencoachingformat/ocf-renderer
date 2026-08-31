import { describe, it, expect } from "vitest";
import { orderFrameActions } from "./order-actions";
import type { Action } from "../types/ocf";

const dribble = { player: "offense_2", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }] } as unknown as Action;
const pass = { player: "offense_2", type: "pass", to_player: "offense_3", ball_id: "ball_1", after: "offense_2.dribble" } as unknown as Action;
const cut = { player: "offense_2", type: "cut", moves: [{ to: { x: 3, y: 3 } }], after: "offense_2.pass" } as unknown as Action;

describe("orderFrameActions", () => {
  it("sorts actions so each follows its `after` dependency, regardless of document order", () => {
    const { ordered, conflicts } = orderFrameActions([cut, pass, dribble]); // reversed
    expect(ordered.map((a) => a.type)).toEqual(["dribble", "pass", "cut"]);
    expect(conflicts.size).toBe(0);
  });

  it("preserves document order for actions without `after` (stable)", () => {
    const a = { player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }] } as unknown as Action;
    const b = { player: "offense_2", type: "move", moves: [{ to: { x: 2, y: 2 } }] } as unknown as Action;
    const { ordered } = orderFrameActions([a, b]);
    expect(ordered).toEqual([a, b]);
  });

  it("flags a cycle as conflicts and falls back without throwing", () => {
    const x = { player: "offense_1", type: "pass", to_player: "offense_2", after: "offense_1.dribble" } as unknown as Action;
    const y = { player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 0, y: 0 } }], after: "offense_1.pass" } as unknown as Action;
    const { ordered, conflicts } = orderFrameActions([x, y]);
    expect(ordered).toHaveLength(2); // no throw, both still present
    expect(conflicts.has(x)).toBe(true);
    expect(conflicts.has(y)).toBe(true);
  });

  it("flags an action whose `after` points at a non-existent action", () => {
    const a = { player: "offense_1", type: "pass", to_player: "offense_2", after: "offense_9.dribble" } as unknown as Action;
    const { ordered, conflicts } = orderFrameActions([a]);
    expect(ordered).toEqual([a]);
    expect(conflicts.has(a)).toBe(true);
  });
});
