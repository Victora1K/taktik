import { mirrorX } from "./geometry";
import type { Marking, SportConfig } from "./types";

const W = 105;
const H = 68;
const CY = H / 2;

const leftHalf: Marking[] = [
  // Penalty area, goal area, penalty spot and arc
  { type: "rect", x: 0, y: CY - 20.16, w: 16.5, h: 40.32 },
  { type: "rect", x: 0, y: CY - 9.16, w: 5.5, h: 18.32 },
  { type: "circle", x: 11, y: CY, r: 0.25, fill: true },
  { type: "arc", x: 11, y: CY, r: 9.15, start: -53.13, end: 53.13 },
  // Goal
  { type: "rect", x: -2, y: CY - 3.66, w: 2, h: 7.32 },
  // Corner arcs
  { type: "arc", x: 0, y: 0, r: 1, start: 0, end: 90 },
  { type: "arc", x: 0, y: H, r: 1, start: 270, end: 360 },
];

export const soccer: SportConfig = {
  id: "soccer",
  name: "Soccer",
  width: W,
  height: H,
  margin: 4,
  surfaceColor: "#2f7d32",
  surroundColor: "#276b2a",
  lineColor: "rgba(255,255,255,0.9)",
  lineWidth: 0.15,
  maxPerSide: 11,
  defaultPerSide: 11,
  tokenRadius: 1.4,
  markings: [
    { type: "rect", x: 0, y: 0, w: W, h: H },
    { type: "line", points: [W / 2, 0, W / 2, H] },
    { type: "circle", x: W / 2, y: CY, r: 9.15 },
    { type: "circle", x: W / 2, y: CY, r: 0.25, fill: true },
    ...leftHalf,
    ...mirrorX(leftHalf, W),
  ],
  formations: [
    {
      id: "4-4-2",
      name: "4-4-2",
      positions: [
        [4, 34],
        [18, 10],
        [18, 25],
        [18, 43],
        [18, 58],
        [32, 10],
        [32, 25],
        [32, 43],
        [32, 58],
        [46, 26],
        [46, 42],
      ],
    },
    {
      id: "4-3-3",
      name: "4-3-3",
      positions: [
        [4, 34],
        [18, 10],
        [18, 25],
        [18, 43],
        [18, 58],
        [31, 18],
        [29, 34],
        [31, 50],
        [45, 12],
        [47, 34],
        [45, 56],
      ],
    },
    {
      id: "3-5-2",
      name: "3-5-2",
      positions: [
        [4, 34],
        [17, 18],
        [16, 34],
        [17, 50],
        [30, 8],
        [28, 22],
        [26, 34],
        [28, 46],
        [30, 60],
        [45, 26],
        [45, 42],
      ],
    },
  ],
};
