"use client";

import { Eye, EyeOff, Headphones, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { addLayer, deleteLayer, updateLayer } from "@/lib/collab/actions";
import { getSession } from "@/lib/editor/session";
import { useEditor } from "@/lib/editor/store";
import { cn } from "@/lib/utils";

export function LayersPanel({ readOnly }: { readOnly: boolean }) {
  const { state, activeLayerId, overdub } = useEditor(
    useShallow((s) => ({ state: s.state, activeLayerId: s.activeLayerId, overdub: s.overdub })),
  );
  const session = getSession()!;
  const layers = Object.values(state.layers).sort((a, b) => a.order - b.order);
  const counts = new Map<string, number>();
  for (const t of Object.values(state.tracks)) counts.set(t.layerId, (counts.get(t.layerId) ?? 0) + 1);

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs text-slate-400">
        Each recording lands on the active layer. Use layers to keep alternatives (e.g. two different runs)
        and mute or solo them during playback. Overdub mode is currently{" "}
        <b className="text-slate-200">{overdub === "replace" ? "replace motion" : "new layer"}</b>.
      </p>
      <ul className="space-y-1.5">
        {layers.map((l) => (
          <li
            key={l.id}
            className={cn(
              "rounded-lg border p-2",
              l.id === activeLayerId ? "border-brand-500/60 bg-brand-500/10" : "border-ink-800",
            )}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="active-layer"
                checked={l.id === activeLayerId}
                onChange={() => useEditor.setState({ activeLayerId: l.id })}
                aria-label={`Record into ${l.name}`}
                disabled={readOnly}
              />
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: l.color }} />
              <input
                className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm hover:border-ink-700 focus:border-brand-500 focus:outline-none"
                value={l.name}
                disabled={readOnly}
                maxLength={40}
                onChange={(e) => updateLayer(session.doc, l.id, { name: e.target.value })}
                aria-label="Layer name"
              />
              <span className="text-[11px] text-slate-500">{counts.get(l.id) ?? 0}</span>
            </div>
            <div className="mt-1 flex items-center gap-0.5 pl-6">
              <Button
                size="icon"
                variant="ghost"
                title={l.visible ? "Hide paths" : "Show paths"}
                aria-label={l.visible ? "Hide layer" : "Show layer"}
                onClick={() => updateLayer(session.doc, l.id, { visible: !l.visible })}
              >
                {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                active={l.muted}
                title={l.muted ? "Unmute (include in playback)" : "Mute (skip in playback)"}
                aria-label={l.muted ? "Unmute layer" : "Mute layer"}
                onClick={() => updateLayer(session.doc, l.id, { muted: !l.muted })}
              >
                {l.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                active={l.solo}
                title="Solo (play only soloed layers)"
                aria-label={l.solo ? "Unsolo layer" : "Solo layer"}
                onClick={() => updateLayer(session.doc, l.id, { solo: !l.solo })}
              >
                <Headphones size={14} />
              </Button>
              {!readOnly && layers.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  title="Delete layer and its motion"
                  aria-label="Delete layer"
                  onClick={() => {
                    if (
                      (counts.get(l.id) ?? 0) === 0 ||
                      window.confirm(`Delete "${l.name}" and its recorded motion?`)
                    )
                      deleteLayer(session.doc, l.id);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center"
          onClick={() => {
            const layer = addLayer(session.doc, session.userId);
            useEditor.setState({ activeLayerId: layer.id });
          }}
        >
          <Plus size={14} /> New layer
        </Button>
      )}
    </div>
  );
}
