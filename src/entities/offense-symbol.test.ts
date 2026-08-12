import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildOffenseSymbol } from "./offense-symbol";

describe("buildOffenseSymbol", () => {
  it("returns a group named 'offense-symbol'", () => {
    const group = buildOffenseSymbol("#2b3a55", 4);
    expect(group.name).toBe("offense-symbol");
  });

  it("includes a jersey-number sprite when a number is given", () => {
    const group = buildOffenseSymbol("#2b3a55", 4);
    const sprite = group.getObjectByName("jersey-number");
    expect(sprite).toBeInstanceOf(THREE.Sprite);
  });

  it("omits the jersey-number sprite when no number is given", () => {
    const group = buildOffenseSymbol("#2b3a55");
    expect(group.getObjectByName("jersey-number")).toBeUndefined();
  });

  it("uses the given color for the fill mesh material", () => {
    const group = buildOffenseSymbol("#2b3a55", 4);
    const fill = group.getObjectByName("offense-fill") as THREE.Mesh;
    const material = fill.material as THREE.MeshBasicMaterial;
    expect(material.color.getHexString()).toBe("2b3a55");
  });
});
