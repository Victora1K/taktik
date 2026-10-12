"use client";

import { Copy, Eraser, Trash2, Users } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  clearMotion,
  deleteAnnotations,
  deleteTokens,
  duplicateTokens,
  saveGroup,
  setEasingForTokens,
  updateAnnotation,
  updateTokens,
} from "@/lib/collab/actions";
import type { Member } from "@/lib/data";
import { PALETTE, TEAM_COLORS } from "@/lib/engine/factory";
import type { Annotation, Easing, TeamSide, Token, TokenShape } from "@/lib/engine/types";
import { getSession } from "@/lib/editor/session";
import { clearSelection, selectTokens, useEditor, usePlayback } from "@/lib/editor/store";
import { cn, formatTime } from "@/lib/utils";

function common<T>(values: T[]): T | undefined {
  return values.length && values.every((v) => v === values[0]) ? values[0] : undefined;
}

export function PropertiesPanel({ readOnly, members }: { readOnly: boolean; members: Member[] }) {
  const { state, selectedTokens, selectedAnnotations } = useEditor(
    useShallow((s) => ({
      state: s.state,
      selectedTokens: s.selectedTokens,
      selectedAnnotations: s.selectedAnnotations,
    })),
  );
  const tokens = selectedTokens.map((id) => state.tokens[id]).filter(Boolean);
  const anns = selectedAnnotations.map((id) => state.annotations[id]).filter(Boolean);

  if (tokens.length) return <TokenProps tokens={tokens} readOnly={readOnly} members={members} />;
  if (anns.length) return <AnnotationProps anns={anns} readOnly={readOnly} />;

  return (
    <div className="space-y-3 p-4 text-sm text-slate-400">
      <p className="font-medium text-slate-200">Nothing selected</p>
      <ul className="list-disc space-y-1.5 pl-4 text-xs">
        <li>Click a player to select it; shift-click or drag a box to select several.</li>
        <li>Drag selected players to move them (and their whole run).</li>
        <li>
          Press <kbd className="rounded bg-ink-800 px-1">R</kbd> or Record, then drag players while the clip
          plays to record their movement.
        </li>
        <li>Record again with other players to layer movements on top of the replay.</li>
        <li>Use the arrow, zone and text tools to annotate, and C to pin a comment on the field.</li>
      </ul>
    </div>
  );
}

function TokenProps({
  tokens,
  readOnly,
  members,
}: {
  tokens: Token[];
  readOnly: boolean;
  members: Member[];
}) {
  const session = getSession()!;
  const ids = tokens.map((t) => t.id);
  const single = tokens.length === 1 ? tokens[0] : null;
  const allTracks = useEditor((s) => s.state.tracks);
  const tracks = Object.values(allTracks).filter((t) => ids.includes(t.tokenId));
  const easing = common(tracks.map((t) => t.easing));
  const patch = (p: Partial<Token>) => updateTokens(session.doc, ids, p);
  const color = common(tokens.map((t) => t.color));
  const shape = common(tokens.map((t) => t.shape));
  const team = common(tokens.map((t) => t.team));
  const size = common(tokens.map((t) => t.size)) ?? 1;

  return (
    <fieldset disabled={readOnly} className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {single
            ? single.team === "ball"
              ? "Ball"
              : `Player ${single.number ?? ""}`
            : `${tokens.length} selected`}
        </h3>
        {!readOnly && (
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              title="Duplicate (Ctrl+D)"
              aria-label="Duplicate"
              onClick={() => selectTokens(duplicateTokens(session.doc, ids))}
            >
              <Copy size={15} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Delete (Del)"
              aria-label="Delete"
              onClick={() => {
                deleteTokens(session.doc, ids);
                clearSelection();
              }}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        )}
      </div>

      {single && (
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <div>
            <Label htmlFor="tok-num">Number</Label>
            <Input
              id="tok-num"
              value={single.number ?? ""}
              maxLength={3}
              onChange={(e) => patch({ number: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="tok-label">Name / label</Label>
            <Input
              id="tok-label"
              value={single.label ?? ""}
              maxLength={24}
              placeholder="e.g. Sam"
              onChange={(e) => patch({ label: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="tok-role">Role</Label>
            <Input
              id="tok-role"
              value={single.role ?? ""}
              maxLength={24}
              placeholder="e.g. Left back, Setter"
              onChange={(e) => patch({ role: e.target.value })}
            />
          </div>
          {members.length > 0 && single.team !== "ball" && (
            <div className="col-span-2">
              <Label htmlFor="tok-member">Linked teammate</Label>
              <Select
                id="tok-member"
                value={single.memberId ?? ""}
                onChange={(e) => {
                  const m = members.find((x) => x.userId === e.target.value);
                  patch({
                    memberId: e.target.value || undefined,
                    ...(m && !single.label ? { label: m.displayName.split(" ")[0] } : {}),
                  });
                }}
              >
                <option value="">Not linked</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      <div>
        <Label>Team</Label>
        <div className="grid grid-cols-4 gap-1">
          {(["home", "away", "neutral", "ball"] as TeamSide[]).map((t) => (
            <button
              key={t}
              onClick={() =>
                patch({
                  team: t,
                  color: TEAM_COLORS[t],
                  size: t === "ball" ? 0.55 : tokens[0].team === "ball" ? 1 : size,
                })
              }
              className={cn(
                "rounded-md border px-1 py-1 text-xs capitalize",
                team === t ? "border-brand-400 text-white" : "border-ink-700 text-slate-400",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Color</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              onClick={() => patch({ color: c })}
              className={cn(
                "h-6 w-6 rounded-full border border-black/40",
                color === c && "ring-2 ring-brand-400 ring-offset-1 ring-offset-ink-900",
              )}
              style={{ background: c }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom color"
            value={color ?? "#2563eb"}
            onChange={(e) => patch({ color: e.target.value })}
            className="h-6 w-8 cursor-pointer rounded bg-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Shape</Label>
          <div className="flex gap-1">
            {(["circle", "square", "triangle"] as TokenShape[]).map((s) => (
              <button
                key={s}
                onClick={() => patch({ shape: s })}
                className={cn(
                  "flex-1 rounded-md border py-1 text-xs capitalize",
                  shape === s ? "border-brand-400 text-white" : "border-ink-700 text-slate-400",
                )}
                aria-label={s}
                title={s}
              >
                {s === "circle" ? "O" : s === "square" ? "[]" : "/\\"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="tok-size">Size {size.toFixed(1)}x</Label>
          <input
            id="tok-size"
            type="range"
            min={0.4}
            max={2.5}
            step={0.1}
            value={size}
            onChange={(e) => patch({ size: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-ink-800 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Motion</span>
          <span className="text-xs text-slate-500">
            {tracks.length} segment{tracks.length === 1 ? "" : "s"}
          </span>
        </div>
        {tracks.length > 0 && (
          <>
            <div className="flex gap-1">
              {(["smooth", "linear"] as Easing[]).map((e) => (
                <button
                  key={e}
                  onClick={() => setEasingForTokens(session.doc, ids, e)}
                  className={cn(
                    "flex-1 rounded-md border py-1 text-xs capitalize",
                    easing === e ? "border-brand-400 text-white" : "border-ink-700 text-slate-400",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-center"
                onClick={() => clearMotion(session.doc, ids)}
              >
                <Eraser size={14} /> Clear motion
              </Button>
            )}
          </>
        )}
        {!tracks.length && (
          <p className="text-xs text-slate-500">
            Press Record and drag to give {single ? "this player" : "these players"} a run.
          </p>
        )}
      </div>

      {tokens.length > 1 && !readOnly && (
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center"
          onClick={() => {
            const name = window.prompt("Name this group (e.g. Back four)", "Group");
            if (name) {
              saveGroup(session.doc, name, ids);
              toast(`Saved group "${name}"`, "success");
            }
          }}
        >
          <Users size={14} /> Save as group
        </Button>
      )}
    </fieldset>
  );
}

function AnnotationProps({ anns, readOnly }: { anns: Annotation[]; readOnly: boolean }) {
  const session = getSession()!;
  const time = usePlayback((s) => s.time);
  const a = anns[0];
  const patch = (p: Partial<Annotation>) => anns.forEach((x) => updateAnnotation(session.doc, x.id, p));
  const style = (p: Partial<Annotation["style"]>) =>
    anns.forEach((x) => updateAnnotation(session.doc, x.id, { style: { ...x.style, ...p } }));
  const r = session.sport.tokenRadius;

  return (
    <fieldset disabled={readOnly} className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">
          {anns.length > 1 ? `${anns.length} annotations` : a.kind}
        </h3>
        {!readOnly && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete annotation"
            onClick={() => {
              deleteAnnotations(
                session.doc,
                anns.map((x) => x.id),
              );
              clearSelection();
            }}
          >
            <Trash2 size={15} />
          </Button>
        )}
      </div>
      {a.kind === "text" && anns.length === 1 && (
        <div>
          <Label htmlFor="ann-text">Text</Label>
          <Input
            id="ann-text"
            autoFocus
            value={a.text ?? ""}
            maxLength={80}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </div>
      )}
      <div>
        <Label>Color</Label>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.concat("#facc15").map((c) => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              onClick={() => style({ color: c })}
              className={cn(
                "h-6 w-6 rounded-full border border-black/40",
                a.style.color === c && "ring-2 ring-brand-400",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ann-w">Thickness</Label>
          <input
            id="ann-w"
            type="range"
            min={r * 0.08}
            max={r * 0.8}
            step={r * 0.02}
            value={a.style.width}
            onChange={(e) => style({ width: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <label className="mt-5 flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={a.style.dashed}
            onChange={(e) => style({ dashed: e.target.checked })}
          />{" "}
          Dashed
        </label>
      </div>
      <div className="space-y-2 rounded-lg border border-ink-800 p-3 text-xs">
        <div className="font-medium text-slate-300">Timing</div>
        <p className="text-slate-500">
          {a.tStart === undefined && a.tEnd === undefined
            ? "Always visible"
            : `Visible ${a.tStart !== undefined ? `from ${formatTime(a.tStart)}` : "from start"} ${a.tEnd !== undefined ? `until ${formatTime(a.tEnd)}` : "to end"}`}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => patch({ tStart: Math.round(time) })}>
            Show from now
          </Button>
          <Button size="sm" variant="outline" onClick={() => patch({ tEnd: Math.round(time) })}>
            Hide after now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => patch({ tStart: undefined, tEnd: undefined })}>
            Always
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
