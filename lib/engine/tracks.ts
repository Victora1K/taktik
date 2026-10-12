import { interpolate, type Point } from "./interpolate";
import type { Annotation, Keyframe, Layer, TacticState, Token, Track } from "./types";

export function trackStart(track: Track): number {
  return track.keyframes[0]?.t ?? 0;
}

export function trackEnd(track: Track): number {
  return track.keyframes[track.keyframes.length - 1]?.t ?? 0;
}

/** Layers that take part in playback: soloed layers if any are soloed, otherwise all unmuted ones. */
export function activeLayerIds(layers: Record<string, Layer>): Set<string> {
  const all = Object.values(layers);
  const soloed = all.filter((l) => l.solo);
  const active = soloed.length ? soloed : all.filter((l) => !l.muted);
  return new Set(active.map((l) => l.id));
}

/** Active tracks grouped by token, each list sorted by start time. */
export function tracksByToken(state: Pick<TacticState, "tracks" | "layers">): Map<string, Track[]> {
  const active = activeLayerIds(state.layers);
  const map = new Map<string, Track[]>();
  for (const track of Object.values(state.tracks)) {
    if (!active.has(track.layerId) || track.keyframes.length === 0) continue;
    const list = map.get(track.tokenId);
    if (list) list.push(track);
    else map.set(track.tokenId, [track]);
  }
  for (const list of map.values()) list.sort((a, b) => trackStart(a) - trackStart(b));
  return map;
}

/**
 * Position of a token at time t. Before its first track it sits at its start position; inside a track it
 * follows the track; between tracks it holds the end of the latest track that has started.
 * When tracks overlap, the one that started later wins.
 */
export function positionAt(token: Token, tracks: Track[] | undefined, t: number): Point {
  if (!tracks || tracks.length === 0) return { x: token.x, y: token.y };
  let current: Track | undefined;
  for (const tr of tracks) {
    if (trackStart(tr) <= t) current = tr;
    else break;
  }
  if (!current) return { x: token.x, y: token.y };
  return interpolate(current.keyframes, t, current.easing);
}

export function allPositionsAt(
  state: TacticState,
  t: number,
  byToken = tracksByToken(state),
): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const token of Object.values(state.tokens))
    out[token.id] = positionAt(token, byToken.get(token.id), t);
  return out;
}

/** End time of the last keyframe in the document. */
export function contentEnd(state: Pick<TacticState, "tracks">): number {
  let end = 0;
  for (const tr of Object.values(state.tracks)) end = Math.max(end, trackEnd(tr));
  return end;
}

/**
 * Remove the [from, to] time range from a track. Boundary keyframes are interpolated so the motion outside the
 * range keeps its shape. Pieces shorter than two keyframes are dropped.
 */
export function cutRange(
  track: Track,
  from: number,
  to: number,
): { before: Keyframe[] | null; after: Keyframe[] | null } {
  const kf = track.keyframes;
  if (kf.length === 0 || to < trackStart(track) || from > trackEnd(track)) return { before: kf, after: null };
  const before: Keyframe[] = kf.filter((k) => k.t < from);
  const after: Keyframe[] = kf.filter((k) => k.t > to);
  if (before.length) {
    const p = interpolate(kf, from, track.easing);
    before.push({ t: from, x: p.x, y: p.y });
  }
  if (after.length) {
    const p = interpolate(kf, to, track.easing);
    after.unshift({ t: to, x: p.x, y: p.y });
  }
  return { before: before.length >= 2 ? before : null, after: after.length >= 2 ? after : null };
}

/** Keep only [from, to] of a track (used by trim handles). */
export function trimTrack(track: Track, from: number, to: number): Keyframe[] {
  const kf = track.keyframes;
  if (to <= from) return [];
  const a = interpolate(kf, from, track.easing);
  const b = interpolate(kf, to, track.easing);
  const inner = kf.filter((k) => k.t > from && k.t < to);
  return [{ t: from, x: a.x, y: a.y }, ...inner, { t: to, x: b.x, y: b.y }];
}

export function shiftKeyframes(keyframes: Keyframe[], dt: number, dx = 0, dy = 0): Keyframe[] {
  const minT = keyframes[0]?.t ?? 0;
  const safeDt = Math.max(-minT, dt);
  return keyframes.map((k) => ({ t: k.t + safeDt, x: k.x + dx, y: k.y + dy }));
}

export function annotationVisibleAt(a: Annotation, t: number): boolean {
  if (a.tStart !== undefined && t < a.tStart) return false;
  if (a.tEnd !== undefined && t > a.tEnd) return false;
  return true;
}
