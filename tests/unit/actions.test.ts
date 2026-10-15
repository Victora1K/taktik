import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  addPhase,
  addToken,
  commitPhaseRoute,
  commitRecording,
  deleteTokens,
  saveGroup,
  translateTokens,
  updatePhaseDuration,
} from "@/lib/collab/actions";
import {
  applyState,
  createDoc,
  decodeToState,
  docToState,
  encodeState,
  LOCAL_ORIGIN,
  mergeAndCompact,
} from "@/lib/collab/doc";
import { createInitialState } from "@/lib/engine/factory";
import { activeLayerIds } from "@/lib/engine/tracks";

function setup() {
  const state = createInitialState({ sport: "soccer", homeCount: 2, awayCount: 0, includeBall: false });
  const doc = createDoc(state);
  const tokenId = Object.keys(state.tokens)[0];
  const layerId = Object.keys(state.layers)[0];
  return { doc, tokenId, layerId };
}

describe("doc state", () => {
  it("round-trips through encode/decode", () => {
    const state = createInitialState({ sport: "basketball", homeCount: 5, awayCount: 5 });
    const decoded = decodeToState(encodeState(state));
    expect(decoded).toEqual(state);
  });

  it("applyState makes minimal edits and removes stale entries", () => {
    const { doc, tokenId } = setup();
    const before = docToState(doc);
    const next = structuredClone(before);
    delete next.tokens[tokenId];
    next.meta.title = "Renamed";
    applyState(doc, next);
    const after = docToState(doc);
    expect(after.tokens[tokenId]).toBeUndefined();
    expect(after.meta.title).toBe("Renamed");
  });

  it("merges concurrent full-state updates without losing either side", () => {
    const { doc } = setup();
    const a = new Y.Doc();
    const b = new Y.Doc();
    Y.applyUpdate(a, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(doc));
    addToken(a, "away", 10, 10, { label: "from A" });
    addToken(b, "away", 20, 20, { label: "from B" });
    const merged = decodeToState(mergeAndCompact([Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)]));
    const labels = Object.values(merged.tokens).map((t) => t.label);
    expect(labels).toContain("from A");
    expect(labels).toContain("from B");
  });
});

describe("actions", () => {
  it("creates chained phase routes and rescales them when a duration changes", () => {
    const { doc, tokenId, layerId } = setup();
    const first = addPhase(doc, 3000);
    const second = addPhase(doc, 2000);
    commitPhaseRoute(doc, {
      phaseId: first.id,
      tokenId,
      layerId,
      points: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ],
    });
    commitPhaseRoute(doc, {
      phaseId: second.id,
      tokenId,
      layerId,
      points: [
        { x: 6, y: 0 },
        { x: 6, y: 4 },
      ],
    });
    let state = docToState(doc);
    const byPhase = Object.fromEntries(Object.values(state.tracks).map((track) => [track.phaseId, track]));
    expect(byPhase[first.id].keyframes.map((point: { t: number }) => point.t)).toEqual([0, 3000]);
    expect(byPhase[second.id].keyframes.map((point: { t: number }) => point.t)).toEqual([3000, 5000]);
    expect(state.meta.durationMs).toBe(5000);

    updatePhaseDuration(doc, first.id, 5000);
    state = docToState(doc);
    const resized = Object.fromEntries(Object.values(state.tracks).map((track) => [track.phaseId, track]));
    expect(resized[first.id].keyframes.map((point: { t: number }) => point.t)).toEqual([0, 5000]);
    expect(resized[second.id].keyframes.map((point: { t: number }) => point.t)).toEqual([5000, 7000]);
    expect(state.meta.durationMs).toBe(7000);
  });

  it("redrawing replaces only the matching player, phase and layer", () => {
    const { doc, tokenId, layerId } = setup();
    const phase = addPhase(doc);
    const first = commitPhaseRoute(doc, {
      phaseId: phase.id,
      tokenId,
      layerId,
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
    });
    const replacement = commitPhaseRoute(doc, {
      phaseId: phase.id,
      tokenId,
      layerId,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    });
    const tracks = Object.values(docToState(doc).tracks);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(replacement?.id);
    expect(tracks[0].id).not.toBe(first?.id);
    expect(tracks[0].keyframes.at(-1)?.x).toBe(4);
  });

  it("translates a token's start position and its keyframes", () => {
    const { doc, tokenId, layerId } = setup();
    commitRecording(
      doc,
      new Map([
        [
          tokenId,
          [
            { t: 0, x: 1, y: 1 },
            { t: 1000, x: 5, y: 1 },
          ],
        ],
      ]),
      {
        mode: "replace",
        activeLayerId: layerId,
        activeLayerIds: new Set([layerId]),
      },
    );
    const t0 = docToState(doc).tokens[tokenId];
    translateTokens(doc, { [tokenId]: { dx: 2, dy: -1 } });
    const st = docToState(doc);
    expect(st.tokens[tokenId].x).toBeCloseTo(t0.x + 2);
    const tr = Object.values(st.tracks)[0];
    expect(tr.keyframes[0]).toEqual({ t: 0, x: 3, y: 0 });
  });

  it("replace mode cuts overlapping motion and continues the rest from the new end point", () => {
    const { doc, tokenId, layerId } = setup();
    const opts = { mode: "replace" as const, activeLayerId: layerId, activeLayerIds: new Set([layerId]) };
    commitRecording(
      doc,
      new Map([
        [
          tokenId,
          [
            { t: 0, x: 0, y: 0 },
            { t: 4000, x: 40, y: 0 },
          ],
        ],
      ]),
      opts,
    );
    commitRecording(
      doc,
      new Map([
        [
          tokenId,
          [
            { t: 1000, x: 10, y: 0 },
            { t: 2000, x: 10, y: 10 },
          ],
        ],
      ]),
      opts,
    );
    const tracks = Object.values(docToState(doc).tracks).sort((a, b) => a.keyframes[0].t - b.keyframes[0].t);
    expect(tracks).toHaveLength(3);
    expect(tracks[0].keyframes.at(-1)).toEqual({ t: 1000, x: 10, y: 0 });
    expect(tracks[2].keyframes[0]).toEqual({ t: 2000, x: 10, y: 10 });
    expect(tracks[2].keyframes.at(-1)).toEqual({ t: 4000, x: 30, y: 10 });
  });

  it("layer mode records onto a new layer and leaves existing motion alone", () => {
    const { doc, tokenId, layerId } = setup();
    commitRecording(
      doc,
      new Map([
        [
          tokenId,
          [
            { t: 0, x: 0, y: 0 },
            { t: 1000, x: 10, y: 0 },
          ],
        ],
      ]),
      {
        mode: "replace",
        activeLayerId: layerId,
        activeLayerIds: new Set([layerId]),
      },
    );
    const res = commitRecording(
      doc,
      new Map([
        [
          tokenId,
          [
            { t: 0, x: 0, y: 0 },
            { t: 1000, x: 0, y: 10 },
          ],
        ],
      ]),
      {
        mode: "layer",
        activeLayerId: layerId,
        activeLayerIds: activeLayerIds(docToState(doc).layers),
      },
    );
    const st = docToState(doc);
    expect(Object.keys(st.layers)).toHaveLength(2);
    expect(res.layerId).not.toBe(layerId);
    expect(
      Object.values(st.tracks)
        .map((t) => t.layerId)
        .sort(),
    ).toEqual([layerId, res.layerId].sort());
  });

  it("extends the clip when a recording runs past the end", () => {
    const { doc, tokenId, layerId } = setup();
    commitRecording(
      doc,
      new Map([
        [
          tokenId,
          [
            { t: 0, x: 0, y: 0 },
            { t: 12_300, x: 10, y: 0 },
          ],
        ],
      ]),
      {
        mode: "replace",
        activeLayerId: layerId,
        activeLayerIds: new Set([layerId]),
      },
    );
    expect(docToState(doc).meta.durationMs).toBe(13_000);
  });

  it("deleting tokens removes their tracks and prunes groups", () => {
    const { doc, tokenId, layerId } = setup();
    const other = Object.keys(docToState(doc).tokens).find((id) => id !== tokenId)!;
    commitRecording(
      doc,
      new Map([
        [
          tokenId,
          [
            { t: 0, x: 0, y: 0 },
            { t: 1000, x: 10, y: 0 },
          ],
        ],
      ]),
      {
        mode: "replace",
        activeLayerId: layerId,
        activeLayerIds: new Set([layerId]),
      },
    );
    saveGroup(doc, "pair", [tokenId, other]);
    deleteTokens(doc, [tokenId]);
    const st = docToState(doc);
    expect(Object.keys(st.tracks)).toHaveLength(0);
    expect(Object.values(st.groups)[0].tokenIds).toEqual([other]);
  });

  it("local edits are undoable through the tracked origin", () => {
    const { doc } = setup();
    const undo = new Y.UndoManager([doc.getMap("tokens")], { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    const t = addToken(doc, "neutral", 1, 1);
    expect(docToState(doc).tokens[t.id]).toBeTruthy();
    undo.undo();
    expect(docToState(doc).tokens[t.id]).toBeUndefined();
  });
});
