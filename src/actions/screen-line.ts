import * as THREE from "three";
import { tangentBetween, perpendicularOf } from "../paths/tangent";

const SCREEN_BAR_HALF_LENGTH_M = 0.3;

/** Solid line to the screen position, terminated by a short perpendicular bar
 *  instead of an arrowhead. */
export function buildScreenLine(points: THREE.Vector3[], color = "#222222"): THREE.Group {
  if (points.length < 2) throw new Error("buildScreenLine requires at least 2 points");

  const group = new THREE.Group();
  group.name = "screen-path";

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
  line.name = "screen-line";
  group.add(line);

  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const tangent = tangentBetween(prev, end);
  const normal = perpendicularOf(tangent);
  const barPoints = [
    end.clone().addScaledVector(normal, SCREEN_BAR_HALF_LENGTH_M),
    end.clone().addScaledVector(normal, -SCREEN_BAR_HALF_LENGTH_M),
  ];
  const bar = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(barPoints),
    new THREE.LineBasicMaterial({ color }),
  );
  bar.name = "screen-bar";
  group.add(bar);

  return group;
}
