import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { composeFrame } from "./compose-frame";

function baseDoc(overrides: Partial<OcfDocument["frames"][0]> & Partial<Pick<OcfDocument, "balls">> = {}): OcfDocument {
  const { balls, ...frameOverrides } = overrides;
  return {
    meta: { id: "t", title: "compose test" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [
      { type: "offense", nr: 4, x: 0, y: 5 },
      { type: "defense", nr: 1, x: 1, y: 6, rotation: 90 },
    ],
    balls: balls ?? [{ id: "ball_1", carried_by: "offense_4" }],
    frames: [
      { id: "f1", actions: [], end_state: {}, ...frameOverrides },
    ],
  };
}

describe("composeFrame", () => {
  it("builds 2 entity symbols, a carried ball offset off the carrier, and a move-path + arrowhead", () => {
    const doc = baseDoc({
      actions: [{ type: "move", player: "offense_4", moves: [{ to: { x: 2, y: 7 } }] }],
    });
    const scene = composeFrame(doc, 0);

    const entities = scene.getObjectByName("entities")!;
    expect(entities.children).toHaveLength(2);

    const balls = scene.getObjectByName("balls")!;
    expect(balls.children).toHaveLength(1);
    const carrierSymbol = entities.children[0];
    expect(balls.children[0].position.equals(carrierSymbol.position)).toBe(false); // offset applied

    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("move-path")).toBeInstanceOf(THREE.Line);
    expect(actions.getObjectByName("arrowhead")).toBeInstanceOf(THREE.Mesh);
  });

  it("renders multiple balls and skips dead ones", () => {
    const doc = baseDoc({
      balls: [
        { id: "ball_1", carried_by: "offense_4" },
        { id: "ball_2", at: { x: 3, y: 3 } },
        { id: "ball_3", dead: true },
      ],
    });
    const scene = composeFrame(doc, 0);
    const balls = scene.getObjectByName("balls")!;
    expect(balls.children).toHaveLength(2); // dead ball not drawn
  });

  it("skips defend/rebound/pickup actions and station entities without drawing or throwing", () => {
    const doc = baseDoc({
      actions: [
        { type: "defend", player: "defense_1", guards_player: "offense_4" },
        { type: "rebound", player: "offense_4" },
        { type: "pickup", player: "offense_4", ball_id: "ball_1" },
      ],
    });
    doc.entities.push({ type: "station", nr: 1, x: 5, y: 5, label: "S1" });
    const scene = composeFrame(doc, 0);
    expect(scene.getObjectByName("entities")!.children).toHaveLength(2); // station not drawn
    expect(scene.getObjectByName("actions")!.children).toHaveLength(0);
  });

  it("builds a shoot-glyph with no path line for a shoot action", () => {
    const doc = baseDoc({ actions: [{ type: "shoot", player: "offense_4" }] });
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("shoot-glyph")).toBeInstanceOf(THREE.Group);
    // three.js's getObjectByName returns undefined (never null) when no match is found.
    expect(actions.getObjectByName("move-path")).toBeUndefined();
  });
});
