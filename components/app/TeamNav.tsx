"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Team } from "@/lib/data";
import { ROLE_LABELS } from "@/lib/data";
import { cn } from "@/lib/utils";

export function TeamNav({ team }: { team: Team }) {
  const path = usePathname();
  const base = `/teams/${team.id}`;
  const tabs = [
    { href: base, label: "Tactics" },
    { href: `${base}/chat`, label: "Chat" },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">{team.name}</h1>
        <span className="text-xs text-slate-500">{ROLE_LABELS[team.role]}</span>
        <Link href="/teams" className="ml-auto text-xs text-slate-400 hover:text-white">
          All teams
        </Link>
      </div>
      <nav className="mt-3 flex gap-1 border-b border-ink-800">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              path === t.href
                ? "border-brand-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
