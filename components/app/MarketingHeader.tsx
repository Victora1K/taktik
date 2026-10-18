"use client";

import Link from "next/link";
import { useSession } from "@/components/providers";
import { NotificationsBell } from "./AppHeader";
import { Logo } from "./Logo";

export function MarketingHeader() {
  const { me, loading } = useSession();

  return (
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
      <Logo />
      <nav className="flex items-center gap-4 text-sm">
        {!loading && !me && (
          <Link href="/login" className="text-slate-300 hover:text-white">
            Sign in
          </Link>
        )}
        {!loading && me && <NotificationsBell />}
        <Link
          href="/teams"
          className="rounded-md bg-brand-500 px-3.5 py-2 font-semibold text-ink-950 hover:bg-brand-400"
        >
          Open the board
        </Link>
      </nav>
    </header>
  );
}
