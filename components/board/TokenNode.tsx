"use client";

import { memo } from "react";
import { Circle, Group, Rect, RegularPolygon, Text } from "react-konva";
import { contrastText } from "@/lib/color";
import type { Token } from "@/lib/engine/types";

interface Props {
  token: Token;
  x: number;
  y: number;
  baseRadius: number;
  selected: boolean;
  /** Colors of teammates who have this token selected or locked. */
  peerColors: string[];
  locked: boolean;
  /** Larger invisible hit area for touch input. */
  bigHit: boolean;
  label?: string;
}

export const TokenNode = memo(function TokenNode({
  token,
  x,
  y,
  baseRadius,
  selected,
  peerColors,
  locked,
  bigHit,
  label,
}: Props) {
  const r = baseRadius * token.size;
  const isBall = token.team === "ball";
  const fill = token.color;
  const stroke = isBall ? "#111827" : "rgba(0,0,0,0.55)";
  const sw = r * 0.12;
  const text = token.number ?? "";
  const fontSize = r * (text.length > 2 ? 0.75 : 1.05);
  const caption = label ?? token.label;

  return (
    <Group x={x} y={y} name="token" tokenId={token.id}>
      {bigHit && <Circle radius={r * 1.9} fill="rgba(0,0,0,0.001)" />}
      {peerColors.map((c, i) => (
        <Circle
          key={i}
          radius={r + sw * (2.5 + i * 2)}
          stroke={c}
          strokeWidth={sw * 1.4}
          dash={locked ? [r * 0.4, r * 0.25] : undefined}
        />
      ))}
      {selected && (
        <>
          <Circle
            radius={r + sw * 2.2}
            stroke="rgba(52,211,153,0.3)"
            strokeWidth={sw * 4.5}
            listening={false}
          />
          <Circle radius={r + sw * 2.2} stroke="#34d399" strokeWidth={sw * 1.6} />
        </>
      )}
      {/* A plain offset disc instead of shadowBlur: blurred shadows are re-rasterized every animation frame. */}
      {token.shape !== "triangle" && (
        <Circle y={r * 0.18} radius={r * 1.04} fill="rgba(0,0,0,0.28)" listening={false} />
      )}
      {token.shape === "square" ? (
        <Rect
          x={-r}
          y={-r}
          width={2 * r}
          height={2 * r}
          cornerRadius={r * 0.25}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      ) : token.shape === "triangle" ? (
        <RegularPolygon
          sides={3}
          radius={r * 1.2}
          y={r * 0.15}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      ) : (
        <Circle radius={r} fill={fill} stroke={stroke} strokeWidth={sw} />
      )}
      {isBall && <Circle radius={r * 0.45} fill="#111827" />}
      {text && (
        <Text
          text={text}
          fontSize={fontSize}
          fontStyle="bold"
          fill={contrastText(fill)}
          width={r * 4}
          height={r * 2}
          offsetX={r * 2}
          offsetY={r - (token.shape === "triangle" ? r * 0.2 : 0)}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
      {caption && (
        <Text
          text={caption}
          fontSize={r * 0.7}
          fill="#ffffff"
          stroke="rgba(0,0,0,0.7)"
          strokeWidth={r * 0.05}
          fillAfterStrokeEnabled
          width={r * 10}
          offsetX={r * 5}
          y={r * 1.25}
          align="center"
          listening={false}
        />
      )}
    </Group>
  );
});
