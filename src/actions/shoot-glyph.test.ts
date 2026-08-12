import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildShootGlyph } from "./shoot-glyph";

describe("buildShootGlyph", () => {
  it("returns a Group named 'shoot-glyph' positioned exactly at the shooter", () => {
    const shooterPos = new THREE.Vector3(2, 0, -3);
    const basketPos = new THREE.Vector3(2, 0, -10);
    const glyph = buildShootGlyph(shooterPos, basketPos, "#ffffff");
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe("shoot-glyph");
    expect(glyph.position.equals(shooterPos)).toBe(true);
  });

  it("faces rotation.y ~= 0 when the basket is directly at world -Z from the shooter", () => {
    const shooterPos = new THREE.Vector3(0, 0, 0);
    const basketPos = new THREE.Vector3(0, 0, -10);
    const glyph = buildShootGlyph(shooterPos, basketPos, "#ffffff");
    expect(glyph.rotation.y).toBeCloseTo(0, 5);
  });

  it("faces rotation.y ~= PI/2 when the basket is at the shooter's world +X, matching the clockwise convention from Task 8", () => {
    const shooterPos = new THREE.Vector3(0, 0, 0);
    const basketPos = new THREE.Vector3(10, 0, 0);
    const glyph = buildShootGlyph(shooterPos, basketPos, "#ffffff");
    expect(glyph.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });
});
