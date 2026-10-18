import { baseball } from "./baseball";
import { basketball } from "./basketball";
import { football } from "./football";
import { soccer } from "./soccer";
import { tennis } from "./tennis";
import type { Formation, SportConfig, SportId } from "./types";
import { volleyball } from "./volleyball";

export const SPORTS: Record<SportId, SportConfig> = {
  soccer,
  basketball,
  volleyball,
  football,
  baseball,
  tennis,
};
export const SPORT_LIST: SportConfig[] = [soccer, basketball, volleyball, football, baseball, tennis];

export function formationPlayerCount(formation: Formation) {
  return formation.playerCount ?? formation.positions.length;
}

export function formationsFor(sport: SportConfig, count: number) {
  return sport.formations.filter((formation) => formationPlayerCount(formation) === count);
}

export function getSport(id: string): SportConfig {
  return SPORTS[id as SportId] ?? soccer;
}

export function isSportId(id: string): id is SportId {
  return id in SPORTS;
}

/**
 * Starting positions for `count` players of one side. Uses the formation when its size matches,
 * otherwise spreads players on a grid across that side's half.
 */
export function sidePositions(
  sport: SportConfig,
  side: "home" | "away",
  count: number,
  formationId?: string,
): [number, number][] {
  const sized = formationsFor(sport, count);
  const formation = sized.find((item) => item.id === formationId) ?? sized[0];
  if (formation && formation.positions.length === count) {
    if (side === "home") return formation.positions.map(([x, y]) => [x, y]);
    if (formation.awayPositions?.length === count) return formation.awayPositions.map(([x, y]) => [x, y]);
    return formation.positions.map(([x, y]) => [sport.width - x, sport.height - y]);
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(count / 2)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const halfW = sport.width / 2;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const c = Math.floor(i / rows);
    const r = i % rows;
    const x = ((c + 1) * halfW) / (cols + 1);
    const y = ((r + 1) * sport.height) / (rows + 1);
    out.push(side === "home" ? [x, y] : [sport.width - x, sport.height - y]);
  }
  return out;
}

export type { SportConfig, SportId } from "./types";
