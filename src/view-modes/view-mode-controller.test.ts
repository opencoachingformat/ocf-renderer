import { describe, it, expect } from "vitest";
import type { OcfDocument } from "../types/ocf";
import { ViewModeController } from "./view-mode-controller";

const doc: OcfDocument = {
  version: "1.0",
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ id: "o1", type: "offense", number: 1 }],
  frames: [
    { id: "f1", start_state: { entities: [{ entity_ref: "o1", position: { x: 0, y: 0 } }] } },
  ],
};

describe("ViewModeController", () => {
  it("defaults to tactical_print mode and renders a populated scene", () => {
    const controller = new ViewModeController();
    expect(controller.getMode()).toBe("tactical_print");
    const result = controller.renderFrame(doc, 0);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.scene.getObjectByName("entities")).toBeDefined();
    }
  });

  it("returns not_implemented (without throwing) for coaching_animation", () => {
    const controller = new ViewModeController();
    controller.setMode("coaching_animation");
    const result = controller.renderFrame(doc, 0);
    expect(result).toEqual({ status: "not_implemented", mode: "coaching_animation" });
  });
});
