import { commitRecording } from "@/lib/collab/actions";
import { Recorder } from "@/lib/engine/record";
import { activeLayerIds } from "@/lib/engine/tracks";
import type { Point } from "@/lib/engine/interpolate";
import { onTick, pause } from "./clock";
import { getSession, setPresence } from "./session";
import { useEditor, usePlayback } from "./store";

/**
 * Recording session: the clock plays (other tracks animate), and every token the user is holding is sampled on
 * each tick at its live position. Stopping commits the simplified paths in one transaction.
 */

let recorder: Recorder | null = null;
let held: string[] = [];
const locked = new Set<string>();

onTick((time) => {
  if (!recorder) return;
  const { overrides } = useEditor.getState();
  for (const id of held) {
    const p = overrides[id];
    if (p) recorder.sample(id, time, p.x, p.y);
  }
});

export function isRecording() {
  return recorder !== null;
}

export function startRecording() {
  const session = getSession();
  if (!session || session.readOnly || recorder) return;
  const { time } = usePlayback.getState();
  recorder = new Recorder(time);
  locked.clear();
  useEditor.getState().selectedTokens.forEach((id) => locked.add(id));
  setPresence({ locked: [...locked] });
  usePlayback.setState({ recording: true, playing: true });
}

/** Called when the user grabs tokens; returns false if nothing is being recorded. */
export function grab(ids: string[], positions: Record<string, Point>) {
  if (!recorder) return false;
  const { time } = usePlayback.getState();
  held = ids;
  for (const id of ids) {
    locked.add(id);
    const p = positions[id];
    if (p) recorder.sample(id, time, p.x, p.y, true);
  }
  setPresence({ locked: [...locked] });
  return true;
}

export function release() {
  if (!recorder) return;
  const { time } = usePlayback.getState();
  const { overrides } = useEditor.getState();
  for (const id of held) {
    const p = overrides[id];
    if (p) recorder.sample(id, time, p.x, p.y, true);
  }
  held = [];
}

export function stopRecording() {
  const session = getSession();
  const rec = recorder;
  if (!rec) return;
  release();
  recorder = null;
  pause();
  usePlayback.setState({ recording: false });

  const results = rec.finish();
  const editor = useEditor.getState();
  if (session && results.size) {
    const { layerId } = commitRecording(session.doc, results, {
      mode: editor.overdub,
      activeLayerId: editor.activeLayerId ?? "",
      userId: session.userId,
      activeLayerIds: activeLayerIds(editor.state.layers),
    });
    useEditor.setState({ activeLayerId: layerId });
  }
  const overrides = { ...useEditor.getState().overrides };
  for (const id of rec.tokenIds()) delete overrides[id];
  useEditor.setState({ overrides });
  locked.clear();
  setPresence({ locked: null, live: null });
  usePlayback.setState({ time: rec.startedAt });
}

export function cancelRecording() {
  if (!recorder) return;
  const ids = recorder.tokenIds();
  recorder = null;
  held = [];
  pause();
  usePlayback.setState({ recording: false });
  const overrides = { ...useEditor.getState().overrides };
  for (const id of ids) delete overrides[id];
  useEditor.setState({ overrides });
  locked.clear();
  setPresence({ locked: null, live: null });
}

export function toggleRecording() {
  if (recorder) stopRecording();
  else startRecording();
}
