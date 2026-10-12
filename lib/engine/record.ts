import { quantize, simplify } from "./simplify";
import type { Keyframe } from "./types";

export const SAMPLE_INTERVAL_MS = 33;

/** Collects pointer-driven positions per token while the clock runs, then turns them into keyframes. */
export class Recorder {
  readonly startedAt: number;
  private samples = new Map<string, Keyframe[]>();

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  /** Add a sample; throttled to SAMPLE_INTERVAL_MS unless forced (used at grab and release). */
  sample(tokenId: string, t: number, x: number, y: number, force = false): void {
    let list = this.samples.get(tokenId);
    if (!list) {
      list = [];
      this.samples.set(tokenId, list);
    }
    const last = list[list.length - 1];
    if (last) {
      if (t < last.t) return;
      if (!force && t - last.t < SAMPLE_INTERVAL_MS) return;
      if (t === last.t) {
        last.x = x;
        last.y = y;
        return;
      }
    }
    list.push({ t, x, y });
  }

  tokenIds(): string[] {
    return [...this.samples.keys()];
  }

  raw(tokenId: string): Keyframe[] {
    return this.samples.get(tokenId) ?? [];
  }

  /** Simplified keyframes for every token that actually moved more than `minMove` meters. */
  finish(minMove = 0.05): Map<string, Keyframe[]> {
    const out = new Map<string, Keyframe[]>();
    for (const [id, list] of this.samples) {
      if (list.length < 2) continue;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const k of list) {
        minX = Math.min(minX, k.x);
        maxX = Math.max(maxX, k.x);
        minY = Math.min(minY, k.y);
        maxY = Math.max(maxY, k.y);
      }
      if (Math.hypot(maxX - minX, maxY - minY) < minMove) continue;
      out.set(id, quantize(simplify(list)));
    }
    return out;
  }
}
