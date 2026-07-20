import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildCoachSymbol } from "./coach-symbol";

describe("buildCoachSymbol", () => {
  it("returns a group named 'coach-symbol' with a 'C' label sprite", () => {
    const group = buildCoachSymbol("#2b3a55");
    expect(group.name).toBe("coach-symbol");
    const sprite = group.getObjectByName("coach-label");
    expect(sprite).toBeInstanceOf(THREE.Sprite);
  });

  it("uses the given color for the fill mesh material", () => {
    const group = buildCoachSymbol("#2b3a55");
    const fill = group.getObjectByName("coach-fill") as THREE.Mesh;
    const material = fill.material as THREE.MeshBasicMaterial;
    expect(material.color.getHexString()).toBe("2b3a55");
  });
});
