"use client";

import { create } from "zustand";
import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  message: string;
  kind: "info" | "error" | "success";
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

let seq = 0;
export function toast(message: string, kind: Toast["kind"] = "info") {
  const id = ++seq;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
}

export function toastError(err: unknown) {
  toast(err instanceof Error ? err.message : String(err), "error");
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-lg px-4 py-2 text-sm shadow-lg",
            t.kind === "error"
              ? "bg-red-600 text-white"
              : t.kind === "success"
                ? "bg-brand-500 text-ink-950"
                : "bg-ink-800 text-slate-100",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
