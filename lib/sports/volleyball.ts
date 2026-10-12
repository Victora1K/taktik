import type { SportConfig } from "./types";

const W = 18;
const H = 9;

export const volleyball: SportConfig = {
  id: "volleyball",
  name: "Volleyball",
  width: W,
  height: H,
  margin: 3,
  surfaceColor: "#e07b39",
  surroundColor: "#2b6cb0",
  lineColor: "rgba(255,255,255,0.95)",
  lineWidth: 0.05,
  maxPerSide: 6,
  defaultPerSide: 6,
  tokenRadius: 0.42,
  markings: [
    { type: "rect", x: 0, y: 0, w: W, h: H },
    // Net / center line
    { type: "line", points: [W / 2, -1, W / 2, H + 1], width: 0.12 },
    { type: "circle", x: W / 2, y: -1, r: 0.1, fill: true },
    { type: "circle", x: W / 2, y: H + 1, r: 0.1, fill: true },
    // Attack lines
    { type: "line", points: [6, 0, 6, H] },
    { type: "line", points: [12, 0, 12, H] },
  ],
  formations: [
    {
      id: "rotation-1",
      name: "Base rotation",
      // Court positions 1-6; the home side faces +x, so its right-hand side is +y.
      positions: [
        [2, 7.5],
        [7.2, 7.5],
        [7.2, 4.5],
        [7.2, 1.5],
        [2, 1.5],
        [2, 4.5],
      ],
    },
    {
      id: "serve-receive",
      name: "Serve receive (W)",
      positions: [
        [2.5, 7.2],
        [7.8, 6.0],
        [6.0, 4.5],
        [4.5, 1.5],
        [2.5, 1.8],
        [3.0, 4.5],
      ],
    },
  ],
};
