import type { Marking } from "./types";

/** Mirror markings across the vertical line x = width / 2. */
export function mirrorX(markings: Marking[], width: number): Marking[] {
  return markings.map((m) => {
    switch (m.type) {
      case "rect":
        return { ...m, x: width - m.x - m.w };
      case "line": {
        const points = m.points.map((v, i) => (i % 2 === 0 ? width - v : v));
        return { ...m, points };
      }
      case "circle":
        return { ...m, x: width - m.x };
      case "arc":
        return { ...m, x: width - m.x, start: 180 - m.end, end: 180 - m.start };
    }
  });
}

/** Sample an arc into a flat polyline point list. */
export function arcPoints(x: number, y: number, r: number, start: number, end: number, steps = 32): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((start + ((end - start) * i) / steps) * Math.PI) / 180;
    pts.push(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  return pts;
}
