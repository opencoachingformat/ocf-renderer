import { describe, it, expect } from "vitest";
import { buildCamera } from "./camera";
import { FIBA_DEFAULTS } from "../court/fiba-constants";

describe("buildCamera", () => {
  it("sets camera.up to (0, 0, -1), the convention Task 4 depends on for \"court +y renders toward the top of the screen\"", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    expect(camera.up.toArray()).toEqual([0, 0, -1]);
  });

  it("half_court: view bounds strictly contain the frontcourt bounding box (x in [-width/2, width/2]) with margin to spare", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    const halfWidth = FIBA_DEFAULTS.width / 2;
    expect(camera.right).toBeGreaterThan(halfWidth);
    expect(camera.left).toBeLessThan(-halfWidth);
  });

  it("half_court: view bounds fit the half-court length (not the full court length)", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    const halfCourtHalfLength = FIBA_DEFAULTS.length / 2 / 2;
    expect(camera.top).toBeGreaterThan(halfCourtHalfLength);
  });

  it("full_court: view bounds cover the full court's half-length (z in [-length/2, length/2]) with margin to spare", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "full_court", 1);
    const fullHalfLength = FIBA_DEFAULTS.length / 2;
    expect(camera.top).toBeGreaterThan(fullHalfLength);
  });

  it("centers the half_court camera on the frontcourt (negative Z)", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "half_court", 1);
    expect(camera.position.z).toBeLessThan(0);
  });

  it("centers the full_court camera at Z = 0", () => {
    const camera = buildCamera(FIBA_DEFAULTS, "full_court", 1);
    expect(camera.position.z).toBeCloseTo(0, 5);
  });
});
