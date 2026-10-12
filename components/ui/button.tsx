import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-ink-950 hover:bg-brand-400 font-semibold",
  secondary: "bg-ink-800 text-slate-100 hover:bg-ink-700",
  ghost: "text-slate-300 hover:bg-ink-800 hover:text-white",
  danger: "bg-red-600 text-white hover:bg-red-500",
  outline: "border border-ink-700 text-slate-200 hover:bg-ink-800",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-sm gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
  icon: "h-8 w-8 justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", active, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        active && "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/60",
        className,
      )}
      {...props}
    />
  );
});
