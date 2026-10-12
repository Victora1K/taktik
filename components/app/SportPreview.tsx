import { arcPoints } from "@/lib/sports/geometry";
import type { SportConfig } from "@/lib/sports";

/** Lightweight SVG rendering of a field, used for cards and pickers. */
export function SportPreview({ sport, className }: { sport: SportConfig; className?: string }) {
  const { width: W, height: H, margin: M } = sport;
  const sw = Math.max(sport.lineWidth, W / 250);
  return (
    <svg
      viewBox={`${-M} ${-M} ${W + 2 * M} ${H + 2 * M}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect x={-M} y={-M} width={W + 2 * M} height={H + 2 * M} fill={sport.surroundColor} />
      <rect x={0} y={0} width={W} height={H} fill={sport.surfaceColor} />
      <g stroke={sport.lineColor} strokeWidth={sw} fill="none">
        {sport.markings.map((m, i) => {
          switch (m.type) {
            case "rect":
              return <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} fill={m.fill ?? "none"} />;
            case "line":
              return <polyline key={i} points={m.points.join(" ")} strokeWidth={m.width ?? sw} />;
            case "circle":
              return <circle key={i} cx={m.x} cy={m.y} r={m.r} fill={m.fill ? sport.lineColor : "none"} />;
            case "arc":
              return <polyline key={i} points={arcPoints(m.x, m.y, m.r, m.start, m.end, 16).join(" ")} />;
          }
        })}
      </g>
    </svg>
  );
}
