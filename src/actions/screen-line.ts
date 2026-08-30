import * as THREE from "three";
import { tangentBetween, perpendicularOf } from "../paths/tangent";
import { buildThickLine, ACTION_LINE_WIDTH } from "./thick-line";

// Prominent T-bar so the screen terminator reads clearly at thick stroke width,
// matching real coaching tools (bigger than the old 0.3 hairline bar).
const SCREEN_BAR_HALF_LENGTH_M = 0.5;
// The bar is drawn slightly thicker than the line so it stands out as a cap.
const SCREEN_BAR_WIDTH = ACTION_LINE_WIDTH * 1.3;

/** Solid line to the screen position, terminated by a short perpendicular bar
 *  instead of an arrowhead. Both the line and the bar are thick (Line2) so they
 *  render at a real, world-scaled width. */
export function buildScreenLine(points: THREE.Vector3[], color = "#222222"): THREE.Group {
  if (points.length < 2) throw new Error("buildScreenLine requires at least 2 points");

  const group = new THREE.Group();
  group.name = "screen-path";

  const line = buildThickLine(points, color);
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
  const bar = buildThickLine(barPoints, color, SCREEN_BAR_WIDTH);
  bar.name = "screen-bar";
  group.add(bar);

  return group;
}
