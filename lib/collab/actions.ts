import type * as Y from "yjs";
import { makeLayer, makeToken, newId, nextNumber } from "@/lib/engine/factory";
import type { Point } from "@/lib/engine/interpolate";
import { orderedPhases, phaseBounds, phasesDuration, routeKeyframes } from "@/lib/engine/phases";
import { bakeInstructions } from "@/lib/engine/instructions";
import { getSport, sidePositions } from "@/lib/sports";
import { cutRange, shiftKeyframes, trackEnd, trackStart, trimTrack } from "@/lib/engine/tracks";
import type {
  Annotation,
  Easing,
  Instruction,
  Keyframe,
  Layer,
  Phase,
  TacticMetaDoc,
  TeamSide,
  Token,
  TokenGroup,
  Track,
} from "@/lib/engine/types";
import { collection, docToState, LOCAL_ORIGIN, metaMap } from "./doc";

const tokens = (doc: Y.Doc) => collection<Token>(doc, "tokens");
const layers = (doc: Y.Doc) => collection<Layer>(doc, "layers");
const tracks = (doc: Y.Doc) => collection<Track>(doc, "tracks");
const phases = (doc: Y.Doc) => collection<Phase>(doc, "phases");
const instructions = (doc: Y.Doc) => collection<Instruction>(doc, "instructions");
const annotations = (doc: Y.Doc) => collection<Annotation>(doc, "annotations");
const groups = (doc: Y.Doc) => collection<TokenGroup>(doc, "groups");

function tx(doc: Y.Doc, fn: () => void) {
  doc.transact(fn, LOCAL_ORIGIN);
}

// ---------- meta ----------

export function setMeta(doc: Y.Doc, patch: Partial<TacticMetaDoc>) {
  tx(doc, () => {
    const m = metaMap(doc);
    for (const [k, v] of Object.entries(patch)) m.set(k, v);
  });
}

// ---------- timed phases ----------

function safePhaseDuration(durationMs: number) {
  return Math.max(500, Math.min(30_000, Math.round(durationMs)));
}

function syncPhaseDuration(doc: Y.Doc) {
  let end = phasesDuration(phases(doc).toJSON());
  for (const track of tracks(doc).values()) end = Math.max(end, trackEnd(track));
  metaMap(doc).set("durationMs", Math.max(1000, end));
}

export function addPhase(doc: Y.Doc, durationMs = 3000): Phase {
  const ordered = orderedPhases(phases(doc).toJSON());
  const phase: Phase = {
    id: newId(),
    name: `Phase ${ordered.length + 1}`,
    durationMs: safePhaseDuration(durationMs),
    order: ordered.length,
  };
  tx(doc, () => {
    phases(doc).set(phase.id, phase);
    syncPhaseDuration(doc);
  });
  return phase;
}

export function updatePhaseDuration(doc: Y.Doc, phaseId: string, durationMs: number) {
  tx(doc, () => {
    const pmap = phases(doc);
    const phase = pmap.get(phaseId);
    const before = phaseBounds(pmap.toJSON(), phaseId);
    if (!phase || !before) return;
    const nextDuration = safePhaseDuration(durationMs);
    const delta = nextDuration - phase.durationMs;
    if (!delta) return;
    const later = new Set(
      orderedPhases(pmap.toJSON())
        .filter((candidate) => candidate.order > phase.order)
        .map((candidate) => candidate.id),
    );
    pmap.set(phaseId, { ...phase, durationMs: nextDuration });
    const tmap = tracks(doc);
    for (const [id, track] of tmap.entries()) {
      if (track.phaseId === phaseId) {
        const span = Math.max(1, before.end - before.start);
        const keyframes = track.keyframes.map((keyframe) => ({
          ...keyframe,
          t: Math.round(before.start + ((keyframe.t - before.start) / span) * nextDuration),
        }));
        tmap.set(id, { ...track, keyframes: keyframes.map(roundKf) });
      } else if (track.phaseId && later.has(track.phaseId)) {
        tmap.set(id, { ...track, keyframes: shiftKeyframes(track.keyframes, delta).map(roundKf) });
      }
    }
    syncPhaseDuration(doc);
  });
}

export function commitPhaseRoute(
  doc: Y.Doc,
  opts: { phaseId: string; tokenId: string; layerId: string; points: Point[]; userId?: string },
): Track | null {
  let created: Track | null = null;
  tx(doc, () => {
    const bounds = phaseBounds(phases(doc).toJSON(), opts.phaseId);
    if (!bounds || !tokens(doc).has(opts.tokenId) || !layers(doc).has(opts.layerId)) return;
    const keyframes = routeKeyframes(opts.points, bounds.start, bounds.end).map(roundKf);
    if (keyframes.length < 2) return;
    const tmap = tracks(doc);
    for (const [id, track] of [...tmap.entries()])
      if (track.phaseId === opts.phaseId && track.tokenId === opts.tokenId && track.layerId === opts.layerId)
        tmap.delete(id);
    const id = newId();
    created = {
      id,
      tokenId: opts.tokenId,
      layerId: opts.layerId,
      phaseId: opts.phaseId,
      keyframes,
      easing: "smooth",
      createdBy: opts.userId,
    };
    tmap.set(id, created);
    syncPhaseDuration(doc);
  });
  return created;
}

/** Store one instruction per player in the phase and replace that player's compiled phase track. */
export function commitPhaseInstructions(
  doc: Y.Doc,
  phaseId: string,
  incoming: Instruction[],
  layerId: string,
  userId?: string,
) {
  tx(doc, () => {
    const map = instructions(doc);
    const chosen = new Map<string, Instruction>();
    for (const instruction of incoming)
      if (instruction.phaseId === phaseId && tokens(doc).has(instruction.tokenId))
        chosen.set(instruction.tokenId, instruction);
    for (const [id, instruction] of [...map.entries()])
      if (instruction.phaseId === phaseId && chosen.has(instruction.tokenId)) map.delete(id);
    for (const instruction of chosen.values()) map.set(instruction.id, instruction);
    const baked = bakeInstructions(docToState(doc), phaseId);
    const tmap = tracks(doc);
    for (const tokenId of chosen.keys()) {
      for (const [id, track] of [...tmap.entries()])
        if (track.phaseId === phaseId && track.tokenId === tokenId && track.layerId === layerId)
          tmap.delete(id);
      const keyframes = baked[tokenId]?.map(roundKf);
      if (!keyframes || keyframes.length < 2) continue;
      const id = newId();
      tmap.set(id, { id, tokenId, layerId, phaseId, keyframes, easing: "smooth", createdBy: userId });
    }
    syncPhaseDuration(doc);
  });
}

export function clearPhaseRoutes(doc: Y.Doc, phaseId: string, tokenIds: string[], layerId?: string) {
  const selected = new Set(tokenIds);
  tx(doc, () => {
    for (const [id, track] of [...tracks(doc).entries()])
      if (track.phaseId === phaseId && selected.has(track.tokenId) && (!layerId || track.layerId === layerId))
        tracks(doc).delete(id);
    syncPhaseDuration(doc);
  });
}

// ---------- tokens ----------

export function addToken(
  doc: Y.Doc,
  team: TeamSide,
  x: number,
  y: number,
  extra: Partial<Token> = {},
): Token {
  const token = makeToken({ team, x, y, number: nextNumber(tokens(doc).toJSON(), team), ...extra });
  tx(doc, () => tokens(doc).set(token.id, token));
  return token;
}

export function updateTokens(doc: Y.Doc, ids: string[], patch: Partial<Token>) {
  tx(doc, () => {
    const map = tokens(doc);
    for (const id of ids) {
      const t = map.get(id);
      if (t) map.set(id, { ...t, ...patch, id });
    }
  });
}

export function deleteTokens(doc: Y.Doc, ids: string[]) {
  const set = new Set(ids);
  tx(doc, () => {
    for (const id of ids) tokens(doc).delete(id);
    for (const [id, tr] of tracks(doc).entries()) if (set.has(tr.tokenId)) tracks(doc).delete(id);
    for (const [id, g] of groups(doc).entries()) {
      const rest = g.tokenIds.filter((t) => !set.has(t));
      if (rest.length !== g.tokenIds.length) {
        if (rest.length) groups(doc).set(id, { ...g, tokenIds: rest });
        else groups(doc).delete(id);
      }
    }
  });
}

/** Move each token's whole motion (start position and every keyframe) by its own delta. */
export function translateTokens(doc: Y.Doc, deltas: Record<string, { dx: number; dy: number }>) {
  const ids = Object.keys(deltas).filter((id) => deltas[id].dx || deltas[id].dy);
  if (!ids.length) return;
  tx(doc, () => {
    const tmap = tokens(doc);
    for (const id of ids) {
      const t = tmap.get(id);
      const { dx, dy } = deltas[id];
      if (t) tmap.set(id, { ...t, x: round(t.x + dx), y: round(t.y + dy) });
    }
    for (const [id, tr] of tracks(doc).entries()) {
      const d = deltas[tr.tokenId];
      if (d && (d.dx || d.dy))
        tracks(doc).set(id, { ...tr, keyframes: shiftKeyframes(tr.keyframes, 0, d.dx, d.dy).map(roundKf) });
    }
  });
}

/** Move one side onto a formation and shift every recorded path by the same deltas. */
export function applySideFormation(doc: Y.Doc, side: "home" | "away", formationId: string) {
  tx(doc, () => {
    const meta = metaMap(doc).toJSON() as TacticMetaDoc;
    const sport = getSport(meta.sport);
    const formation = sport.formations.find((item) => item.id === formationId);
    const sideTokens = [...tokens(doc).values()]
      .filter((token) => token.team === side)
      .sort(
        (a, b) =>
          (Number(a.number) || Number.MAX_SAFE_INTEGER) - (Number(b.number) || Number.MAX_SAFE_INTEGER) ||
          (a.number ?? "").localeCompare(b.number ?? ""),
      );
    if (!formation || formation.positions.length !== sideTokens.length) return;
    const positions = sidePositions(sport, side, sideTokens.length, formationId);
    const deltas = Object.fromEntries(
      sideTokens.map((token, index) => [
        token.id,
        { dx: positions[index][0] - token.x, dy: positions[index][1] - token.y },
      ]),
    );
    const ids = Object.keys(deltas).filter((id) => deltas[id].dx || deltas[id].dy);
    const tmap = tokens(doc);
    for (const id of ids) {
      const token = tmap.get(id);
      if (token)
        tmap.set(id, { ...token, x: round(token.x + deltas[id].dx), y: round(token.y + deltas[id].dy) });
    }
    for (const [id, track] of tracks(doc).entries()) {
      const delta = deltas[track.tokenId];
      if (delta && (delta.dx || delta.dy))
        tracks(doc).set(id, {
          ...track,
          keyframes: shiftKeyframes(track.keyframes, 0, delta.dx, delta.dy).map(roundKf),
        });
    }
    metaMap(doc).set(side === "home" ? "homeFormationId" : "awayFormationId", formationId);
  });
}

export function duplicateTokens(doc: Y.Doc, ids: string[]): string[] {
  const out: string[] = [];
  tx(doc, () => {
    const map = tokens(doc);
    for (const id of ids) {
      const t = map.get(id);
      if (!t) continue;
      const copy = { ...t, id: newId(), x: t.x + 1, y: t.y + 1, number: nextNumber(map.toJSON(), t.team) };
      map.set(copy.id, copy);
      out.push(copy.id);
    }
  });
  return out;
}

// ---------- tracks ----------

export type OverdubMode = "replace" | "layer";

/**
 * Commit a recording. "replace" writes into the active layer and cuts the recorded time range out of every
 * other track of the same token; "layer" puts all recorded tracks on a fresh layer.
 */
export function commitRecording(
  doc: Y.Doc,
  recorded: Map<string, Keyframe[]>,
  opts: { mode: OverdubMode; activeLayerId: string; userId?: string; activeLayerIds: Set<string> },
): { layerId: string; trackIds: string[] } {
  let layerId = opts.activeLayerId;
  const trackIds: string[] = [];
  tx(doc, () => {
    if (opts.mode === "layer") {
      const order = layers(doc).size;
      const layer = makeLayer(order, undefined, opts.userId);
      layers(doc).set(layer.id, layer);
      layerId = layer.id;
    } else if (!layers(doc).has(layerId)) {
      const layer = makeLayer(layers(doc).size, undefined, opts.userId);
      layers(doc).set(layer.id, layer);
      layerId = layer.id;
    }
    const tmap = tracks(doc);
    let maxEnd = 0;
    for (const [tokenId, keyframes] of recorded) {
      const from = keyframes[0].t;
      const to = keyframes[keyframes.length - 1].t;
      maxEnd = Math.max(maxEnd, to);
      if (opts.mode === "replace") {
        for (const [id, tr] of [...tmap.entries()]) {
          if (tr.tokenId !== tokenId || !opts.activeLayerIds.has(tr.layerId)) continue;
          if (trackEnd(tr) < from || trackStart(tr) > to) continue;
          const { before, after } = cutRange(tr, from, to);
          tmap.delete(id);
          const end = keyframes[keyframes.length - 1];
          // The rest of the old run continues from where the new recording ended, so there is no jump.
          const shiftedAfter = after && shiftKeyframes(after, 0, end.x - after[0].x, end.y - after[0].y);
          for (const piece of [before, shiftedAfter]) {
            if (!piece) continue;
            const nid = newId();
            tmap.set(nid, { ...tr, id: nid, keyframes: piece.map(roundKf) });
          }
        }
      }
      const id = newId();
      tmap.set(id, { id, tokenId, layerId, keyframes, easing: "smooth", createdBy: opts.userId });
      trackIds.push(id);
    }
    const meta = metaMap(doc);
    const duration = (meta.get("durationMs") as number) ?? 0;
    if (maxEnd > duration) meta.set("durationMs", Math.ceil(maxEnd / 1000) * 1000);
  });
  return { layerId, trackIds };
}

export function updateTrack(doc: Y.Doc, id: string, patch: Partial<Track>) {
  tx(doc, () => {
    const tr = tracks(doc).get(id);
    if (tr) tracks(doc).set(id, { ...tr, ...patch, id });
  });
}

export function shiftTrack(doc: Y.Doc, id: string, dt: number) {
  tx(doc, () => {
    const tr = tracks(doc).get(id);
    if (tr) tracks(doc).set(id, { ...tr, keyframes: shiftKeyframes(tr.keyframes, dt).map(roundKf) });
  });
}

export function trimTrackRange(doc: Y.Doc, id: string, from: number, to: number) {
  tx(doc, () => {
    const tr = tracks(doc).get(id);
    if (!tr) return;
    const kf = trimTrack(tr, from, to);
    if (kf.length < 2) tracks(doc).delete(id);
    else tracks(doc).set(id, { ...tr, keyframes: kf.map(roundKf) });
  });
}

export function moveKeyframe(doc: Y.Doc, trackId: string, index: number, x: number, y: number) {
  tx(doc, () => {
    const tr = tracks(doc).get(trackId);
    if (!tr || !tr.keyframes[index]) return;
    const keyframes = tr.keyframes.slice();
    keyframes[index] = { ...keyframes[index], x: round(x), y: round(y) };
    tracks(doc).set(trackId, { ...tr, keyframes });
  });
}

export function deleteKeyframe(doc: Y.Doc, trackId: string, index: number) {
  tx(doc, () => {
    const tr = tracks(doc).get(trackId);
    if (!tr) return;
    const keyframes = tr.keyframes.filter((_, i) => i !== index);
    if (keyframes.length < 2) tracks(doc).delete(trackId);
    else tracks(doc).set(trackId, { ...tr, keyframes });
  });
}

export function setEasingForTokens(doc: Y.Doc, tokenIds: string[], easing: Easing) {
  const set = new Set(tokenIds);
  tx(doc, () => {
    for (const [id, tr] of tracks(doc).entries())
      if (set.has(tr.tokenId)) tracks(doc).set(id, { ...tr, easing });
  });
}

export function clearMotion(doc: Y.Doc, tokenIds: string[], layerId?: string) {
  const set = new Set(tokenIds);
  tx(doc, () => {
    for (const [id, tr] of [...tracks(doc).entries()]) {
      if (set.has(tr.tokenId) && (!layerId || tr.layerId === layerId)) tracks(doc).delete(id);
    }
  });
}

export function deleteTrack(doc: Y.Doc, id: string) {
  tx(doc, () => tracks(doc).delete(id));
}

// ---------- layers ----------

export function addLayer(doc: Y.Doc, userId?: string): Layer {
  const layer = makeLayer(layers(doc).size, undefined, userId);
  tx(doc, () => layers(doc).set(layer.id, layer));
  return layer;
}

export function updateLayer(doc: Y.Doc, id: string, patch: Partial<Layer>) {
  tx(doc, () => {
    const l = layers(doc).get(id);
    if (l) layers(doc).set(id, { ...l, ...patch, id });
  });
}

export function deleteLayer(doc: Y.Doc, id: string) {
  tx(doc, () => {
    layers(doc).delete(id);
    for (const [tid, tr] of [...tracks(doc).entries()]) if (tr.layerId === id) tracks(doc).delete(tid);
  });
}

// ---------- annotations ----------

export function addAnnotation(doc: Y.Doc, a: Omit<Annotation, "id">): Annotation {
  const ann = { ...a, id: newId(), points: a.points.map(round) };
  tx(doc, () => annotations(doc).set(ann.id, ann));
  return ann;
}

export function updateAnnotation(doc: Y.Doc, id: string, patch: Partial<Annotation>) {
  tx(doc, () => {
    const a = annotations(doc).get(id);
    if (!a) return;
    const next: Annotation = { ...a, ...patch, id };
    // `undefined` cannot be stored in Yjs JSON, so drop cleared timing fields.
    if (next.tStart === undefined) delete next.tStart;
    if (next.tEnd === undefined) delete next.tEnd;
    annotations(doc).set(id, next);
  });
}

export function translateAnnotations(doc: Y.Doc, ids: string[], dx: number, dy: number) {
  tx(doc, () => {
    for (const id of ids) {
      const a = annotations(doc).get(id);
      if (a) annotations(doc).set(id, { ...a, points: a.points.map((v, i) => round(v + (i % 2 ? dy : dx))) });
    }
  });
}

export function deleteAnnotations(doc: Y.Doc, ids: string[]) {
  tx(doc, () => ids.forEach((id) => annotations(doc).delete(id)));
}

// ---------- groups ----------

export function saveGroup(doc: Y.Doc, name: string, tokenIds: string[]): TokenGroup {
  const g = { id: newId(), name, tokenIds };
  tx(doc, () => groups(doc).set(g.id, g));
  return g;
}

export function deleteGroup(doc: Y.Doc, id: string) {
  tx(doc, () => groups(doc).delete(id));
}

// ---------- helpers ----------

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function roundKf(k: Keyframe): Keyframe {
  return { t: Math.round(k.t), x: round(k.x), y: round(k.y) };
}
