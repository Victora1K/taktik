import { mirrorX } from "./geometry";
import type { Marking, SportConfig } from "./types";

// FIBA court
const W = 28;
const H = 15;
const CY = H / 2;
const HOOP_X = 1.575;

const leftHalf: Marking[] = [
  { type: "rect", x: 0, y: CY - 2.45, w: 5.8, h: 4.9, fill: "rgba(150,70,20,0.35)" },
  { type: "circle", x: 5.8, y: CY, r: 1.8 },
  { type: "line", points: [0, 0.9, 2.99, 0.9] },
  { type: "line", points: [0, H - 0.9, 2.99, H - 0.9] },
  { type: "arc", x: HOOP_X, y: CY, r: 6.75, start: -77.9, end: 77.9 },
  { type: "arc", x: HOOP_X, y: CY, r: 1.25, start: -90, end: 90 },
  { type: "line", points: [1.2, CY - 0.9, 1.2, CY + 0.9], width: 0.08 },
  { type: "circle", x: HOOP_X, y: CY, r: 0.225 },
];

export const basketball: SportConfig = {
  id: "basketball",
  name: "Basketball",
  width: W,
  height: H,
  margin: 2,
  surfaceColor: "#d9a066",
  surroundColor: "#a8733f",
  lineColor: "rgba(255,255,255,0.95)",
  lineWidth: 0.05,
  maxPerSide: 5,
  defaultPerSide: 5,
  tokenRadius: 0.45,
  markings: [
    { type: "rect", x: 0, y: 0, w: W, h: H },
    { type: "line", points: [W / 2, 0, W / 2, H] },
    { type: "circle", x: W / 2, y: CY, r: 1.8 },
    ...leftHalf,
    ...mirrorX(leftHalf, W),
  ],
  formations: [
    {
      id: "5-out",
      name: "5-out vs man",
      positions: [
        [16.5, 7.5],
        [19, 2.5],
        [19, 12.5],
        [27, 1.2],
        [27, 13.8],
      ],
      awayPositions: [
        [18.3, 7.5],
        [21, 3.5],
        [21, 11.5],
        [25.5, 2.8],
        [25.5, 12.2],
      ],
    },
    {
      id: "horns",
      name: "Horns vs man",
      positions: [
        [17, 7.5],
        [21.2, 5.0],
        [21.2, 10.0],
        [27, 1.2],
        [27, 13.8],
      ],
      awayPositions: [
        [18.8, 7.5],
        [22.3, 5.6],
        [22.3, 9.4],
        [25.6, 2.6],
        [25.6, 12.4],
      ],
    },
    {
      id: "full-court",
      name: "Full court (jump ball)",
      positions: [
        [13.2, 7.5],
        [11, 4],
        [11, 11],
        [8, 5.5],
        [8, 9.5],
      ],
    },
  ],
};
