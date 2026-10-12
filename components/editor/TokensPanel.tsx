"use client";

import { Trash2, Users } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { deleteGroup, updateTokens } from "@/lib/collab/actions";
import type { TeamSide } from "@/lib/engine/types";
import { getSession } from "@/lib/editor/session";
import { selectTokens, useEditor } from "@/lib/editor/store";
import { cn } from "@/lib/utils";

const TEAM_LABELS: Record<TeamSide, string> = {
  home: "Players",
  away: "Opponents",
  neutral: "Neutral",
  ball: "Ball",
};

/** Accessible list view of every token; doubles as a quick roster editor. */
export function TokensPanel({ readOnly }: { readOnly: boolean }) {
  const { state, selected } = useEditor(useShallow((s) => ({ state: s.state, selected: s.selectedTokens })));
  const session = getSession()!;
  const groups = Object.values(state.groups);

  return (
    <div className="space-y-5 p-4">
      {groups.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Groups</h3>
          <ul className="space-y-1">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <button
                  className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink-800"
                  onClick={() => selectTokens(g.tokenIds.filter((id) => state.tokens[id]))}
                >
                  <Users size={14} className="text-slate-400" /> {g.name}
                  <span className="text-xs text-slate-500">({g.tokenIds.length})</span>
                </button>
                {!readOnly && (
                  <button
                    className="p-1 text-slate-500 hover:text-red-400"
                    aria-label={`Delete group ${g.name}`}
                    onClick={() => deleteGroup(session.doc, g.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(["home", "away", "neutral", "ball"] as TeamSide[]).map((team) => {
        const list = Object.values(state.tokens)
          .filter((t) => t.team === team)
          .sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0));
        if (!list.length) return null;
        return (
          <section key={team}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {TEAM_LABELS[team]} ({list.length})
              </h3>
              <button
                className="text-xs text-brand-400 hover:underline"
                onClick={() => selectTokens(list.map((t) => t.id))}
              >
                Select all
              </button>
            </div>
            <ul className="space-y-1">
              {list.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-1",
                    selected.includes(t.id) ? "bg-brand-500/15" : "hover:bg-ink-800",
                  )}
                >
                  <button
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ring-1 ring-black/30"
                    style={{ background: t.color, color: t.team === "ball" ? "#111" : undefined }}
                    onClick={(e) => selectTokens(e.shiftKey ? [...new Set([...selected, t.id])] : [t.id])}
                    aria-label={`Select ${t.label || `number ${t.number ?? ""}`}`}
                  >
                    {t.number ?? ""}
                  </button>
                  <input
                    className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 text-sm hover:border-ink-700 focus:border-brand-500 focus:outline-none"
                    value={t.label ?? ""}
                    placeholder={t.team === "ball" ? "Ball" : "Name"}
                    disabled={readOnly}
                    maxLength={24}
                    onChange={(e) => updateTokens(session.doc, [t.id], { label: e.target.value })}
                    aria-label={`Name for number ${t.number ?? ""}`}
                  />
                  {t.role && <span className="truncate text-[11px] text-slate-500">{t.role}</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
