import * as Y from "yjs";
import { DEFAULT_DURATION_MS, type TacticState } from "@/lib/engine/types";

export const COLLECTIONS = ["tokens", "layers", "tracks", "phases", "annotations", "groups"] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Transaction origin for edits made by this client; the undo manager only tracks these. */
export const LOCAL_ORIGIN = { source: "local" } as const;

export function metaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("meta");
}

export function collection<T = unknown>(doc: Y.Doc, name: Collection): Y.Map<T> {
  return doc.getMap<T>(name);
}

export function docToState(doc: Y.Doc): TacticState {
  const meta = metaMap(doc).toJSON() as Partial<TacticState["meta"]>;
  return {
    meta: {
      sport: meta.sport ?? "soccer",
      title: meta.title ?? "Untitled tactic",
      durationMs: meta.durationMs ?? DEFAULT_DURATION_MS,
      ...(typeof meta.homeFormationId === "string" ? { homeFormationId: meta.homeFormationId } : {}),
      ...(typeof meta.awayFormationId === "string" ? { awayFormationId: meta.awayFormationId } : {}),
    },
    tokens: collection(doc, "tokens").toJSON(),
    layers: collection(doc, "layers").toJSON(),
    tracks: collection(doc, "tracks").toJSON(),
    phases: collection(doc, "phases").toJSON(),
    annotations: collection(doc, "annotations").toJSON(),
    groups: collection(doc, "groups").toJSON(),
  } as TacticState;
}

/**
 * Make the document match `state` with minimal changes. Used for restoring versions and JSON imports,
 * so it is expressed as ordinary CRDT edits that merge with concurrent work.
 */
export function applyState(doc: Y.Doc, state: TacticState, origin: unknown = LOCAL_ORIGIN): void {
  doc.transact(() => {
    const meta = metaMap(doc);
    for (const [k, v] of Object.entries(state.meta)) if (meta.get(k) !== v) meta.set(k, v);
    for (const name of COLLECTIONS) {
      const map = collection(doc, name);
      const next = (state[name] ?? {}) as Record<string, unknown>;
      for (const key of [...map.keys()]) if (!(key in next)) map.delete(key);
      for (const [key, value] of Object.entries(next)) {
        if (JSON.stringify(map.get(key)) !== JSON.stringify(value)) map.set(key, value);
      }
    }
  }, origin);
}

export function createDoc(state?: TacticState): Y.Doc {
  const doc = new Y.Doc();
  if (state) applyState(doc, state, null);
  return doc;
}

export function encodeState(state: TacticState): Uint8Array {
  return Y.encodeStateAsUpdate(createDoc(state));
}

/** Merge several updates into one compact state update (drops redundant history). */
export function mergeAndCompact(updates: Uint8Array[]): Uint8Array {
  const doc = new Y.Doc();
  for (const u of updates) if (u && u.length) Y.applyUpdate(doc, u);
  return Y.encodeStateAsUpdate(doc);
}

export function decodeToState(update: Uint8Array): TacticState {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return docToState(doc);
}
