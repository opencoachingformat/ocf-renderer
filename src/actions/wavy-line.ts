import * as THREE from "three";
import { tangentBetween, perpendicularOf } from "../paths/tangent";

const WAVELENGTH_M = 0.6;
const AMPLITUDE_M = 0.12;

/** Wavy line for dribble actions. Displaces each interior point
 *  perpendicular to the local tangent by a sine wave whose cycle count is
 *  derived from total path length / wavelength, rounded up to at least 1 so
 *  short dribbles still show one full arc instead of a squashed fraction. */
export function buildWavyLine(points: THREE.Vector3[], color = "#222222"): THREE.Line {
  if (points.length < 2) throw new Error("buildWavyLine requires at least 2 points");

  let totalLength = 0;
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    totalLength += points[i].distanceTo(points[i - 1]);
    cumulative.push(totalLength);
  }

  const cycles = Math.max(1, Math.round(totalLength / WAVELENGTH_M));
  const amplitude = totalLength < WAVELENGTH_M ? AMPLITUDE_M * (totalLength / WAVELENGTH_M) : AMPLITUDE_M;

  const wavy = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p.clone();
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = tangentBetween(prev, next);
    const normal = perpendicularOf(tangent);
    const t = totalLength > 0 ? cumulative[i] / totalLength : 0;
    const displacement = amplitude * Math.sin(2 * Math.PI * cycles * t);
    return p.clone().addScaledVector(normal, displacement);
  });

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(wavy),
    new THREE.LineBasicMaterial({ color }),
  );
  line.name = "dribble-path";
  return line;
}
