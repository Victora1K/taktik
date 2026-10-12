import { create } from "zustand";
import type { OverdubMode } from "@/lib/collab/actions";
import type { Point } from "@/lib/engine/interpolate";
import { DEFAULT_DURATION_MS, type TacticState } from "@/lib/engine/types";

export type Tool = "select" | "pan" | "arrow" | "line" | "zone" | "text" | "freehand" | "pin";
export type RightTab = "props" | "tokens" | "layers" | "comments";

export interface PresenterState {
  time: number;
  playing: boolean;
  speed: number;
  at: number;
}

export interface PeerState {
  user?: { id: string; name: string; color: string };
  cursor?: Point | null;
  selection?: string[];
  live?: Record<string, Point> | null;
  locked?: string[] | null;
  presenting?: PresenterState | null;
}

export interface Peer extends PeerState {
  clientId: number;
}

export const emptyState = (): TacticState => ({
  meta: { sport: "soccer", title: "", durationMs: DEFAULT_DURATION_MS },
  tokens: {},
  layers: {},
  tracks: {},
  annotations: {},
  groups: {},
});

interface EditorStore {
  state: TacticState;
  tool: Tool;
  selectedTokens: string[];
  selectedAnnotations: string[];
  activeLayerId: string | null;
  overdub: OverdubMode;
  showTrails: boolean;
  editPaths: boolean;
  /** Live positions for tokens being dragged or recorded by this client. */
  overrides: Record<string, Point>;
  peers: Peer[];
  view: { zoom: number; x: number; y: number };
  rightTab: RightTab;
  pendingPin: Point | null;
  focusedCommentId: string | null;
  followClientId: number | null;
  presenting: boolean;
  canUndo: boolean;
  canRedo: boolean;
  drawColor: string;
  drawDashed: boolean;
}

const initial = (): EditorStore => ({
  state: emptyState(),
  tool: "select",
  selectedTokens: [],
  selectedAnnotations: [],
  activeLayerId: null,
  overdub: "replace",
  showTrails: true,
  editPaths: false,
  overrides: {},
  peers: [],
  view: { zoom: 1, x: 0, y: 0 },
  rightTab: "props",
  pendingPin: null,
  focusedCommentId: null,
  followClientId: null,
  presenting: false,
  canUndo: false,
  canRedo: false,
  drawColor: "#facc15",
  drawDashed: false,
});

export const useEditor = create<EditorStore>(() => initial());

interface PlaybackStore {
  time: number;
  playing: boolean;
  speed: number;
  loop: boolean;
  recording: boolean;
}

export const usePlayback = create<PlaybackStore>(() => ({
  time: 0,
  playing: false,
  speed: 1,
  loop: false,
  recording: false,
}));

export function resetEditorStores() {
  useEditor.setState(initial());
  usePlayback.setState({ time: 0, playing: false, speed: 1, loop: false, recording: false });
}

export function selectTokens(ids: string[]) {
  useEditor.setState({ selectedTokens: ids, selectedAnnotations: [] });
}

export function selectAnnotations(ids: string[]) {
  useEditor.setState({ selectedAnnotations: ids, selectedTokens: [] });
}

export function clearSelection() {
  useEditor.setState({ selectedTokens: [], selectedAnnotations: [] });
}

export function lockedByPeers(peers: Peer[]): Map<string, Peer> {
  const map = new Map<string, Peer>();
  for (const p of peers) for (const id of p.locked ?? []) map.set(id, p);
  return map;
}
