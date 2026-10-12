import { describe, expect, it } from "vitest";
import { findSegment, interpolate, samplePath } from "@/lib/engine/interpolate";
import { Recorder } from "@/lib/engine/record";
import { quantize, simplify } from "@/lib/engine/simplify";
import {
  activeLayerIds,
  cutRange,
  positionAt,
  shiftKeyframes,
  trimTrack,
  tracksByToken,
} from "@/lib/engine/tracks";
import type { Keyframe, Layer, Token, Track } from "@/lib/engine/types";

const kf = (t: number, x: number, y = 0): Keyframe => ({ t, x, y });
const token: Token = { id: "a", team: "home", color: "#000", shape: "circle", size: 1, x: 0, y: 0 };
const layer = (id: string, patch: Partial<Layer> = {}): Layer => ({
  id,
  name: id,
  visible: true,
  muted: false,
  solo: false,
  color: "#fff",
  order: 0,
  ...patch,
});
const track = (
  id: string,
  keyframes: Keyframe[],
  layerId = "L1",
  easing: Track["easing"] = "linear",
): Track => ({
  id,
  tokenId: "a",
  layerId,
  keyframes,
  easing,
});

describe("interpolate", () => {
  it("finds the segment with binary search", () => {
    const k = [kf(0, 0), kf(100, 1), kf(200, 2), kf(300, 3)];
    expect(findSegment(k, -5)).toBe(-1);
    expect(findSegment(k, 0)).toBe(0);
    expect(findSegment(k, 150)).toBe(1);
    expect(findSegment(k, 300)).toBe(3);
    expect(findSegment(k, 999)).toBe(3);
  });

  it("interpolates linearly and clamps outside the range", () => {
    const k = [kf(0, 0), kf(1000, 10)];
    expect(interpolate(k, 500).x).toBeCloseTo(5);
    expect(interpolate(k, -100).x).toBe(0);
    expect(interpolate(k, 2000).x).toBe(10);
  });

  it("smooth easing passes through keyframes", () => {
    const k = [kf(0, 0), kf(100, 5, 2), kf(200, 6, 8), kf(300, 10)];
    for (const p of k) {
      const v = interpolate(k, p.t, "smooth");
      expect(v.x).toBeCloseTo(p.x);
      expect(v.y).toBeCloseTo(p.y);
    }
  });

  it("samples a dense path for smooth tracks and keeps the end point", () => {
    const k = [kf(0, 0), kf(500, 5), kf(1000, 0, 5)];
    const pts = samplePath(k, "smooth", 50);
    expect(pts.length).toBeGreaterThan(k.length * 2);
    expect(pts.slice(-2)).toEqual([0, 5]);
  });
});

describe("simplify", () => {
  it("removes collinear points but keeps the endpoints", () => {
    const k = Array.from({ length: 31 }, (_, i) => kf(i * 33, i * 0.1));
    const s = simplify(k);
    expect(s.length).toBe(2);
    expect(s[0]).toEqual(k[0]);
    expect(s[1]).toEqual(k[30]);
  });

  it("keeps corners", () => {
    const k = [
      ...Array.from({ length: 10 }, (_, i) => kf(i * 33, i)),
      ...Array.from({ length: 10 }, (_, i) => kf(330 + i * 33, 9, i + 1)),
    ];
    const s = simplify(k);
    expect(s.some((p) => p.x === 9 && p.y <= 1)).toBe(true);
  });

  it("keeps pauses (time matters, not just position)", () => {
    const k = [kf(0, 0), kf(500, 5), kf(2500, 5), kf(3000, 10)];
    const s = simplify(k);
    expect(s.find((p) => p.t === 2500)).toBeTruthy();
  });

  it("quantizes to centimeters and milliseconds", () => {
    expect(quantize([{ t: 1.6, x: 1.23456, y: 9.87654 }])).toEqual([{ t: 2, x: 1.23, y: 9.88 }]);
  });
});

describe("tracks", () => {
  it("holds the start position before the first track and the last position after it", () => {
    const tr = [track("t1", [kf(1000, 10), kf(2000, 20)])];
    expect(positionAt({ ...token, x: 3 }, tr, 500)).toEqual({ x: 3, y: 0 });
    expect(positionAt(token, tr, 1500).x).toBeCloseTo(15);
    expect(positionAt(token, tr, 5000)).toEqual({ x: 20, y: 0 });
  });

  it("uses the later-starting track when tracks overlap", () => {
    const tr = [track("t1", [kf(0, 0), kf(4000, 40)]), track("t2", [kf(1000, 100), kf(2000, 200)])];
    expect(positionAt(token, tr, 500).x).toBeCloseTo(5);
    expect(positionAt(token, tr, 1500).x).toBeCloseTo(150);
  });

  it("respects mute and solo", () => {
    expect([...activeLayerIds({ a: layer("a"), b: layer("b", { muted: true }) })]).toEqual(["a"]);
    expect(
      [
        ...activeLayerIds({
          a: layer("a"),
          b: layer("b", { solo: true }),
          c: layer("c", { muted: true, solo: true }),
        }),
      ].sort(),
    ).toEqual(["b", "c"]);
    const map = tracksByToken({
      layers: { L1: layer("L1"), L2: layer("L2", { muted: true }) },
      tracks: { t1: track("t1", [kf(0, 0), kf(1, 1)]), t2: track("t2", [kf(0, 0), kf(1, 1)], "L2") },
    });
    expect(map.get("a")?.map((t) => t.id)).toEqual(["t1"]);
  });

  it("cuts a range out of a track keeping the outside motion", () => {
    const tr = track("t1", [kf(0, 0), kf(1000, 10), kf(2000, 20), kf(3000, 30)]);
    const { before, after } = cutRange(tr, 1500, 2500);
    expect(before?.at(-1)).toEqual({ t: 1500, x: 15, y: 0 });
    expect(after?.[0]).toEqual({ t: 2500, x: 25, y: 0 });
    expect(after?.at(-1)?.x).toBe(30);
  });

  it("returns the original when the range does not overlap", () => {
    const tr = track("t1", [kf(0, 0), kf(1000, 10)]);
    expect(cutRange(tr, 2000, 3000)).toEqual({ before: tr.keyframes, after: null });
  });

  it("trims and shifts", () => {
    const tr = track("t1", [kf(0, 0), kf(1000, 10), kf(2000, 20)]);
    const trimmed = trimTrack(tr, 500, 1500);
    expect(trimmed.map((k) => k.t)).toEqual([500, 1000, 1500]);
    expect(trimmed[0].x).toBeCloseTo(5);
    expect(shiftKeyframes(tr.keyframes, -500).map((k) => k.t)).toEqual([0, 1000, 2000]);
    expect(shiftKeyframes(tr.keyframes, 250, 1, 2)[0]).toEqual({ t: 250, x: 1, y: 2 });
  });
});

describe("Recorder", () => {
  it("throttles samples and forces grab/release samples", () => {
    const r = new Recorder(0);
    r.sample("a", 0, 0, 0, true);
    r.sample("a", 10, 1, 0);
    r.sample("a", 40, 2, 0);
    r.sample("a", 41, 3, 0, true);
    expect(r.raw("a").map((k) => k.t)).toEqual([0, 40, 41]);
  });

  it("drops tokens that did not really move", () => {
    const r = new Recorder(0);
    r.sample("still", 0, 5, 5, true);
    r.sample("still", 500, 5.01, 5, true);
    r.sample("moved", 0, 0, 0, true);
    r.sample("moved", 500, 3, 4, true);
    const out = r.finish();
    expect(out.has("still")).toBe(false);
    expect(out.get("moved")).toEqual([kf(0, 0), { t: 500, x: 3, y: 4 }]);
  });
});
