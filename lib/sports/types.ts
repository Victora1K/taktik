export type SportId = "soccer" | "basketball" | "volleyball";

export type Marking =
  | { type: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: boolean }
  | { type: "line"; points: number[]; width?: number }
  | { type: "circle"; x: number; y: number; r: number; fill?: boolean }
  /** Angles in degrees, 0 = +x, clockwise (screen coordinates). */
  | { type: "arc"; x: number; y: number; r: number; start: number; end: number };

export interface Formation {
  id: string;
  name: string;
  /** Positions for the home side, which attacks left to right. */
  positions: [number, number][];
  /** Explicit away positions; when omitted the home positions are point-mirrored through the center. */
  awayPositions?: [number, number][];
}

export interface SportConfig {
  id: SportId;
  name: string;
  /** Playing area in meters. */
  width: number;
  height: number;
  /** Extra surface drawn around the playing area (run-off, free zone). */
  margin: number;
  surfaceColor: string;
  surroundColor: string;
  lineColor: string;
  lineWidth: number;
  maxPerSide: number;
  defaultPerSide: number;
  /** Token radius in meters at size 1. */
  tokenRadius: number;
  markings: Marking[];
  formations: Formation[];
}
