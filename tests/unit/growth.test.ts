import { describe, expect, it } from "vitest";
import { commitPhaseInstructions } from "@/lib/collab/actions";
import { createDoc, docToState } from "@/lib/collab/doc";
import { createInitialState } from "@/lib/engine/factory";
import { bakeInstructions } from "@/lib/engine/instructions";
import {
  parseGpxRoute,
  parseOuraReadiness,
  parseSessionCsv,
  parseWhoopRecovery,
  projectSamples,
  samplesToKeyframes,
} from "@/lib/engine/session-import";
import { activeVoice, voiceLayers } from "@/lib/engine/voice";
import type { Instruction, VoiceClip } from "@/lib/engine/types";

function soccerWithBall() {
  const state = createInitialState({
    sport: "soccer",
    homeCount: 1,
    awayCount: 1,
    includeBall: true,
    formationId: "5-1-2-1",
  });
  const phase = { id: "phase-1", name: "Phase 1", durationMs: 1000, order: 0 };
  state.phases[phase.id] = phase;
  return state;
}

describe("predefined instructions", () => {
  it("moves a player toward the ball during the phase", () => {
    const state = soccerWithBall();
    const marker = Object.values(state.tokens).find((token) => token.team === "home")!;
    const ball = Object.values(state.tokens).find((token) => token.team === "ball")!;
    ball.x = marker.x + 20;
    ball.y = marker.y;
    const instruction: Instruction = {
      id: "go-ball",
      phaseId: "phase-1",
      tokenId: marker.id,
      kind: "towardBall",
      maxSpeed: 5,
    };
    state.instructions[instruction.id] = instruction;
    const baked = bakeInstructions(state, "phase-1");
    const frames = baked[marker.id];
    expect(frames[0].x).toBeCloseTo(marker.x);
    expect(frames[frames.length - 1].x).toBeGreaterThan(marker.x + 4);
    expect(frames[frames.length - 1].x).toBeLessThanOrEqual(ball.x + 0.01);
  });

  it("keeps a marker between an opponent and the defended goal", () => {
    const state = soccerWithBall();
    const marker = Object.values(state.tokens).find((token) => token.team === "home")!;
    const opponent = Object.values(state.tokens).find((token) => token.team === "away")!;
    marker.x = 10;
    marker.y = 34;
    opponent.x = 40;
    opponent.y = 34;
    state.instructions.mark = {
      id: "mark",
      phaseId: "phase-1",
      tokenId: marker.id,
      kind: "mark",
      targetId: opponent.id,
      maxSpeed: 20,
    };
    const end = bakeInstructions(state, "phase-1")[marker.id].at(-1)!;
    expect(end.x).toBeGreaterThan(0);
    expect(end.x).toBeLessThan(opponent.x);
    expect(end.y).toBeCloseTo(34, 0);
  });

  it("commits the compiled track into the phase", () => {
    const state = soccerWithBall();
    const doc = createDoc(state);
    const marker = Object.values(state.tokens).find((token) => token.team === "home")!;
    const layerId = Object.keys(state.layers)[0];
    commitPhaseInstructions(
      doc,
      "phase-1",
      [
        {
          id: "hold",
          phaseId: "phase-1",
          tokenId: marker.id,
          kind: "holdZone",
          zone: { x: marker.x + 3, y: marker.y },
          maxSpeed: 5,
        },
      ],
      layerId,
    );
    const next = docToState(doc);
    expect(next.instructions.hold.kind).toBe("holdZone");
    expect(Object.values(next.tracks)[0].phaseId).toBe("phase-1");
    expect(Object.values(next.tracks)[0].keyframes.at(-1)!.x).toBeGreaterThan(marker.x);
  });
});

describe("voice cues", () => {
  const clips: VoiceClip[] = [
    { id: "tape", kind: "tape", tStartMs: 0, durationMs: 3000, storagePath: "tape", muted: false },
    {
      id: "press",
      kind: "instruction",
      tokenId: "p1",
      phaseId: "phase-1",
      tStartMs: 0,
      durationMs: 800,
      storagePath: "press",
      muted: false,
    },
    {
      id: "overlap",
      kind: "instruction",
      tokenId: "p2",
      phaseId: "phase-2",
      tStartMs: 1000,
      durationMs: 800,
      storagePath: "overlap",
      muted: false,
    },
  ];

  it("plays a general tape by itself", () => {
    expect(activeVoice(clips, "tape", 500).map((clip) => clip.id)).toEqual(["tape"]);
  });

  it("plays instruction cues without the tape", () => {
    expect(activeVoice(clips, "cues", 200).map((clip) => clip.id)).toEqual(["press"]);
  });

  it("combines the tape with the active instruction cue", () => {
    const mix = voiceLayers(clips, "both", 1200);
    expect(mix.tape?.id).toBe("tape");
    expect(mix.cues.map((clip) => clip.id)).toEqual(["overlap"]);
  });
});

describe("session import", () => {
  it("parses field coordinates and gps rows", () => {
    const samples = parseSessionCsv("timestamp,athlete,x,y\n0,Alex,1,2\n1000,Alex,4,2\n");
    expect(samplesToKeyframes(samples, "Alex").map((frame) => frame.x)).toEqual([1, 4]);
  });

  it("projects gps through the four field corners", () => {
    const projected = projectSamples(
      [{ athlete: "Alex", tMs: 0, lat: 1, lng: 1 }],
      [
        { lat: 1, lng: 0, x: 0, y: 0 },
        { lat: 1, lng: 2, x: 100, y: 0 },
        { lat: 0, lng: 2, x: 100, y: 60 },
        { lat: 0, lng: 0, x: 0, y: 60 },
      ],
    );
    expect(projected[0].x).toBeCloseTo(50);
    expect(projected[0].y).toBeCloseTo(0);
  });

  it("reads an Apple Watch GPX route", () => {
    const route = parseGpxRoute(
      `<gpx><trk><trkseg><trkpt lat="1" lon="2"><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="1.001" lon="2.001"><time>2026-01-01T00:00:01Z</time></trkpt></trkseg></trk></gpx>`,
      "Alex",
    );
    expect(route).toHaveLength(2);
    expect(route[1].tMs - route[0].tMs).toBe(1000);
  });

  it("reads Whoop strain and Oura readiness without creating a path", () => {
    expect(parseWhoopRecovery({ strain: 12.4, average_heart_rate: 148 }).strain).toBe(12.4);
    expect(
      parseOuraReadiness({ data: [{ score: 82, contributors: { resting_heart_rate: 48 } }] }).readiness,
    ).toBe(82);
  });
});
