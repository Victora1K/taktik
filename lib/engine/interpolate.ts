import type { Easing, Keyframe } from "./types";

export interface Point {
  x: number;
  y: number;
}

/** Index of the last keyframe with k.t <= t (keyframes sorted by t). Returns -1 if t is before the first. */
export function findSegment(keyframes: Keyframe[], t: number): number {
  let lo = 0;
  let hi = keyframes.length - 1;
  if (hi < 0 || t < keyframes[0].t) return -1;
  if (t >= keyframes[hi].t) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keyframes[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

/** Position along keyframes at time t, clamped to the first/last keyframe outside the range. */
export function interpolate(keyframes: Keyframe[], t: number, easing: Easing = "linear"): Point {
  const n = keyframes.length;
  if (n === 0) return { x: 0, y: 0 };
  const i = findSegment(keyframes, t);
  if (i < 0) return { x: keyframes[0].x, y: keyframes[0].y };
  if (i >= n - 1) return { x: keyframes[n - 1].x, y: keyframes[n - 1].y };
  const a = keyframes[i];
  const b = keyframes[i + 1];
  const span = b.t - a.t;
  const u = span <= 0 ? 1 : (t - a.t) / span;
  if (easing === "linear" || n < 3) {
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  const p0 = keyframes[Math.max(0, i - 1)];
  const p3 = keyframes[Math.min(n - 1, i + 2)];
  return {
    x: catmullRom(p0.x, a.x, b.x, p3.x, u),
    y: catmullRom(p0.y, a.y, b.y, p3.y, u),
  };
}

/** Densely sample a track for drawing its path. */
export function samplePath(keyframes: Keyframe[], easing: Easing, stepMs = 50): number[] {
  if (keyframes.length < 2) return keyframes.flatMap((k) => [k.x, k.y]);
  if (easing === "linear") return keyframes.flatMap((k) => [k.x, k.y]);
  const start = keyframes[0].t;
  const end = keyframes[keyframes.length - 1].t;
  const pts: number[] = [];
  for (let t = start; t < end; t += stepMs) {
    const p = interpolate(keyframes, t, easing);
    pts.push(p.x, p.y);
  }
  const last = keyframes[keyframes.length - 1];
  pts.push(last.x, last.y);
  return pts;
}
