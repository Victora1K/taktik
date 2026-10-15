"use client";

import {
  ArrowUpRight,
  Circle,
  Eye,
  EyeOff,
  Hand,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  PenLine,
  Pencil,
  Redo2,
  Route,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { addToken } from "@/lib/collab/actions";
import { PALETTE } from "@/lib/engine/factory";
import type { TeamSide } from "@/lib/engine/types";
import { getSession } from "@/lib/editor/session";
import { cancelRoute } from "@/lib/editor/phase-routing";
import { selectTokens, useEditor, type Tool } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { redo, undo } from "./useShortcuts";

const TOOLS: { id: Tool; label: string; key: string; icon: React.ElementType; edit?: boolean }[] = [
  { id: "select", label: "Select and move", key: "V", icon: MousePointer2 },
  { id: "pan", label: "Pan", key: "H", icon: Hand },
  { id: "route", label: "Draw timed route", key: "G", icon: Route, edit: true },
  { id: "arrow", label: "Arrow", key: "A", icon: ArrowUpRight, edit: true },
  { id: "line", label: "Line", key: "L", icon: Minus, edit: true },
  { id: "zone", label: "Zone", key: "Z", icon: Square, edit: true },
  { id: "freehand", label: "Freehand", key: "F", icon: PenLine, edit: true },
  { id: "text", label: "Text", key: "T", icon: Type, edit: true },
  { id: "pin", label: "Pin a comment", key: "C", icon: MessageSquarePlus },
];

const ADD: { team: TeamSide; label: string; color: string }[] = [
  { team: "home", label: "Add player", color: "#2563eb" },
  { team: "away", label: "Add opponent", color: "#dc2626" },
  { team: "neutral", label: "Add neutral", color: "#eab308" },
  { team: "ball", label: "Add ball", color: "#ffffff" },
];

export function Toolbar({ readOnly }: { readOnly: boolean }) {
  const ui = useEditor(
    useShallow((s) => ({
      tool: s.tool,
      drawColor: s.drawColor,
      drawDashed: s.drawDashed,
      showTrails: s.showTrails,
      editPaths: s.editPaths,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      zoom: s.view.zoom,
    })),
  );
  const drawing = ["arrow", "line", "zone", "freehand", "text"].includes(ui.tool);

  function add(team: TeamSide) {
    const s = getSession();
    if (!s) return;
    const { sport } = s;
    const count = Object.values(useEditor.getState().state.tokens).filter((t) => t.team === team).length;
    const baseX = team === "home" ? sport.width * 0.3 : team === "away" ? sport.width * 0.7 : sport.width / 2;
    const jitter = ((count % 5) - 2) * sport.tokenRadius * 2.5;
    const t = addToken(s.doc, team, baseX, sport.height / 2 + jitter);
    selectTokens([t.id]);
  }

  const zoomBy = (f: number) =>
    useEditor.setState((s) => ({ view: { ...s.view, zoom: Math.max(0.5, Math.min(6, s.view.zoom * f)) } }));

  return (
    <aside
      className="scrollbar-thin flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-ink-800 bg-ink-900 py-2"
      aria-label="Tools"
    >
      {TOOLS.filter((t) => !readOnly || !t.edit).map((t) => (
        <Button
          key={t.id}
          size="icon"
          variant="ghost"
          active={ui.tool === t.id}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={ui.tool === t.id}
          onClick={() => {
            if (ui.tool === "route" && t.id !== "route") cancelRoute();
            useEditor.setState({ tool: t.id });
          }}
        >
          <t.icon size={17} />
        </Button>
      ))}

      {drawing && !readOnly && (
        <div className="mt-1 flex flex-col items-center gap-1 rounded-md bg-ink-800 p-1">
          {PALETTE.slice(0, 6)
            .concat("#facc15", "#ffffff")
            .map((c) => (
              <button
                key={c}
                aria-label={`Drawing color ${c}`}
                onClick={() => useEditor.setState({ drawColor: c })}
                className={cn(
                  "h-5 w-5 rounded-full border border-black/40",
                  ui.drawColor === c && "ring-2 ring-brand-400",
                )}
                style={{ background: c }}
              />
            ))}
          <button
            onClick={() => useEditor.setState({ drawDashed: !ui.drawDashed })}
            className={cn(
              "mt-1 rounded px-1 text-[10px] text-slate-300",
              ui.drawDashed && "bg-brand-500/30 text-brand-400",
            )}
            aria-pressed={ui.drawDashed}
          >
            dash
          </button>
        </div>
      )}

      <div className="my-1 h-px w-8 bg-ink-700" />

      {!readOnly &&
        ADD.map((a) => (
          <Button
            key={a.team}
            size="icon"
            variant="ghost"
            title={a.label}
            aria-label={a.label}
            onClick={() => add(a.team)}
          >
            <span className="relative">
              <Circle size={18} fill={a.color} color={a.team === "ball" ? "#111" : a.color} />
              <span className="absolute -right-1.5 -top-1.5 text-[11px] font-bold text-white">+</span>
            </span>
          </Button>
        ))}

      <div className="my-1 h-px w-8 bg-ink-700" />

      <Button
        size="icon"
        variant="ghost"
        active={ui.showTrails}
        title="Show movement trails"
        aria-label="Show movement trails"
        aria-pressed={ui.showTrails}
        onClick={() => useEditor.setState({ showTrails: !ui.showTrails })}
      >
        {ui.showTrails ? <Eye size={17} /> : <EyeOff size={17} />}
      </Button>
      {!readOnly && (
        <Button
          size="icon"
          variant="ghost"
          active={ui.editPaths}
          title="Edit path keyframes (select one player; double-click a point to delete it)"
          aria-label="Edit path keyframes"
          aria-pressed={ui.editPaths}
          onClick={() => useEditor.setState({ editPaths: !ui.editPaths })}
        >
          <Pencil size={17} />
        </Button>
      )}
      {!readOnly && (
        <>
          <Button
            size="icon"
            variant="ghost"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!ui.canUndo}
            onClick={undo}
          >
            <Undo2 size={17} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            disabled={!ui.canRedo}
            onClick={redo}
          >
            <Redo2 size={17} />
          </Button>
        </>
      )}

      <div className="mt-auto flex flex-col items-center gap-1">
        <Button size="icon" variant="ghost" title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          <ZoomIn size={17} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoomBy(0.8)}
        >
          <ZoomOut size={17} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Fit field"
          aria-label="Fit field"
          onClick={() => useEditor.setState({ view: { zoom: 1, x: 0, y: 0 } })}
        >
          <Maximize size={16} />
        </Button>
        <span className="text-[10px] text-slate-500">{Math.round(ui.zoom * 100)}%</span>
      </div>
    </aside>
  );
}
