import type { SportConfig } from "./types";

const W = 110;
const H = 110;
const homeX = 55;
const homeY = 96;
const base = 27.432 * Math.SQRT1_2;
const first: [number, number] = [homeX + base, homeY - base];
const third: [number, number] = [homeX - base, homeY - base];
const second: [number, number] = [homeX, homeY - 2 * base];

export const baseball: SportConfig = {
  id: "baseball",
  name: "Baseball",
  width: W,
  height: H,
  margin: 4,
  surfaceColor: "#3f8f45",
  surroundColor: "#2f6f38",
  lineColor: "rgba(255,255,255,0.92)",
  lineWidth: 0.15,
  maxPerSide: 9,
  defaultPerSide: 9,
  tokenRadius: 1.1,
  markings: [
    { type: "rect", x: 0, y: 0, w: W, h: H },
    { type: "arc", x: homeX, y: homeY, r: 72, start: -135, end: -45 },
    { type: "line", points: [homeX, homeY, homeX - 50, homeY - 50] },
    { type: "line", points: [homeX, homeY, homeX + 50, homeY - 50] },
    {
      type: "line",
      points: [homeX, homeY, first[0], first[1], second[0], second[1], third[0], third[1], homeX, homeY],
    },
    { type: "circle", x: homeX, y: homeY - 18.44, r: 2.7 },
    { type: "circle", x: homeX, y: homeY, r: 0.4, fill: true },
    { type: "circle", x: first[0], y: first[1], r: 0.45, fill: true },
    { type: "circle", x: second[0], y: second[1], r: 0.45, fill: true },
    { type: "circle", x: third[0], y: third[1], r: 0.45, fill: true },
    { type: "rect", x: 8, y: 78, w: 16, h: 22, fill: "rgba(180,140,90,0.35)", stroke: true },
  ],
  formations: [
    {
      id: "standard-defense",
      name: "Standard defense",
      playerCount: 9,
      positions: [
        [55, 93],
        [55, 77.6],
        [70, 74],
        [62, 62],
        [48, 62],
        [40, 74],
        [28, 40],
        [55, 30],
        [82, 40],
      ],
      awayPositions: [
        [57.5, 94],
        [18, 90],
        [18, 98],
        [12, 80],
        [12, 88],
        [22, 82],
        [22, 92],
        [28, 86],
        [28, 98],
      ],
    },
    {
      id: "runners-on",
      name: "Runners on",
      playerCount: 9,
      positions: [
        [55, 93],
        [55, 77.6],
        [72, 76],
        [64, 60],
        [46, 60],
        [38, 76],
        [26, 38],
        [55, 28],
        [84, 38],
      ],
      awayPositions: [
        [57.5, 94],
        [first[0] - 1.5, first[1] + 1.5],
        [second[0], second[1] + 2],
        [third[0] + 1.5, third[1] + 1.5],
        [16, 82],
        [16, 90],
        [16, 98],
        [24, 86],
        [24, 96],
      ],
    },
  ],
};
