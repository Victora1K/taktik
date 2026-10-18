"use client";

import { ChevronLeft, ChevronRight, Pause, Play, Plus, Repeat, SkipBack, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { addPhase, setMeta, shiftTrack, trimTrackRange, updatePhaseDuration } from "@/lib/collab/actions";
import { orderedPhases, phaseBounds, phaseRouteCount } from "@/lib/engine/phases";
import { contentEnd, trackEnd, trackStart } from "@/lib/engine/tracks";
import { useComments } from "@/lib/editor/comments";
import { pause, play, seek, step } from "@/lib/editor/clock";
import { cancelRoute } from "@/lib/editor/phase-routing";
import { startRecording, stopRecording } from "@/lib/editor/recording";
import { getSession } from "@/lib/editor/session";
import { selectTokens, useEditor, usePlayback } from "@/lib/editor/store";
import { cn, formatTime } from "@/lib/utils";

type DragMode = "shift" | "start" | "end";

export function Timeline({ readOnly }: { readOnly: boolean }) {
  const pb = usePlayback(
    useShallow((s) => ({
      time: s.time,
      playing: s.playing,
      speed: s.speed,
      loop: s.loop,
      recording: s.recording,
    })),
  );
  const ed = useEditor(
    useShallow((s) => ({
      state: s.state,
      selectedTokens: s.selectedTokens,
      overdub: s.overdub,
      followClientId: s.followClientId,
      activePhaseId: s.activePhaseId,
    })),
  );
  const comments = useComments((s) => s.comments);
  const duration = ed.state.meta.durationMs;
  const phases = useMemo(() => orderedPhases(ed.state.phases), [ed.state.phases]);
  const activePhase = ed.activePhaseId ? ed.state.phases[ed.activePhaseId] : null;
  const scrubRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ trackId: string; mode: DragMode; startX: number; dt: number } | null>(
    null,
  );

  const visibleLayers = useMemo(
    () =>
      new Set(
        Object.values(ed.state.layers)
          .filter((l) => l.visible)
          .map((l) => l.id),
      ),
    [ed.state.layers],
  );
  const lanes = useMemo(() => {
    const sel = new Set(ed.selectedTokens);
    return Object.values(ed.state.tracks)
      .filter(
        (t) =>
          visibleLayers.has(t.layerId) && ed.state.tokens[t.tokenId] && (!sel.size || sel.has(t.tokenId)),
      )
      .sort((a, b) => a.tokenId.localeCompare(b.tokenId) || trackStart(a) - trackStart(b));
  }, [ed.state.tracks, ed.state.tokens, ed.selectedTokens, visibleLayers]);

  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / Math.max(1, duration)) * 100))}%`;
  const msPerPx = () => duration / Math.max(1, scrubRef.current?.getBoundingClientRect().width ?? 1);

  function scrubTo(clientX: number) {
    const rect = scrubRef.current!.getBoundingClientRect();
    seek(((clientX - rect.left) / rect.width) * duration);
  }

  function startDrag(e: React.PointerEvent, trackId: string, mode: DragMode) {
    if (readOnly) return;
    if (ed.state.tracks[trackId]?.phaseId) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ trackId, mode, startX: e.clientX, dt: 0 });
  }

  function endDrag() {
    const session = getSession();
    if (!drag || !session) return setDrag(null);
    const tr = ed.state.tracks[drag.trackId];
    if (tr && Math.abs(drag.dt) > 5) {
      if (drag.mode === "shift") shiftTrack(session.doc, tr.id, drag.dt);
      else if (drag.mode === "start")
        trimTrackRange(
          session.doc,
          tr.id,
          Math.min(trackEnd(tr) - 50, trackStart(tr) + drag.dt),
          trackEnd(tr),
        );
      else
        trimTrackRange(
          session.doc,
          tr.id,
          trackStart(tr),
          Math.max(trackStart(tr) + 50, trackEnd(tr) + drag.dt),
        );
    }
    setDrag(null);
  }

  const minDuration = Math.max(1000, Math.ceil(contentEnd(ed.state) / 1000) * 1000);
  const following = ed.followClientId != null;

  function selectPhase(id: string) {
    const bounds = phaseBounds(ed.state.phases, id);
    if (!bounds) return;
    cancelRoute();
    pause();
    seek(bounds.start);
    useEditor.setState({ activePhaseId: id });
  }

  function appendPhase() {
    const session = getSession();
    if (!session) return;
    cancelRoute();
    const phase = addPhase(session.doc);
    useEditor.setState({ activePhaseId: phase.id });
    seek(phases.reduce((sum, item) => sum + item.durationMs, 0));
  }

  return (
    <section className="shrink-0 border-t border-ink-800 bg-ink-900 px-3 pb-2 pt-1.5" aria-label="Timeline">
      {!readOnly && (
        <div className="scrollbar-thin mb-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Phases
          </span>
          {phases.map((phase) => {
            const bounds = phaseBounds(ed.state.phases, phase.id)!;
            const active = phase.id === ed.activePhaseId;
            return (
              <button
                key={phase.id}
                type="button"
                onClick={() => selectPhase(phase.id)}
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 text-xs",
                  active
                    ? "border-brand-400 bg-brand-500/15 text-brand-200"
                    : "border-ink-700 text-slate-400 hover:text-white",
                )}
                aria-pressed={active}
                title={`${formatTime(bounds.start)}–${formatTime(bounds.end)}; ${phaseRouteCount(ed.state, phase.id)} routed players`}
              >
                {phase.name} · {(phase.durationMs / 1000).toFixed(1)}s
              </button>
            );
          })}
          <Button size="sm" variant="ghost" onClick={appendPhase} disabled={following}>
            <Plus size={14} /> {phases.length ? "Next phase" : "Add phase"}
          </Button>
          {activePhase && (
            <label className="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-400">
              Duration
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={activePhase.durationMs / 1000}
                onChange={(event) => {
                  const session = getSession();
                  if (session && Number.isFinite(Number(event.target.value)))
                    updatePhaseDuration(session.doc, activePhase.id, Number(event.target.value) * 1000);
                }}
                className="h-7 w-14 rounded border border-ink-700 bg-ink-900 px-1 text-slate-200"
                aria-label="Active phase duration in seconds"
              />
              s
            </label>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Back to start"
          title="Back to start"
          onClick={() => seek(0)}
          disabled={following}
        >
          <SkipBack size={16} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Previous frame"
          title="Previous frame (,)"
          onClick={() => step(-1)}
          disabled={following}
        >
          <ChevronLeft size={16} />
        </Button>
        <Button
          size="icon"
          variant="primary"
          aria-label={pb.playing ? "Pause" : "Play"}
          title="Play / pause (Space)"
          onClick={() => (pb.recording ? stopRecording() : pb.playing ? pause() : play())}
          disabled={following}
          data-testid="play"
        >
          {pb.playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Next frame"
          title="Next frame (.)"
          onClick={() => step(1)}
          disabled={following}
        >
          <ChevronRight size={16} />
        </Button>
        {!readOnly && (
          <Button
            size="sm"
            variant={pb.recording ? "danger" : "outline"}
            onClick={() => (pb.recording ? stopRecording() : startRecording())}
            title="Record (R): drag players while the clip plays. Timed routes and recordings can share the same play."
            data-testid="record"
            disabled={following}
          >
            {pb.recording ? (
              <Square size={13} fill="currentColor" />
            ) : (
              <span className="h-3 w-3 rounded-full bg-red-500" />
            )}
            {pb.recording ? "Stop" : "Record"}
          </Button>
        )}
        {!readOnly && (
          <select
            className="h-8 rounded-md border border-ink-700 bg-ink-900 px-1.5 text-xs text-slate-200"
            value={ed.overdub}
            onChange={(e) => useEditor.setState({ overdub: e.target.value as "replace" | "layer" })}
            aria-label="When recording over existing motion"
            title="What happens when you record over a player who already moves at that time"
          >
            <option value="replace">Overdub: replace motion</option>
            <option value="layer">Overdub: new layer</option>
          </select>
        )}
        <select
          className="h-8 rounded-md border border-ink-700 bg-ink-900 px-1.5 text-xs text-slate-200"
          value={pb.speed}
          onChange={(e) => usePlayback.setState({ speed: Number(e.target.value) })}
          aria-label="Playback speed"
          disabled={following}
        >
          {[0.25, 0.5, 1, 1.5, 2].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <Button
          size="icon"
          variant="ghost"
          active={pb.loop}
          aria-pressed={pb.loop}
          aria-label="Loop"
          title="Loop"
          onClick={() => usePlayback.setState({ loop: !pb.loop })}
        >
          <Repeat size={15} />
        </Button>
        <span className="ml-1 font-mono text-xs tabular-nums text-slate-300" data-testid="time">
          {formatTime(pb.time)} / {formatTime(duration)}
        </span>
        {!readOnly && (
          <label className="ml-auto flex items-center gap-1 text-xs text-slate-400">
            Length
            <input
              type="number"
              min={minDuration / 1000}
              max={120}
              step={1}
              value={Math.round(duration / 1000)}
              onChange={(e) => {
                const s = getSession();
                const v = Math.max(minDuration, Math.min(120_000, Number(e.target.value) * 1000));
                if (s && Number.isFinite(v)) setMeta(s.doc, { durationMs: v });
              }}
              className="h-7 w-14 rounded border border-ink-700 bg-ink-900 px-1 text-slate-200"
              aria-label="Clip length in seconds"
            />
            s
          </label>
        )}
      </div>

      <div className="mt-1.5 grid grid-cols-[6.5rem_1fr] gap-x-2">
        <div className="text-[11px] leading-6 text-slate-500">
          {lanes.length ? (ed.selectedTokens.length ? "Selected" : "All motion") : "No motion yet"}
        </div>
        <div
          ref={scrubRef}
          className="relative h-6 cursor-pointer rounded bg-ink-800"
          role="slider"
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.round(pb.time)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") step(-3);
            if (e.key === "ArrowRight") step(3);
          }}
          onPointerDown={(e) => {
            if (following) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pause();
            scrubTo(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && !following && scrubTo(e.clientX)}
          data-testid="scrubber"
        >
          {Array.from({ length: Math.floor(duration / 1000) + 1 }, (_, i) => (
            <span key={i} className="absolute top-0 h-2 w-px bg-ink-700" style={{ left: pct(i * 1000) }} />
          ))}
          {phases.slice(1).map((phase) => {
            const bounds = phaseBounds(ed.state.phases, phase.id)!;
            return (
              <span
                key={phase.id}
                className="pointer-events-none absolute inset-y-0 w-px bg-brand-300/60"
                style={{ left: pct(bounds.start) }}
              />
            );
          })}
          {comments
            .filter((c) => c.anchorMs != null && !c.parentId)
            .map((c) => (
              <button
                key={c.id}
                title={`${c.authorName}: ${c.body.slice(0, 60)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  seek(c.anchorMs!);
                  useEditor.setState({ focusedCommentId: c.id, rightTab: "comments" });
                }}
                className="absolute bottom-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-white/70"
                style={{ left: pct(c.anchorMs!), background: c.authorColor, opacity: c.resolved ? 0.4 : 1 }}
                aria-label={`Comment at ${formatTime(c.anchorMs!)}`}
              />
            ))}
          <span
            className="pointer-events-none absolute -top-0.5 bottom-0 w-0.5 bg-brand-400"
            style={{ left: pct(pb.time) }}
          />
        </div>
      </div>

      {lanes.length > 0 && (
        <div className="scrollbar-thin mt-1 max-h-24 overflow-y-auto">
          {lanes.map((tr) => {
            const tok = ed.state.tokens[tr.tokenId];
            const layer = ed.state.layers[tr.layerId];
            let s = trackStart(tr);
            let e = trackEnd(tr);
            if (drag?.trackId === tr.id) {
              if (drag.mode === "shift") {
                const d = Math.max(-s, drag.dt);
                s += d;
                e += d;
              } else if (drag.mode === "start") s = Math.max(0, Math.min(e - 50, s + drag.dt));
              else e = Math.max(s + 50, e + drag.dt);
            }
            return (
              <div key={tr.id} className="grid grid-cols-[6.5rem_1fr] items-center gap-x-2 py-0.5">
                <button
                  className="flex items-center gap-1.5 truncate text-left text-[11px] text-slate-300 hover:text-white"
                  onClick={() => selectTokens([tr.tokenId])}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tok.color }} />
                  <span className="truncate">
                    {tok.team === "ball" ? "Ball" : `#${tok.number ?? "?"}`} {tok.label ? tok.label : ""}
                  </span>
                  <span
                    className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: layer?.color }}
                    title={layer?.name}
                  />
                </button>
                <div className="relative h-4 rounded bg-ink-800/60">
                  <div
                    className={cn("absolute top-0 h-4 rounded", readOnly || tr.phaseId ? "" : "cursor-grab")}
                    style={{
                      left: pct(s),
                      width: `calc(${pct(e - s)} + 2px)`,
                      background: tok.team === "ball" ? "#e2e8f0" : tok.color,
                      opacity: 0.75,
                    }}
                    onPointerDown={(ev) => startDrag(ev, tr.id, "shift")}
                    onPointerMove={(ev) =>
                      drag?.trackId === tr.id &&
                      setDrag({ ...drag, dt: (ev.clientX - drag.startX) * msPerPx() })
                    }
                    onPointerUp={endDrag}
                    title={`${formatTime(s)} - ${formatTime(e)} (${layer?.name ?? ""}). Drag to shift, drag the edges to trim.`}
                  >
                    {!readOnly && !tr.phaseId && (
                      <>
                        <span
                          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l bg-black/30"
                          onPointerDown={(ev) => startDrag(ev, tr.id, "start")}
                        />
                        <span
                          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-black/30"
                          onPointerDown={(ev) => startDrag(ev, tr.id, "end")}
                        />
                      </>
                    )}
                  </div>
                  <span
                    className="pointer-events-none absolute inset-y-0 w-px bg-brand-400/70"
                    style={{ left: pct(pb.time) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
