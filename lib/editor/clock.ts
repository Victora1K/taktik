import { FRAME_MS } from "@/lib/engine/types";
import { useEditor, usePlayback } from "./store";

/** Recording may run past the clip end (the clip grows); this caps runaway sessions. */
export const MAX_RECORD_MS = 120_000;

type TickListener = (time: number) => void;
const tickListeners = new Set<TickListener>();

export function onTick(cb: TickListener) {
  tickListeners.add(cb);
  return () => tickListeners.delete(cb);
}

let raf = 0;
let last = 0;

function frame(now: number) {
  const pb = usePlayback.getState();
  if (!pb.playing) {
    raf = 0;
    return;
  }
  const dt = Math.min(100, now - last);
  last = now;
  const duration = useEditor.getState().state.meta.durationMs;
  let time = pb.time + dt * pb.speed;
  let playing = true;
  if (pb.recording) {
    time = Math.min(time, MAX_RECORD_MS);
  } else if (time >= duration) {
    if (pb.loop) time = 0;
    else {
      time = duration;
      playing = false;
    }
  }
  usePlayback.setState({ time, playing });
  tickListeners.forEach((cb) => cb(time));
  raf = playing ? requestAnimationFrame(frame) : 0;
}

function ensureLoop() {
  if (raf || typeof window === "undefined") return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

usePlayback.subscribe((s, prev) => {
  if (s.playing && !prev.playing) ensureLoop();
});

export function play() {
  const { time } = usePlayback.getState();
  const duration = useEditor.getState().state.meta.durationMs;
  if (time >= duration && !usePlayback.getState().recording) usePlayback.setState({ time: 0 });
  usePlayback.setState({ playing: true });
}

export function pause() {
  usePlayback.setState({ playing: false });
}

export function togglePlay() {
  if (usePlayback.getState().playing) pause();
  else play();
}

export function seek(time: number) {
  const duration = useEditor.getState().state.meta.durationMs;
  usePlayback.setState({ time: Math.max(0, Math.min(duration, time)) });
}

export function step(frames: number) {
  pause();
  seek(usePlayback.getState().time + frames * FRAME_MS);
}

export function stopClock() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}
