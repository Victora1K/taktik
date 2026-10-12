import { contrastText } from "@/lib/color";
import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  color,
  size = 28,
  className,
  ring,
}: {
  name: string;
  color: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        ring && "ring-2 ring-ink-950",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: color,
        color: contrastText(color),
        fontSize: size * 0.4,
      }}
    >
      {initials(name)}
    </span>
  );
}
