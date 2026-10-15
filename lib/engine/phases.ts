import type { Point } from "./interpolate";
import type { Keyframe, Phase, TacticState } from "./types";

export interface PhaseBounds {
  start: number;
  end: number;
}

export function orderedPhases(phases: Record<string, Phase>): Phase[] {
  return Object.values(phases).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function phaseBounds(phases: Record<string, Phase>, phaseId: string): PhaseBounds | null {
  let start = 0;
  for (const phase of orderedPhases(phases)) {
    const end = start + Math.max(100, phase.durationMs);
    if (phase.id === phaseId) return { start, end };
    start = end;
  }
  return null;
}

export function phasesDuration(phases: Record<string, Phase>): number {
  return orderedPhases(phases).reduce((sum, phase) => sum + Math.max(100, phase.durationMs), 0);
}

export function phaseAtTime(phases: Record<string, Phase>, time: number): Phase | null {
  const ordered = orderedPhases(phases);
  if (!ordered.length) return null;
  let start = 0;
  for (const phase of ordered) {
    const end = start + Math.max(100, phase.durationMs);
    if (time >= start && (time < end || phase === ordered[ordered.length - 1])) return phase;
    start = end;
  }
  return ordered[ordered.length - 1];
}

/**
 * Turn spatial waypoints into keyframes over a fixed time window. Times follow cumulative path length, so
 * drawing more points changes the curve without making short segments consume the same time as long ones.
 */
export function routeKeyframes(points: Point[], start: number, end: number): Keyframe[] {
  if (points.length < 2 || end <= start) return [];
  const clean: Point[] = [];
  for (const point of points) {
    const previous = clean[clean.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.001) clean.push(point);
  }
  if (clean.length < 2) return [];
  const lengths = [0];
  for (let i = 1; i < clean.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y));
  const total = lengths[lengths.length - 1];
  if (total <= 0) return [];
  return clean.map((point, i) => ({
    t: i === clean.length - 1 ? end : Math.round(start + ((end - start) * lengths[i]) / total),
    x: point.x,
    y: point.y,
  }));
}

export function phaseRouteCount(state: Pick<TacticState, "tracks">, phaseId: string): number {
  return new Set(
    Object.values(state.tracks)
      .filter((track) => track.phaseId === phaseId)
      .map((t) => t.tokenId),
  ).size;
}
