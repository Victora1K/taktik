import type { Point } from "./interpolate";
import { phaseBounds } from "./phases";
import { getSport } from "@/lib/sports";
import { simplify } from "./simplify";
import { allPositionsAt } from "./tracks";
import type { Instruction, Keyframe, TacticState, Token } from "./types";

const STEP_MS = 100;

function stepToward(from: Point, to: Point, maxSpeed: number, seconds: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const maxStep = Math.max(0, maxSpeed) * seconds;
  if (distance <= maxStep || distance === 0) return { x: to.x, y: to.y };
  return { x: from.x + (dx / distance) * maxStep, y: from.y + (dy / distance) * maxStep };
}

function between(origin: Point, goal: Point, distance: number): Point {
  const dx = goal.x - origin.x;
  const dy = goal.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  const travel = Math.min(Math.max(0, distance), length);
  return { x: origin.x + (dx / length) * travel, y: origin.y + (dy / length) * travel };
}

function defendedGoal(token: Token, width: number, height: number): Point {
  return { x: token.team === "away" ? width : 0, y: height / 2 };
}

/**
 * Simulate one instruction per player across a phase and return simplified keyframes.
 * Targets that are not themselves instructed use their existing tracks. Instructed players
 * react to each other's position from the previous step, so the result does not depend on
 * object order beyond token id.
 */
export function bakeInstructions(state: TacticState, phaseId: string): Record<string, Keyframe[]> {
  const bounds = phaseBounds(state.phases, phaseId);
  if (!bounds) return {};
  const relevant = Object.values(state.instructions)
    .filter((instruction) => instruction.phaseId === phaseId && state.tokens[instruction.tokenId])
    .sort((a, b) => a.tokenId.localeCompare(b.tokenId));
  const byToken = new Map<string, Instruction>();
  for (const instruction of relevant)
    if (!byToken.has(instruction.tokenId)) byToken.set(instruction.tokenId, instruction);
  const instructions = [...byToken.values()];
  if (!instructions.length) return {};

  const sport = getSport(state.meta.sport);
  const instructed = new Set(instructions.map((instruction) => instruction.tokenId));
  let positions = allPositionsAt(state, bounds.start);
  const samples: Record<string, Keyframe[]> = {};
  for (const id of instructed) samples[id] = [{ t: bounds.start, x: positions[id].x, y: positions[id].y }];
  const followOffset = new Map<string, Point>();
  for (const instruction of instructions) {
    if (instruction.kind !== "follow" || !instruction.targetId || !positions[instruction.targetId]) continue;
    const current = positions[instruction.tokenId];
    const target = positions[instruction.targetId];
    followOffset.set(instruction.id, { x: current.x - target.x, y: current.y - target.y });
  }

  const seconds = STEP_MS / 1000;
  for (let time = bounds.start + STEP_MS; time <= bounds.end; time += STEP_MS) {
    const stamp = Math.min(time, bounds.end);
    const existing = allPositionsAt(state, stamp);
    const look = (id?: string): Point | undefined => {
      if (!id) return undefined;
      return instructed.has(id) ? positions[id] : existing[id];
    };
    const next = { ...positions };
    for (const instruction of instructions) {
      const from = positions[instruction.tokenId];
      if (!from) continue;
      let desired = from;
      if (instruction.kind === "follow") {
        const target = look(instruction.targetId);
        const offset = followOffset.get(instruction.id) ?? { x: 0, y: 0 };
        if (target) desired = { x: target.x + offset.x, y: target.y + offset.y };
      } else if (instruction.kind === "mark") {
        const opponent = look(instruction.targetId);
        if (opponent)
          desired = between(
            opponent,
            defendedGoal(state.tokens[instruction.tokenId], sport.width, sport.height),
            2,
          );
      } else if (instruction.kind === "towardBall") {
        const ball = Object.values(state.tokens).find((token) => token.team === "ball");
        const target = ball ? look(ball.id) : undefined;
        if (target) desired = target;
      } else if (instruction.kind === "holdZone" && instruction.zone) {
        desired = instruction.zone;
      } else if (instruction.kind === "coverMidpoint") {
        const a = look(instruction.targetId);
        const b = look(instruction.targetIdB);
        if (a && b) desired = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      next[instruction.tokenId] = stepToward(from, desired, instruction.maxSpeed, seconds);
    }
    positions = next;
    for (const id of instructed) samples[id].push({ t: stamp, x: positions[id].x, y: positions[id].y });
  }
  for (const id of instructed) {
    const last = samples[id][samples[id].length - 1];
    if (last.t !== bounds.end) samples[id].push({ t: bounds.end, x: last.x, y: last.y });
    samples[id] = simplify(samples[id], 0.15);
  }
  return samples;
}
