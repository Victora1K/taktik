"use client";

import { memo } from "react";
import { Circle, Group, Line, Rect } from "react-konva";
import { arcPoints } from "@/lib/sports/geometry";
import type { SportConfig } from "@/lib/sports";

/** Static field drawing in meters. Not interactive, so clicks fall through to the stage. */
export const Field = memo(function Field({ sport }: { sport: SportConfig }) {
  const { width: W, height: H, margin: M, lineColor, lineWidth } = sport;
  const stripes = sport.id === "soccer" ? 12 : 0;
  return (
    <Group listening={false}>
      <Rect x={-M} y={-M} width={W + 2 * M} height={H + 2 * M} fill={sport.surroundColor} />
      <Rect x={0} y={0} width={W} height={H} fill={sport.surfaceColor} />
      {Array.from({ length: stripes }, (_, i) =>
        i % 2 ? (
          <Rect
            key={i}
            x={(i * W) / stripes}
            y={0}
            width={W / stripes}
            height={H}
            fill="rgba(255,255,255,0.04)"
          />
        ) : null,
      )}
      {sport.markings.map((m, i) => {
        switch (m.type) {
          case "rect":
            return (
              <Rect
                key={i}
                x={m.x}
                y={m.y}
                width={m.w}
                height={m.h}
                fill={m.fill}
                stroke={m.stroke === false ? undefined : lineColor}
                strokeWidth={lineWidth}
              />
            );
          case "line":
            return (
              <Line
                key={i}
                points={m.points}
                stroke={lineColor}
                strokeWidth={m.width ?? lineWidth}
                lineCap="square"
              />
            );
          case "circle":
            return m.fill ? (
              <Circle key={i} x={m.x} y={m.y} radius={m.r} fill={lineColor} />
            ) : (
              <Circle key={i} x={m.x} y={m.y} radius={m.r} stroke={lineColor} strokeWidth={lineWidth} />
            );
          case "arc":
            return (
              <Line
                key={i}
                points={arcPoints(m.x, m.y, m.r, m.start, m.end)}
                stroke={lineColor}
                strokeWidth={lineWidth}
              />
            );
        }
      })}
    </Group>
  );
});
