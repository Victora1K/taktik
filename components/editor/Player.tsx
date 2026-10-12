"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as Y from "yjs";
import { Logo } from "@/components/app/Logo";
import { docToState } from "@/lib/collab/doc";
import type { PublicTactic } from "@/lib/data";
import { play, stopClock } from "@/lib/editor/clock";
import { setSession } from "@/lib/editor/session";
import { resetEditorStores, useEditor, usePlayback } from "@/lib/editor/store";
import { getSport } from "@/lib/sports";
import { Timeline } from "./Timeline";

const Board = dynamic(() => import("@/components/board/Board"), { ssr: false });

/** Read-only animation player for public links and embeds. */
export function Player({ tactic, embed }: { tactic: PublicTactic; embed: boolean }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    resetEditorStores();
    const doc = new Y.Doc();
    if (tactic.docState) Y.applyUpdate(doc, tactic.docState);
    const state = docToState(doc);
    setSession({
      doc,
      awareness: null,
      undo: null,
      readOnly: true,
      sport: getSport(state.meta.sport ?? tactic.sport),
      tacticId: tactic.id,
      userId: "public",
      members: [],
      stage: null,
    });
    useEditor.setState({ state, showTrails: true });
    usePlayback.setState({ loop: true });
    setReady(true);
    const t = setTimeout(play, 600);
    return () => {
      clearTimeout(t);
      stopClock();
      setSession(null);
      doc.destroy();
    };
  }, [tactic]);

  if (!ready) return null;

  return (
    <div className="flex h-dvh flex-col">
      {!embed && (
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3">
          <Logo />
          <span className="truncate font-semibold">{tactic.title}</span>
          <span className="rounded bg-ink-800 px-2 py-0.5 text-xs capitalize text-slate-300">
            {tactic.sport}
          </span>
          <Link
            href="/teams"
            className="ml-auto rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-ink-950"
          >
            Make your own
          </Link>
        </header>
      )}
      <main className="relative min-h-0 flex-1">
        <Board readOnly />
        {embed && (
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-[11px] text-white/80"
          >
            Made with Taktik
          </a>
        )}
      </main>
      <Timeline readOnly />
    </div>
  );
}
