import type { SportId } from "@/lib/sports/types";

export type TeamSide = "home" | "away" | "neutral" | "ball";
export type TokenShape = "circle" | "square" | "triangle";
export type Easing = "linear" | "smooth";

/** All coordinates are in field meters, origin at the top-left corner of the playing area. */
export interface Token {
  id: string;
  team: TeamSide;
  number?: string;
  label?: string;
  role?: string;
  color: string;
  shape: TokenShape;
  /** Multiplier on the sport's base token radius. */
  size: number;
  memberId?: string;
  /** Starting position (time 0). */
  x: number;
  y: number;
}

export interface Keyframe {
  /** Milliseconds from the start of the clip. */
  t: number;
  x: number;
  y: number;
}

export interface Track {
  id: string;
  tokenId: string;
  layerId: string;
  /** Present when this segment was authored through a timed phase. */
  phaseId?: string;
  keyframes: Keyframe[];
  easing: Easing;
  createdBy?: string;
}

export interface Layer {
  id: string;
  name: string;
  createdBy?: string;
  visible: boolean;
  muted: boolean;
  solo: boolean;
  color: string;
  order: number;
}

export type AnnotationKind = "arrow" | "line" | "zone" | "text" | "freehand";

export interface AnnotationStyle {
  color: string;
  width: number;
  dashed: boolean;
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** Flat [x1, y1, x2, y2, ...] list in meters. Zones use two corners. */
  points: number[];
  text?: string;
  style: AnnotationStyle;
  tStart?: number;
  tEnd?: number;
}

export interface TokenGroup {
  id: string;
  name: string;
  tokenIds: string[];
}

export interface Phase {
  id: string;
  name: string;
  durationMs: number;
  order: number;
}

export interface TacticMetaDoc {
  sport: SportId;
  title: string;
  durationMs: number;
  homeFormationId?: string;
  awayFormationId?: string;
}

/** Plain-JSON view of a tactic document. The live source of truth is a Y.Doc with the same shape. */
export interface TacticState {
  meta: TacticMetaDoc;
  tokens: Record<string, Token>;
  layers: Record<string, Layer>;
  tracks: Record<string, Track>;
  phases: Record<string, Phase>;
  annotations: Record<string, Annotation>;
  groups: Record<string, TokenGroup>;
}

export const DEFAULT_DURATION_MS = 10_000;
export const FRAME_MS = 1000 / 30;
