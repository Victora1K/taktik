import { nanoid } from "nanoid";
import { getSport, sidePositions, type SportId } from "@/lib/sports";
import { DEFAULT_DURATION_MS, type Layer, type TacticState, type TeamSide, type Token } from "./types";

export const TEAM_COLORS: Record<TeamSide, string> = {
  home: "#2563eb",
  away: "#dc2626",
  neutral: "#eab308",
  ball: "#ffffff",
};

export const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#eab308",
  "#9333ea",
  "#f97316",
  "#0891b2",
  "#db2777",
  "#111827",
  "#ffffff",
];

export const LAYER_COLORS = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#c084fc", "#fb7185"];

export function newId(): string {
  return nanoid(10);
}

export function makeToken(partial: Partial<Token> & Pick<Token, "team" | "x" | "y">): Token {
  return {
    id: newId(),
    color: TEAM_COLORS[partial.team],
    shape: "circle",
    size: partial.team === "ball" ? 0.55 : 1,
    ...partial,
  };
}

export function makeLayer(order: number, name?: string, createdBy?: string): Layer {
  return {
    id: newId(),
    name: name ?? (order === 0 ? "Main" : `Take ${order + 1}`),
    createdBy,
    visible: true,
    muted: false,
    solo: false,
    color: LAYER_COLORS[order % LAYER_COLORS.length],
    order,
  };
}

export interface NewTacticOptions {
  sport: SportId;
  title?: string;
  homeCount: number;
  awayCount: number;
  formationId?: string;
  awayFormationId?: string;
  includeBall?: boolean;
}

export function createInitialState(opts: NewTacticOptions): TacticState {
  const sport = getSport(opts.sport);
  const tokens: Record<string, Token> = {};
  const add = (t: Token) => (tokens[t.id] = t);
  sidePositions(sport, "home", opts.homeCount, opts.formationId).forEach(([x, y], i) =>
    add(makeToken({ team: "home", x, y, number: String(i + 1) })),
  );
  sidePositions(sport, "away", opts.awayCount, opts.awayFormationId ?? opts.formationId).forEach(
    ([x, y], i) => add(makeToken({ team: "away", x, y, number: String(i + 1) })),
  );
  if (opts.includeBall !== false) add(makeToken({ team: "ball", x: sport.width / 2, y: sport.height / 2 }));
  const layer = makeLayer(0);
  return {
    meta: {
      sport: sport.id,
      title: opts.title?.trim() || `New ${sport.name.toLowerCase()} tactic`,
      durationMs: DEFAULT_DURATION_MS,
    },
    tokens,
    layers: { [layer.id]: layer },
    tracks: {},
    phases: {},
    annotations: {},
    groups: {},
  };
}

export function nextNumber(tokens: Record<string, Token>, team: TeamSide): string | undefined {
  if (team === "ball") return undefined;
  const used = new Set(
    Object.values(tokens)
      .filter((t) => t.team === team)
      .map((t) => t.number),
  );
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}
