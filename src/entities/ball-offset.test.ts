import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  carriedBallOffset,
  BALL_CARRY_FORWARD_OFFSET_M,
  BALL_CARRY_SIDE_OFFSET_M,
} from "./ball-offset";

describe("carriedBallOffset", () => {
  const carrier = new THREE.Vector3(1, 0, 2);
  const forwardZ = new THREE.Vector3(0, 0, 1);

  it("offsets ahead along the forward vector", () => {
    const result = carriedBallOffset(carrier, forwardZ, false);
    expect(result.z).toBeCloseTo(carrier.z + BALL_CARRY_FORWARD_OFFSET_M, 5);
  });

  it("offsets to the right by default (right-handed)", () => {
    const result = carriedBallOffset(carrier, forwardZ, false);
    const sideDelta = result.x - carrier.x;
    expect(sideDelta).not.toBeCloseTo(0, 5);
    expect(Math.abs(sideDelta)).toBeCloseTo(BALL_CARRY_SIDE_OFFSET_M, 5);
  });

  it("flips the side offset sign when the carrier is left-handed", () => {
    const rightHanded = carriedBallOffset(carrier, forwardZ, false);
    const leftHanded = carriedBallOffset(carrier, forwardZ, true);
    const rightSideDelta = rightHanded.x - carrier.x;
    const leftSideDelta = leftHanded.x - carrier.x;
    expect(leftSideDelta).toBeCloseTo(-rightSideDelta, 5);
  });

  it("falls back to (0,0,-1) forward for a degenerate zero forward vector, without NaN", () => {
    const zero = new THREE.Vector3(0, 0, 0);
    const result = carriedBallOffset(carrier, zero, false);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
    expect(Number.isNaN(result.z)).toBe(false);
    expect(result.z).toBeCloseTo(carrier.z - BALL_CARRY_FORWARD_OFFSET_M, 5);
  });
});
