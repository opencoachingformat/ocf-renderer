import * as THREE from "three";

const MAX_ITERATIONS = 8;

/** Nudges overlapping symbol positions apart for display only (data unchanged).
 *  Any pair closer than `2*radius + margin` is pushed apart symmetrically along
 *  the line between their centres; a few relaxation passes settle clusters of
 *  three or more. Positions that never overlap are returned unchanged. Works in
 *  the court plane (x/z); the y component is preserved. */
export function separateOverlappingSymbols(
  positions: Map<string, THREE.Vector3>,
  radius: number,
  margin: number,
): Map<string, THREE.Vector3> {
  const minGap = 2 * radius + margin;
  const out = new Map<string, THREE.Vector3>();
  for (const [ref, p] of positions) out.set(ref, p.clone());

  const refs = [...out.keys()];
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        const a = out.get(refs[i])!;
        const b = out.get(refs[j])!;
        const delta = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
        const dist = delta.length();
        if (dist >= minGap) continue;
        moved = true;
        // Deterministic direction when exactly coincident: push along +x.
        const dir = dist > 1e-6 ? delta.multiplyScalar(1 / dist) : new THREE.Vector3(1, 0, 0);
        const push = (minGap - dist) / 2;
        a.addScaledVector(dir, -push);
        b.addScaledVector(dir, push);
      }
    }
    if (!moved) break;
  }

  return out;
}
