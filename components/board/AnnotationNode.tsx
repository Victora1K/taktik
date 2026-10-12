"use client";

import { memo } from "react";
import { Arrow, Group, Line, Rect, Text } from "react-konva";
import { withAlpha } from "@/lib/color";
import type { Annotation } from "@/lib/engine/types";

export const AnnotationNode = memo(function AnnotationNode({
  a,
  selected,
  draft,
}: {
  a: Annotation;
  selected?: boolean;
  draft?: boolean;
}) {
  const { color, width, dashed } = a.style;
  const dash = dashed ? [width * 3, width * 2] : undefined;
  const common = {
    stroke: color,
    strokeWidth: width,
    dash,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    hitStrokeWidth: Math.max(width * 4, 1),
    shadowColor: selected ? "#34d399" : undefined,
    shadowBlur: selected ? 8 : 0,
    shadowOpacity: selected ? 1 : 0,
    opacity: draft ? 0.7 : 1,
  };
  const p = a.points;
  let node: React.ReactNode = null;
  switch (a.kind) {
    case "arrow":
      node = <Arrow points={p} fill={color} pointerLength={width * 4} pointerWidth={width * 4} {...common} />;
      break;
    case "line":
      node = <Line points={p} {...common} />;
      break;
    case "freehand":
      node = <Line points={p} tension={0.4} {...common} />;
      break;
    case "zone": {
      const [x1, y1, x2, y2] = p;
      node = (
        <Rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          fill={withAlpha(color, 0.22)}
          cornerRadius={width}
          {...common}
        />
      );
      break;
    }
    case "text":
      node = (
        <Text
          x={p[0]}
          y={p[1]}
          text={a.text || "Text"}
          fontSize={width * 8}
          fontStyle="bold"
          fill={color}
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={width * 0.4}
          fillAfterStrokeEnabled
          shadowColor={common.shadowColor}
          shadowBlur={common.shadowBlur}
        />
      );
      break;
  }
  return (
    <Group name="annotation" annId={a.id} listening={!draft}>
      {node}
    </Group>
  );
});
