import type { SportConfig } from "./types";

const W = 23.77;
const H = 10.97;
const alley = (H - 8.23) / 2;
const net = W / 2;
const service = 6.4;

export const tennis: SportConfig = {
  id: "tennis",
  name: "Tennis",
  width: W,
  height: H,
  margin: 3,
  surfaceColor: "#3b7fc4",
  surroundColor: "#245887",
  lineColor: "rgba(255,255,255,0.95)",
  lineWidth: 0.05,
  maxPerSide: 2,
  defaultPerSide: 1,
  tokenRadius: 0.38,
  markings: [
    { type: "rect", x: 0, y: 0, w: W, h: H },
    { type: "line", points: [0, alley, W, alley] },
    { type: "line", points: [0, H - alley, W, H - alley] },
    { type: "line", points: [net, 0, net, H], width: 0.08 },
    { type: "line", points: [net - service, alley, net - service, H - alley] },
    { type: "line", points: [net + service, alley, net + service, H - alley] },
    { type: "line", points: [net - service, H / 2, net + service, H / 2] },
    { type: "line", points: [0, H / 2, 0.4, H / 2] },
    { type: "line", points: [W - 0.4, H / 2, W, H / 2] },
  ],
  formations: [
    {
      id: "singles",
      name: "Singles",
      playerCount: 1,
      positions: [[2.2, H / 2]],
      awayPositions: [[W - 2.2, H / 2]],
    },
    {
      id: "doubles",
      name: "Doubles",
      playerCount: 2,
      positions: [
        [2.4, H / 2 + 1.4],
        [8.2, H / 2 - 1.6],
      ],
      awayPositions: [
        [W - 2.4, H / 2 - 1.4],
        [W - 8.2, H / 2 + 1.6],
      ],
    },
  ],
};
