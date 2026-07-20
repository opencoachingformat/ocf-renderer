import { describe, it, expect } from "vitest";
import type { OcfDocument } from "./ocf";

describe("OcfDocument shape", () => {
  it("accepts a minimal valid document literal", () => {
    const doc: OcfDocument = {
      version: "1.0",
      court: { ruleset: "fiba", type: "half_court" },
      entities: [{ id: "o1", type: "offense", number: 4 }],
      frames: [
        {
          id: "f1",
          start_state: {
            entities: [{ entity_ref: "o1", position: { x: 0, y: 0 } }],
            ball: { status: "carried", carried_by: "o1" },
          },
          actions: [{ type: "move", entity_ref: "o1", moves: [{ to: { named: "basket" } }] }],
        },
      ],
    };
    expect(doc.entities[0].id).toBe("o1");
    expect(doc.frames[0].actions?.[0].type).toBe("move");
  });
});
