import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { OcfDocument } from "../types/ocf";
import { composeFrame } from "./compose-frame";

function baseDoc(overrides: Partial<OcfDocument["frames"][0]>): OcfDocument {
  return {
    version: "1.0",
    court: { ruleset: "fiba", type: "half_court" },
    entities: [
      { id: "o1", type: "offense", number: 4 },
      { id: "d1", type: "defense" },
    ],
    frames: [
      {
        id: "f1",
        start_state: {
          entities: [
            { entity_ref: "o1", position: { x: 0, y: 5 } },
            { entity_ref: "d1", position: { x: 1, y: 6 }, rotation: 90 },
          ],
          ball: { status: "carried", carried_by: "o1" },
        },
        ...overrides,
      },
    ],
  };
}

describe("composeFrame", () => {
  it("builds 2 entity symbols, a carried ball offset off the carrier, and a move-path + arrowhead", () => {
    const doc = baseDoc({
      actions: [{ type: "move", entity_ref: "o1", moves: [{ to: { x: 2, y: 7 } }] }],
    });
    const scene = composeFrame(doc, 0);

    const entities = scene.getObjectByName("entities")!;
    expect(entities.children).toHaveLength(2);

    const ball = scene.getObjectByName("ball")!;
    expect(ball).toBeDefined();
    const carrierSymbol = entities.children.find((c) => c === scene.getObjectByName("entities")!.children[0])!;
    expect(ball.position.equals(carrierSymbol.position)).toBe(false); // offset applied, not exact overlap

    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("move-path")).toBeInstanceOf(THREE.Line);
    expect(actions.getObjectByName("arrowhead")).toBeInstanceOf(THREE.Mesh);
  });

  it("builds a dribble-path for a dribble action", () => {
    const doc = baseDoc({
      actions: [{ type: "dribble", entity_ref: "o1", moves: [{ to: { x: 2, y: 7 } }] }],
    });
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("dribble-path")).toBeInstanceOf(THREE.Line);
  });

  it("builds a shoot-glyph with no path line for a shoot action", () => {
    const doc = baseDoc({ actions: [{ type: "shoot", entity_ref: "o1" }] });
    const scene = composeFrame(doc, 0);
    const actions = scene.getObjectByName("actions")!;
    expect(actions.getObjectByName("shoot-glyph")).toBeInstanceOf(THREE.Group);
    // three.js's getObjectByName returns undefined (never null) when no match is found.
    expect(actions.getObjectByName("move-path")).toBeUndefined();
    expect(actions.getObjectByName("dribble-path")).toBeUndefined();
  });
});
