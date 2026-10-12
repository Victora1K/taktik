import type Konva from "konva";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import type { Member } from "@/lib/data/types";
import type { SportConfig } from "@/lib/sports";
import type { PeerState } from "./store";

/** Everything non-React code (clock, recorder, shortcuts, exports) needs about the open tactic. */
export interface EditorSession {
  doc: Y.Doc;
  awareness: Awareness | null;
  undo: Y.UndoManager | null;
  readOnly: boolean;
  sport: SportConfig;
  tacticId: string;
  userId: string;
  members: Member[];
  stage: Konva.Stage | null;
}

let current: EditorSession | null = null;

export function setSession(s: EditorSession | null) {
  current = s;
}

export function getSession(): EditorSession | null {
  return current;
}

export function setPresence(patch: Partial<PeerState>) {
  const aw = current?.awareness;
  if (!aw) return;
  const prev = (aw.getLocalState() ?? {}) as PeerState;
  aw.setLocalState({ ...prev, ...patch });
}
