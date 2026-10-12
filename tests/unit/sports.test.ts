import { describe, expect, it } from "vitest";
import { encodeState } from "@/lib/collab/doc";
import { fromBase64, fromByteaHex, toBase64, toByteaHex } from "@/lib/collab/encoding";
import { createInitialState, nextNumber } from "@/lib/engine/factory";
import { parseTacticJson } from "@/lib/editor/export";
import { SPORT_LIST, sidePositions } from "@/lib/sports";
import { mirrorX } from "@/lib/sports/geometry";

describe("sport configs", () => {
  it.each(SPORT_LIST.map((s) => [s.id, s] as const))(
    "%s formations fit the field and the side limit",
    (_id, sport) => {
      for (const f of sport.formations) {
        expect(f.positions.length).toBeLessThanOrEqual(sport.maxPerSide);
        for (const [x, y] of [...f.positions, ...(f.awayPositions ?? [])]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(sport.width);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(sport.height);
        }
      }
      expect(sport.defaultPerSide).toBeLessThanOrEqual(sport.maxPerSide);
    },
  );

  it("falls back to a grid in the correct half when counts do not match a formation", () => {
    for (const sport of SPORT_LIST) {
      const home = sidePositions(sport, "home", 3);
      const away = sidePositions(sport, "away", 3);
      expect(home.every(([x]) => x <= sport.width / 2)).toBe(true);
      expect(away.every(([x]) => x >= sport.width / 2)).toBe(true);
    }
  });

  it("mirrors arcs across the halfway line", () => {
    const [m] = mirrorX([{ type: "arc", x: 11, y: 34, r: 9.15, start: -53, end: 53 }], 105);
    expect(m).toEqual({ type: "arc", x: 94, y: 34, r: 9.15, start: 127, end: 233 });
  });

  it("creates the requested number of players with sequential numbers", () => {
    const st = createInitialState({ sport: "soccer", homeCount: 11, awayCount: 7, includeBall: true });
    const tokens = Object.values(st.tokens);
    expect(tokens.filter((t) => t.team === "home")).toHaveLength(11);
    expect(tokens.filter((t) => t.team === "away")).toHaveLength(7);
    expect(tokens.filter((t) => t.team === "ball")).toHaveLength(1);
    expect(nextNumber(st.tokens, "home")).toBe("12");
    expect(Object.keys(st.layers)).toHaveLength(1);
  });
});

describe("encoding", () => {
  it("round-trips base64 and bytea hex", () => {
    const bytes = encodeState(createInitialState({ sport: "volleyball", homeCount: 6, awayCount: 6 }));
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(fromByteaHex(toByteaHex(bytes))).toEqual(bytes);
    expect(fromByteaHex(null)).toBeNull();
  });
});

describe("JSON import", () => {
  it("accepts exported files and rejects junk", () => {
    const state = createInitialState({ sport: "basketball", homeCount: 5, awayCount: 5 });
    expect(parseTacticJson(JSON.stringify({ format: "taktik", version: 1, state }))).toEqual(state);
    expect(() => parseTacticJson("{}")).toThrow();
    expect(() =>
      parseTacticJson(JSON.stringify({ ...state, meta: { ...state.meta, sport: "curling" } })),
    ).toThrow(/sport/);
    expect(() => parseTacticJson(JSON.stringify({ ...state, tokens: { a: { id: "a", x: "1" } } }))).toThrow();
  });
});
