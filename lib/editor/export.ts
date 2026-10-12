import type Konva from "konva";
import { isSportId } from "@/lib/sports";
import type { TacticState } from "@/lib/engine/types";
import { downloadBlob, slugify } from "@/lib/utils";
import { pause, play, seek } from "./clock";
import { usePlayback } from "./store";

export function exportPng(stage: Konva.Stage, title: string) {
  const url = stage.toDataURL({ pixelRatio: 2 });
  fetch(url)
    .then((r) => r.blob())
    .then((b) => downloadBlob(b, `${slugify(title)}.png`));
}

const VIDEO_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

export function videoSupport(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Plays the clip from the start and records the composited stage canvases into a video file. */
export async function exportVideo(
  stage: Konva.Stage,
  title: string,
  onProgress?: (p: number) => void,
): Promise<void> {
  const mime = videoSupport();
  if (!mime) throw new Error("Video export is not supported in this browser");
  const w = stage.width();
  const h = stage.height();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  const draw = () => {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const layer of stage.getLayers()) {
      const el = (layer.getCanvas() as unknown as { _canvas: HTMLCanvasElement })._canvas;
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    }
  };

  const prevLoop = usePlayback.getState().loop;
  usePlayback.setState({ loop: false });
  pause();
  seek(0);
  await new Promise((r) => requestAnimationFrame(r));
  draw();
  recorder.start(250);
  play();

  await new Promise<void>((resolve) => {
    const tick = () => {
      draw();
      const { time, playing } = usePlayback.getState();
      onProgress?.(time);
      if (!playing) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // Hold the final frame briefly.
  await new Promise((r) => setTimeout(r, 400));
  draw();
  recorder.stop();
  await done;
  usePlayback.setState({ loop: prevLoop });
  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  downloadBlob(new Blob(chunks, { type: mime.split(";")[0] }), `${slugify(title)}.${ext}`);
}

export function exportJson(state: TacticState) {
  const blob = new Blob([JSON.stringify({ format: "taktik", version: 1, state }, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${slugify(state.meta.title)}.taktik.json`);
}

/** Parse and sanity-check an exported file. Throws on anything that does not look like a tactic. */
export function parseTacticJson(text: string): TacticState {
  const raw = JSON.parse(text);
  const state = (raw?.format === "taktik" ? raw.state : raw) as TacticState;
  const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObj(state) || !isObj(state.meta) || !isObj(state.tokens))
    throw new Error("This file is not a Taktik tactic");
  if (!isSportId(String(state.meta.sport))) throw new Error("Unknown sport in file");
  for (const key of ["layers", "tracks", "annotations", "groups"] as const) {
    if (state[key] === undefined) state[key] = {};
    if (!isObj(state[key])) throw new Error(`Invalid ${key} in file`);
  }
  for (const t of Object.values(state.tokens)) {
    if (typeof t.x !== "number" || typeof t.y !== "number" || typeof t.id !== "string")
      throw new Error("Invalid player in file");
  }
  for (const tr of Object.values(state.tracks)) {
    if (!Array.isArray(tr.keyframes)) throw new Error("Invalid motion in file");
  }
  return state;
}
