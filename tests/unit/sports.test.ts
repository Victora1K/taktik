import { describe, expect, it } from "vitest";
import { encodeState } from "@/lib/collab/doc";
import { fromBase64, fromByteaHex, toBase64, toByteaHex } from "@/lib/collab/encoding";
import { createInitialState, nextNumber } from "@/lib/engine/factory";
import { parseTacticJson } from "@/lib/editor/export";
import { formationsFor, getSport, SPORT_LIST, sidePositions } from "@/lib/sports";
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

  it("creates football, baseball, and tennis at their standard sizes", () => {
    const expected = [
      ["football", 11],
      ["baseball", 9],
      ["tennis", 1],
    ] as const;
    for (const [sport, count] of expected) {
      const state = createInitialState({ sport, homeCount: count, awayCount: count, includeBall: false });
      expect(state.meta.sport).toBe(sport);
      expect(Object.values(state.tokens).filter((token) => token.team === "home")).toHaveLength(count);
      expect(Object.values(state.tokens).filter((token) => token.team === "away")).toHaveLength(count);
    }
    const doubles = createInitialState({
      sport: "tennis",
      homeCount: 2,
      awayCount: 2,
      formationId: "doubles",
      awayFormationId: "doubles",
      includeBall: false,
    });
    expect(Object.values(doubles.tokens)).toHaveLength(4);
  });

  it("gives each soccer side the formation that matches its own count", () => {
    const state = createInitialState({
      sport: "soccer",
      homeCount: 7,
      awayCount: 5,
      formationId: "7-2-3-1",
      awayFormationId: "5-1-2-1",
      includeBall: false,
    });
    expect(formationsFor(getSport("soccer"), 7).map((item) => item.id)).toContain("7-2-3-1");
    expect(formationsFor(getSport("soccer"), 5).map((item) => item.id)).toContain("5-1-2-1");
    expect(state.meta.homeFormationId).toBe("7-2-3-1");
    expect(state.meta.awayFormationId).toBe("5-1-2-1");
    const home = Object.values(state.tokens).filter((token) => token.team === "home");
    const away = Object.values(state.tokens).filter((token) => token.team === "away");
    expect(home).toHaveLength(7);
    expect(away).toHaveLength(5);
    expect(new Set(home.map((token) => token.x)).size).toBeGreaterThan(1);
    expect(away.every((token) => token.x > 50)).toBe(true);
  });

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
