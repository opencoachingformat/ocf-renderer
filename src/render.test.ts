import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import type { OcfDocument } from "./types/ocf";
import { OCFRenderer } from "./render";

const doc: OcfDocument = {
  meta: { id: "t", title: "test" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
  frames: [{ id: "f1", actions: [], end_state: {} }],
};

describe("OCFRenderer", () => {
  it("renderFrame returns status 'ok' with a scene and a camera fit to the court", () => {
    const renderer = new OCFRenderer(doc);
    const result = renderer.renderFrame(0);
    expect(result.status).toBe("ok");
    expect(result.camera).toBeInstanceOf(THREE.OrthographicCamera);
  });

  it("renderFrame returns 'not_implemented' with no camera after setMode('coaching_animation')", () => {
    const renderer = new OCFRenderer(doc);
    renderer.setMode("coaching_animation");
    const result = renderer.renderFrame(0);
    expect(result.status).toBe("not_implemented");
    expect(result.camera).toBeUndefined();
  });

  it("dispose() does not throw and disposes every mesh/line's geometry", () => {
    const renderer = new OCFRenderer(doc);
    const result = renderer.renderFrame(0);
    if (result.status !== "ok") throw new Error("expected status ok");
    const disposeSpies: ReturnType<typeof vi.spyOn>[] = [];
    result.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        disposeSpies.push(vi.spyOn(obj.geometry, "dispose"));
      }
    });
    expect(() => renderer.dispose(result.scene)).not.toThrow();
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalled();
  });
});
