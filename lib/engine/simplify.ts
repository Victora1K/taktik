import type { Keyframe } from "./types";

/**
 * Time is weighted into the distance metric so that pauses and speed changes survive simplification:
 * 1 ms counts as this many meters (0.002 = 2 m/s).
 */
const TIME_WEIGHT = 0.002;

function distToSegment(p: Keyframe, a: Keyframe, b: Keyframe): number {
  const ax = a.x,
    ay = a.y,
    at = a.t * TIME_WEIGHT;
  const dx = b.x - ax,
    dy = b.y - ay,
    dt = b.t * TIME_WEIGHT - at;
  const px = p.x - ax,
    py = p.y - ay,
    pt = p.t * TIME_WEIGHT - at;
  const len2 = dx * dx + dy * dy + dt * dt;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy + pt * dt) / len2));
  const ex = px - u * dx,
    ey = py - u * dy,
    et = pt - u * dt;
  return Math.sqrt(ex * ex + ey * ey + et * et);
}

/** Ramer-Douglas-Peucker over (x, y, weighted t). Always keeps the first and last keyframe. */
export function simplify(keyframes: Keyframe[], epsilon = 0.08): Keyframe[] {
  if (keyframes.length <= 2) return keyframes.slice();
  const keep = new Uint8Array(keyframes.length);
  keep[0] = 1;
  keep[keyframes.length - 1] = 1;
  const stack: [number, number][] = [[0, keyframes.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(keyframes[i], keyframes[s], keyframes[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return keyframes.filter((_, i) => keep[i]);
}

/** Round to keep documents small (1 cm, 1 ms). */
export function quantize(keyframes: Keyframe[]): Keyframe[] {
  return keyframes.map((k) => ({
    t: Math.round(k.t),
    x: Math.round(k.x * 100) / 100,
    y: Math.round(k.y * 100) / 100,
  }));
}
