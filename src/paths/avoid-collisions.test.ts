import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { avoidCollisions, type Obstacle } from "./avoid-collisions";

describe("avoidCollisions", () => {
  it("pushes a point that falls inside an obstacle radius out to at least radius + margin", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(5, 0, 0), // sits exactly at the obstacle center
      new THREE.Vector3(10, 0, 0),
    ];
    const obstacles: Obstacle[] = [{ center: new THREE.Vector3(5, 0, 0), radius: 0.5 }];
    const result = avoidCollisions(points, obstacles, 0.1);
    const dist = result[1].distanceTo(obstacles[0].center);
    expect(dist).toBeGreaterThanOrEqual(0.6 - 1e-6);
  });

  it("leaves points outside all obstacle radii unchanged", () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(5, 0, 10),
      new THREE.Vector3(10, 0, 0),
    ];
    const obstacles: Obstacle[] = [{ center: new THREE.Vector3(5, 0, 0), radius: 0.5 }];
    const result = avoidCollisions(points, obstacles, 0.1);
    expect(result[1].equals(points[1])).toBe(true);
  });

  it("never moves the start or end endpoint, even if it coincides with an obstacle center", () => {
    const points = [
      new THREE.Vector3(5, 0, 0),
      new THREE.Vector3(7, 0, 3),
      new THREE.Vector3(9, 0, 0),
    ];
    const obstacles: Obstacle[] = [{ center: new THREE.Vector3(5, 0, 0), radius: 0.5 }];
    const result = avoidCollisions(points, obstacles, 0.1);
    expect(result[0].equals(points[0])).toBe(true);
    expect(result[result.length - 1].equals(points[points.length - 1])).toBe(true);
  });
});
