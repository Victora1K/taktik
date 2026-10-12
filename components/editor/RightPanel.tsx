"use client";

import { X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Member, Profile } from "@/lib/data";
import { useComments } from "@/lib/editor/comments";
import { useEditor, type RightTab } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { CommentsPanel } from "./CommentsPanel";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TokensPanel } from "./TokensPanel";

const TABS: { id: RightTab; label: string }[] = [
  { id: "props", label: "Properties" },
  { id: "tokens", label: "Players" },
  { id: "layers", label: "Layers" },
  { id: "comments", label: "Comments" },
];

export function RightPanel({
  readOnly,
  me,
  members,
  tacticId,
  open,
  onClose,
}: {
  readOnly: boolean;
  me: Profile;
  members: Member[];
  tacticId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { tab } = useEditor(useShallow((s) => ({ tab: s.rightTab })));
  const openComments = useComments((s) => s.comments.filter((c) => !c.parentId && !c.resolved).length);

  return (
    <aside
      className={cn(
        "flex w-80 shrink-0 flex-col border-l border-ink-800 bg-ink-900",
        "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(22rem,92vw)] max-lg:shadow-2xl max-lg:transition-transform",
        !open && "max-lg:translate-x-full",
      )}
      aria-label="Side panel"
    >
      <div className="flex items-center border-b border-ink-800" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => useEditor.setState({ rightTab: t.id })}
            className={cn(
              "flex-1 border-b-2 px-1 py-2.5 text-xs font-medium",
              tab === t.id
                ? "border-brand-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200",
            )}
          >
            {t.label}
            {t.id === "comments" && openComments > 0 && (
              <span className="ml-1 rounded-full bg-brand-500/25 px-1.5 text-[10px] text-brand-400">
                {openComments}
              </span>
            )}
          </button>
        ))}
        <button className="px-2 text-slate-400 lg:hidden" onClick={onClose} aria-label="Close panel">
          <X size={16} />
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === "props" && <PropertiesPanel readOnly={readOnly} members={members} />}
        {tab === "tokens" && <TokensPanel readOnly={readOnly} />}
        {tab === "layers" && <LayersPanel readOnly={readOnly} />}
        {tab === "comments" && <CommentsPanel me={me} members={members} tacticId={tacticId} />}
      </div>
    </aside>
  );
}
