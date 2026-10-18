import type { Marking, SportConfig } from "./types";

const YD = 0.9144;
const W = 120 * YD;
const H = (160 / 3) * YD;
const EZ = 10 * YD;

function yardLines(): Marking[] {
  const lines: Marking[] = [
    { type: "line", points: [EZ, 0, EZ, H], width: 0.2 },
    { type: "line", points: [W - EZ, 0, W - EZ, H], width: 0.2 },
  ];
  for (let yards = 5; yards < 100; yards += 5) {
    const x = EZ + yards * YD;
    lines.push({ type: "line", points: [x, 0, x, H] });
    const tick = YD;
    for (const y of [H * 0.33, H * 0.67]) {
      lines.push({ type: "line", points: [x, y - tick, x, y + tick], width: 0.18 });
    }
  }
  return lines;
}

export const football: SportConfig = {
  id: "football",
  name: "Football",
  width: W,
  height: H,
  margin: 3,
  surfaceColor: "#2f7d32",
  surroundColor: "#276b2a",
  lineColor: "rgba(255,255,255,0.92)",
  lineWidth: 0.1,
  maxPerSide: 11,
  defaultPerSide: 11,
  tokenRadius: 0.85,
  markings: [{ type: "rect", x: 0, y: 0, w: W, h: H }, ...yardLines()],
  formations: [
    {
      id: "shotgun-spread",
      name: "Shotgun spread vs 4-3",
      playerCount: 11,
      positions: [
        [26.5, 24.4],
        [21, 24.4],
        [32, 16.4],
        [32, 20.4],
        [32, 24.4],
        [32, 28.4],
        [32, 32.4],
        [32, 36.4],
        [40, 3],
        [40, 45.8],
        [36, 10],
      ],
      awayPositions: [
        [39.5, 15.5],
        [39.5, 21.5],
        [39.5, 27.5],
        [39.5, 33.5],
        [46, 12],
        [46, 24.4],
        [46, 36.8],
        [44, 3.5],
        [44, 45.3],
        [56, 18],
        [56, 30.8],
      ],
    },
    {
      id: "goal-line",
      name: "Goal line",
      playerCount: 11,
      positions: [
        [90, 24.4],
        [86, 24.4],
        [94, 16.4],
        [94, 20.4],
        [94, 24.4],
        [94, 28.4],
        [94, 32.4],
        [94, 36.4],
        [96, 6],
        [96, 42.8],
        [88, 18],
      ],
      awayPositions: [
        [98.2, 16.4],
        [98.2, 20.4],
        [98.2, 24.4],
        [98.2, 28.4],
        [98.2, 32.4],
        [102, 14],
        [102, 20],
        [102, 24.4],
        [102, 29],
        [102, 34.8],
        [104.5, 24.4],
      ],
    },
  ],
};
