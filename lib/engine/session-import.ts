import type { Point } from "./interpolate";
import type { Keyframe } from "./types";

export interface TrackingSample {
  athlete: string;
  tMs: number;
  lat?: number;
  lng?: number;
  x?: number;
  y?: number;
}

export interface FieldCorner {
  lat: number;
  lng: number;
  x: number;
  y: number;
}

export interface WellnessContext {
  source: "whoop" | "oura";
  strain?: number;
  averageHeartRate?: number;
  readiness?: number;
  restingHeartRate?: number;
}

function numberAt(row: string[], index: Record<string, number>, name: string): number | undefined {
  const value = row[index[name]]?.trim();
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Accepts a header row of timestamp, athlete, and either latitude/longitude or x/y. Times may be milliseconds or ISO. */
export function parseSessionCsv(text: string): TrackingSample[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  if (index.athlete === undefined || index.timestamp === undefined)
    throw new Error("CSV needs timestamp and athlete columns");
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",");
      const rawTime = cells[index.timestamp]?.trim() ?? "";
      const tMs = Number.isFinite(Number(rawTime)) ? Number(rawTime) : Date.parse(rawTime);
      if (!Number.isFinite(tMs)) throw new Error(`Bad timestamp: ${rawTime}`);
      return {
        athlete: cells[index.athlete]?.trim() ?? "",
        tMs,
        lat: numberAt(cells, index, "latitude"),
        lng: numberAt(cells, index, "longitude"),
        x: numberAt(cells, index, "x"),
        y: numberAt(cells, index, "y"),
      };
    })
    .filter((sample) => sample.athlete);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Map GPS samples through four field corners. Corners are the field's top-left, top-right,
 * bottom-right, and bottom-left in that order.
 */
export function projectSamples(samples: TrackingSample[], corners: FieldCorner[]): TrackingSample[] {
  if (corners.length !== 4) throw new Error("Field calibration needs four corners");
  const [tl, tr, br, bl] = corners;
  return samples.map((sample) => {
    if (sample.x !== undefined && sample.y !== undefined) return sample;
    if (sample.lat === undefined || sample.lng === undefined) return sample;
    const width = Math.hypot(tr.lng - tl.lng, tr.lat - tl.lat) || 1;
    const along =
      ((sample.lng - tl.lng) * (tr.lng - tl.lng) + (sample.lat - tl.lat) * (tr.lat - tl.lat)) /
      (width * width);
    const top = {
      lat: lerp(tl.lat, tr.lat, along),
      lng: lerp(tl.lng, tr.lng, along),
      x: lerp(tl.x, tr.x, along),
      y: lerp(tl.y, tr.y, along),
    };
    const bottom = {
      lat: lerp(bl.lat, br.lat, along),
      lng: lerp(bl.lng, br.lng, along),
      x: lerp(bl.x, br.x, along),
      y: lerp(bl.y, br.y, along),
    };
    const height = Math.hypot(bottom.lng - top.lng, bottom.lat - top.lat) || 1;
    const across =
      ((sample.lng - top.lng) * (bottom.lng - top.lng) + (sample.lat - top.lat) * (bottom.lat - top.lat)) /
      (height * height);
    return { ...sample, x: lerp(top.x, bottom.x, across), y: lerp(top.y, bottom.y, across) };
  });
}

export function samplesToKeyframes(samples: TrackingSample[], athlete: string): Keyframe[] {
  const mine = samples
    .filter((sample) => sample.athlete === athlete && sample.x !== undefined && sample.y !== undefined)
    .sort((a, b) => a.tMs - b.tMs);
  if (!mine.length) return [];
  const start = mine[0].tMs;
  return mine.map((sample) => ({ t: sample.tMs - start, x: sample.x!, y: sample.y! }));
}

/** Apple workout routes exported as GPX. Returns one athlete's latitude/longitude trace. */
export function parseGpxRoute(xml: string, athlete: string): TrackingSample[] {
  const points = [...xml.matchAll(/<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g)];
  return points
    .map((match, index) => {
      const time = match[3].match(/<time>([^<]+)<\/time>/)?.[1];
      return {
        athlete,
        tMs: time ? Date.parse(time) : index * 1000,
        lat: Number(match[1]),
        lng: Number(match[2]),
      };
    })
    .filter(
      (sample) => Number.isFinite(sample.lat) && Number.isFinite(sample.lng) && Number.isFinite(sample.tMs),
    );
}

export function parseWhoopRecovery(payload: {
  strain?: number;
  average_heart_rate?: number;
}): WellnessContext {
  return { source: "whoop", strain: payload.strain, averageHeartRate: payload.average_heart_rate };
}

export function parseOuraReadiness(payload: {
  data?: { score?: number; contributors?: { resting_heart_rate?: number } }[];
}): WellnessContext {
  const day = payload.data?.[0];
  return { source: "oura", readiness: day?.score, restingHeartRate: day?.contributors?.resting_heart_rate };
}

export function fieldPoint(sample: TrackingSample): Point | null {
  return sample.x === undefined || sample.y === undefined ? null : { x: sample.x, y: sample.y };
}
