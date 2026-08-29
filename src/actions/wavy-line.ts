import * as THREE from "three";
import { tangentBetween, perpendicularOf } from "../paths/tangent";
import { smoothPath, resamplePath } from "../paths/smooth-path";

// An even zig-zag texture *along* the dribble path — matching how coaching tools
// (see the reference drill PDFs) draw dribbles: regular, clearly-visible waves
// that read as "dribbling" without becoming a giant serpentine. Court-unit scale.
const WAVELENGTH = 0.9; // tight, regular waves — several crests over a typical dribble
const AMPLITUDE = 0.3; // clearly visible, matching the reference drills' zig-zag
// Resolution of the emitted curve — dense enough to read as a true curve.
const SAMPLES_PER_UNIT = 24;
const MIN_SAMPLES = 64;
// The wave amplitude eases to 0 over the first/last fraction of the path so it
// starts and lands cleanly on the endpoints instead of stopping mid-crest.
const EASE_FRACTION = 0.18;

/** Smooth cosine ease-in/out envelope: 0 at the very ends, 1 across the middle,
 *  ramping over EASE_FRACTION at each end. */
function amplitudeEnvelope(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  const ramp = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x); // 0→1 as x: 0→1
  if (t < EASE_FRACTION) return ramp(t / EASE_FRACTION);
  if (t > 1 - EASE_FRACTION) return ramp((1 - t) / EASE_FRACTION);
  return 1;
}

/** Wavy line for dribble actions. The base path is smoothed to a curve and
 *  densely resampled; each sample is displaced perpendicular to the local
 *  tangent by a sine wave whose amplitude eases to 0 at both ends, so the
 *  dribble reads as a calm serpentine that lands cleanly on the target. */
export function buildWavyLine(points: THREE.Vector3[], color = "#222222"): THREE.Line {
  if (points.length < 2) throw new Error("buildWavyLine requires at least 2 points");

  // 1. Smooth the (possibly sparse) input into a curve and resample it densely,
  //    so the result is a true curve rather than a straight-segment poly-line.
  const curve = smoothPath(points);
  const rawLength = curve.getLength();
  const samples = Math.max(MIN_SAMPLES, Math.ceil(rawLength * SAMPLES_PER_UNIT));
  const base = resamplePath(curve, samples);

  // 2. Arc-length parameterization along the resampled base.
  let totalLength = 0;
  const cumulative = [0];
  for (let i = 1; i < base.length; i++) {
    totalLength += base[i].distanceTo(base[i - 1]);
    cumulative.push(totalLength);
  }
  if (totalLength < 1e-8) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(base.map((p) => p.clone())),
      new THREE.LineBasicMaterial({ color }),
    );
    line.name = "dribble-path";
    return line;
  }

  // At least one full cycle even on a short dribble, so it never squashes flat.
  const cycles = Math.max(1, Math.round(totalLength / WAVELENGTH));

  const wavy = base.map((p, i) => {
    const t = cumulative[i] / totalLength;
    if (i === 0 || i === base.length - 1) return p.clone();
    const prev = base[i - 1];
    const next = base[i + 1];
    const tangent = tangentBetween(prev, next);
    const normal = perpendicularOf(tangent);
    const displacement = AMPLITUDE * amplitudeEnvelope(t) * Math.sin(2 * Math.PI * cycles * t);
    return p.clone().addScaledVector(normal, displacement);
  });

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(wavy),
    new THREE.LineBasicMaterial({ color }),
  );
  line.name = "dribble-path";
  return line;
}
