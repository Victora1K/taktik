"use client";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/toast";
import {
  addAnnotation,
  moveKeyframe,
  deleteKeyframe,
  translateAnnotations,
  translateTokens,
} from "@/lib/collab/actions";
import { samplePath, type Point } from "@/lib/engine/interpolate";
import { allPositionsAt, annotationVisibleAt, tracksByToken } from "@/lib/engine/tracks";
import type { Annotation, AnnotationKind, Track } from "@/lib/engine/types";
import { PIN_WINDOW_MS, useComments } from "@/lib/editor/comments";
import { seek } from "@/lib/editor/clock";
import { grab, release } from "@/lib/editor/recording";
import { getSession, setPresence } from "@/lib/editor/session";
import {
  clearSelection,
  lockedByPeers,
  selectAnnotations,
  selectTokens,
  useEditor,
  usePlayback,
} from "@/lib/editor/store";
import { AnnotationNode } from "./AnnotationNode";
import { Field } from "./Field";
import { TokenNode } from "./TokenNode";

type Interaction =
  | { kind: "idle" }
  | {
      kind: "tokens";
      ids: string[];
      start: Point;
      startPos: Record<string, Point>;
      moved: boolean;
      clickedId: string;
      recording: boolean;
    }
  | { kind: "annotations"; ids: string[]; start: Point; last: Point; moved: boolean }
  | { kind: "marquee"; start: Point; additive: boolean }
  | { kind: "pan"; startClient: Point; startView: { x: number; y: number } }
  | { kind: "draw"; tool: AnnotationKind; points: number[] }
  | { kind: "kf"; trackId: string; index: number }
  | { kind: "pinch"; dist: number; mid: Point; zoom: number; view: { x: number; y: number } };

type Draft =
  | { kind: "marquee"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "annotation"; ann: Annotation }
  | { kind: "kf"; trackId: string; index: number; x: number; y: number }
  | null;

const DRAW_TOOLS = new Set(["arrow", "line", "zone", "freehand"]);

export default function Board({ readOnly }: { readOnly: boolean }) {
  const session = getSession()!;
  const sport = session.sport;
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Draft>(null);
  const [coarse, setCoarse] = useState(false);
  const interaction = useRef<Interaction>({ kind: "idle" });
  const touches = useRef(new Map<number, Point>());
  const spaceDown = useRef(false);

  const state = useEditor((s) => s.state);
  const time = usePlayback((s) => s.time);
  const recording = usePlayback((s) => s.recording);
  const ui = useEditor(
    useShallow((s) => ({
      tool: s.tool,
      selectedTokens: s.selectedTokens,
      selectedAnnotations: s.selectedAnnotations,
      overrides: s.overrides,
      peers: s.peers,
      view: s.view,
      showTrails: s.showTrails,
      editPaths: s.editPaths,
      pendingPin: s.pendingPin,
      focusedCommentId: s.focusedCommentId,
      drawColor: s.drawColor,
      drawDashed: s.drawDashed,
    })),
  );
  const comments = useComments((s) => s.comments);

  // ---------- layout ----------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(el);
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    session.stage = stageRef.current;
    return () => {
      session.stage = null;
    };
  }, [session, size.w]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement)?.closest("input,textarea,select"))
        spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && (spaceDown.current = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const totalW = sport.width + 2 * sport.margin;
  const totalH = sport.height + 2 * sport.margin;
  const fit = size.w && size.h ? Math.min(size.w / totalW, size.h / totalH) : 1;
  const scale = fit * ui.view.zoom;
  const baseOffset = (s: number) => ({
    x: (size.w - totalW * s) / 2 + sport.margin * s,
    y: (size.h - totalH * s) / 2 + sport.margin * s,
  });
  const off = baseOffset(scale);
  const offX = off.x + ui.view.x;
  const offY = off.y + ui.view.y;
  const r = sport.tokenRadius;

  // ---------- derived positions ----------

  const byToken = useMemo(() => tracksByToken(state), [state]);
  const positions = useMemo(() => {
    const pos = allPositionsAt(state, time, byToken);
    for (const p of ui.peers)
      if (p.live) for (const [id, v] of Object.entries(p.live)) if (pos[id]) pos[id] = v;
    for (const [id, v] of Object.entries(ui.overrides)) if (pos[id]) pos[id] = v;
    return pos;
  }, [state, time, byToken, ui.peers, ui.overrides]);

  const locks = useMemo(() => lockedByPeers(ui.peers), [ui.peers]);
  const peerSelections = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of ui.peers) {
      const color = p.user?.color ?? "#94a3b8";
      for (const id of new Set([...(p.selection ?? []), ...(p.locked ?? [])]))
        map.set(id, [...(map.get(id) ?? []), color]);
    }
    return map;
  }, [ui.peers]);

  const memberNames = useMemo(
    () => new Map(session.members.map((m) => [m.userId, m.displayName.split(" ")[0]])),
    [session.members],
  );

  const latest = useRef({ positions, state, scale, offX, offY, ui, readOnly, locks, recording });
  latest.current = { positions, state, scale, offX, offY, ui, readOnly, locks, recording };

  // Lets end-to-end tests aim at tokens on the canvas.
  useEffect(() => {
    const w = window as unknown as { __taktikBoard?: unknown };
    w.__taktikBoard = {
      toClient: (x: number, y: number) => {
        const rect = containerRef.current!.getBoundingClientRect();
        const { offX, offY, scale } = latest.current;
        return { x: rect.left + offX + x * scale, y: rect.top + offY + y * scale };
      },
      positions: () => latest.current.positions,
    };
    return () => {
      delete w.__taktikBoard;
    };
  }, []);

  // ---------- coordinate helpers ----------

  function toField(clientX: number, clientY: number): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    const { offX, offY, scale } = latest.current;
    return { x: (clientX - rect.left - offX) / scale, y: (clientY - rect.top - offY) / scale };
  }

  function clampPos(p: Point): Point {
    return {
      x: Math.max(-sport.margin, Math.min(sport.width + sport.margin, p.x)),
      y: Math.max(-sport.margin, Math.min(sport.height + sport.margin, p.y)),
    };
  }

  // ---------- pointer handling ----------

  function beginPinch() {
    const pts = [...touches.current.values()];
    if (pts.length < 2) return;
    cancelInteraction();
    const [a, b] = pts;
    interaction.current = {
      kind: "pinch",
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: latest.current.ui.view.zoom,
      view: { x: latest.current.ui.view.x, y: latest.current.ui.view.y },
    };
  }

  function cancelInteraction() {
    const it = interaction.current;
    if (it.kind === "tokens") {
      if (it.recording) release();
      else {
        const overrides = { ...useEditor.getState().overrides };
        it.ids.forEach((id) => delete overrides[id]);
        useEditor.setState({ overrides });
      }
      setPresence({ live: null });
    }
    setDraft(null);
    interaction.current = { kind: "idle" };
  }

  function onPointerDown(e: KonvaEventObject<PointerEvent>) {
    const evt = e.evt;
    if (evt.pointerType === "touch") {
      touches.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      if (touches.current.size >= 2) return beginPinch();
    }
    const { ui, readOnly, positions, state, locks } = latest.current;
    const p = toField(evt.clientX, evt.clientY);
    const target = e.target;

    if (evt.button === 1 || ui.tool === "pan" || spaceDown.current) {
      interaction.current = {
        kind: "pan",
        startClient: { x: evt.clientX, y: evt.clientY },
        startView: { x: ui.view.x, y: ui.view.y },
      };
      return;
    }

    if (ui.tool === "pin") {
      useEditor.setState({ pendingPin: p, tool: "select", rightTab: "comments" });
      return;
    }

    const pinNode = target.findAncestor(".pin", true);
    if (pinNode) {
      const id = pinNode.getAttr("commentId") as string;
      const c = useComments.getState().comments.find((x) => x.id === id);
      useEditor.setState({ focusedCommentId: id, rightTab: "comments" });
      if (c?.anchorMs != null) seek(c.anchorMs);
      return;
    }

    if (readOnly && ui.tool !== "select") return;

    if (DRAW_TOOLS.has(ui.tool)) {
      interaction.current = { kind: "draw", tool: ui.tool as AnnotationKind, points: [p.x, p.y, p.x, p.y] };
      return;
    }

    if (ui.tool === "text") {
      const ann = addAnnotation(session.doc, {
        kind: "text",
        points: [p.x, p.y],
        text: "Text",
        style: { color: ui.drawColor, width: r * 0.22, dashed: false },
      });
      selectAnnotations([ann.id]);
      useEditor.setState({ tool: "select", rightTab: "props" });
      return;
    }

    const kfNode = target.findAncestor(".kf", true);
    if (kfNode && !readOnly) {
      interaction.current = {
        kind: "kf",
        trackId: kfNode.getAttr("trackId"),
        index: kfNode.getAttr("index"),
      };
      return;
    }

    const tokenNode = target.findAncestor(".token", true);
    if (tokenNode) {
      const id = tokenNode.getAttr("tokenId") as string;
      const lockedBy = locks.get(id);
      let sel = ui.selectedTokens;
      if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
        sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      } else if (!sel.includes(id)) sel = [id];
      selectTokens(sel);
      if (readOnly || !sel.includes(id)) return;
      if (lockedBy) {
        toast(`${lockedBy.user?.name ?? "A teammate"} is recording this player`);
        return;
      }
      const ids = sel.filter((x) => !locks.has(x) && state.tokens[x]);
      const startPos: Record<string, Point> = {};
      ids.forEach((x) => (startPos[x] = positions[x]));
      const isRec = grab(ids, startPos);
      interaction.current = {
        kind: "tokens",
        ids,
        start: p,
        startPos,
        moved: false,
        clickedId: id,
        recording: isRec,
      };
      return;
    }

    const annNode = target.findAncestor(".annotation", true);
    if (annNode) {
      const id = annNode.getAttr("annId") as string;
      let sel = ui.selectedAnnotations;
      if (evt.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) sel = [id];
      selectAnnotations(sel);
      if (!readOnly) interaction.current = { kind: "annotations", ids: sel, start: p, last: p, moved: false };
      return;
    }

    if (!evt.shiftKey) clearSelection();
    interaction.current = { kind: "marquee", start: p, additive: evt.shiftKey };
    setDraft({ kind: "marquee", x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }

  function onPointerMove(e: KonvaEventObject<PointerEvent>) {
    const evt = e.evt;
    if (evt.pointerType === "touch" && touches.current.has(evt.pointerId)) {
      touches.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    }
    const p = toField(evt.clientX, evt.clientY);
    setPresence({ cursor: p });
    const it = interaction.current;
    switch (it.kind) {
      case "pinch": {
        const pts = [...touches.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoom = Math.max(0.5, Math.min(6, (it.zoom * dist) / Math.max(1, it.dist)));
        zoomAround(
          mid,
          zoom,
          { x: it.view.x + (mid.x - it.mid.x), y: it.view.y + (mid.y - it.mid.y) },
          it.zoom,
        );
        return;
      }
      case "pan":
        useEditor.setState({
          view: {
            ...latest.current.ui.view,
            x: it.startView.x + evt.clientX - it.startClient.x,
            y: it.startView.y + evt.clientY - it.startClient.y,
          },
        });
        return;
      case "tokens": {
        const dx = p.x - it.start.x;
        const dy = p.y - it.start.y;
        if (!it.moved && Math.hypot(dx, dy) * latest.current.scale < 3) return;
        it.moved = true;
        const overrides = { ...useEditor.getState().overrides };
        const live: Record<string, Point> = {};
        for (const id of it.ids)
          live[id] = overrides[id] = clampPos({ x: it.startPos[id].x + dx, y: it.startPos[id].y + dy });
        useEditor.setState({ overrides });
        setPresence({ live });
        return;
      }
      case "annotations": {
        it.moved = true;
        it.last = p;
        const dx = p.x - it.start.x;
        const dy = p.y - it.start.y;
        const st = latest.current.state;
        const a = st.annotations[it.ids[0]];
        if (a)
          setDraft({
            kind: "annotation",
            ann: { ...a, points: a.points.map((v, i) => v + (i % 2 ? dy : dx)) },
          });
        return;
      }
      case "marquee":
        setDraft({ kind: "marquee", x1: it.start.x, y1: it.start.y, x2: p.x, y2: p.y });
        return;
      case "draw": {
        if (it.tool === "freehand") {
          const n = it.points.length;
          if (Math.hypot(p.x - it.points[n - 2], p.y - it.points[n - 1]) > 0.15 * r) it.points.push(p.x, p.y);
        } else {
          it.points[2] = p.x;
          it.points[3] = p.y;
        }
        const { drawColor, drawDashed } = latest.current.ui;
        setDraft({
          kind: "annotation",
          ann: {
            id: "draft",
            kind: it.tool,
            points: [...it.points],
            style: { color: drawColor, width: r * 0.22, dashed: drawDashed },
          },
        });
        return;
      }
      case "kf":
        setDraft({ kind: "kf", trackId: it.trackId, index: it.index, x: p.x, y: p.y });
        return;
    }
  }

  function onPointerUp(e: KonvaEventObject<PointerEvent>) {
    const evt = e.evt;
    touches.current.delete(evt.pointerId);
    const it = interaction.current;
    interaction.current = { kind: "idle" };
    const p = toField(evt.clientX, evt.clientY);
    switch (it.kind) {
      case "tokens": {
        if (it.recording) {
          release();
          setPresence({ live: null });
          return;
        }
        const overrides = { ...useEditor.getState().overrides };
        if (it.moved) {
          const deltas: Record<string, { dx: number; dy: number }> = {};
          for (const id of it.ids) {
            const v = overrides[id];
            if (v) deltas[id] = { dx: v.x - it.startPos[id].x, dy: v.y - it.startPos[id].y };
          }
          translateTokens(session.doc, deltas);
        } else if (!evt.shiftKey && latest.current.ui.selectedTokens.length > 1) {
          selectTokens([it.clickedId]);
        }
        it.ids.forEach((id) => delete overrides[id]);
        useEditor.setState({ overrides });
        setPresence({ live: null });
        return;
      }
      case "annotations":
        if (it.moved)
          translateAnnotations(session.doc, it.ids, it.last.x - it.start.x, it.last.y - it.start.y);
        setDraft(null);
        return;
      case "marquee": {
        const x1 = Math.min(it.start.x, p.x),
          x2 = Math.max(it.start.x, p.x);
        const y1 = Math.min(it.start.y, p.y),
          y2 = Math.max(it.start.y, p.y);
        setDraft(null);
        if ((x2 - x1) * latest.current.scale < 4 && (y2 - y1) * latest.current.scale < 4) return;
        const hits = Object.entries(latest.current.positions)
          .filter(([, v]) => v.x >= x1 && v.x <= x2 && v.y >= y1 && v.y <= y2)
          .map(([id]) => id);
        const prev = it.additive ? latest.current.ui.selectedTokens : [];
        selectTokens([...new Set([...prev, ...hits])]);
        return;
      }
      case "draw": {
        setDraft(null);
        const pts = it.points;
        const len = Math.hypot(pts[pts.length - 2] - pts[0], pts[pts.length - 1] - pts[1]);
        if (it.tool !== "freehand" && len < r * 0.5) return;
        if (it.tool === "freehand" && pts.length < 6) return;
        const { drawColor, drawDashed } = latest.current.ui;
        const ann = addAnnotation(session.doc, {
          kind: it.tool,
          points: pts,
          style: { color: drawColor, width: r * 0.22, dashed: drawDashed },
        });
        selectAnnotations([ann.id]);
        return;
      }
      case "kf":
        setDraft(null);
        if (draftRef.current?.kind === "kf")
          moveKeyframe(session.doc, it.trackId, it.index, draftRef.current.x, draftRef.current.y);
        return;
    }
  }

  const draftRef = useRef<Draft>(null);
  draftRef.current = draft;

  function zoomAround(client: Point, zoom: number, view: { x: number; y: number }, fromZoom: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    const px = client.x - rect.left;
    const py = client.y - rect.top;
    const s0 = fit * fromZoom;
    const s1 = fit * zoom;
    const b0 = baseOffset(s0);
    const b1 = baseOffset(s1);
    const fx = (px - (b0.x + view.x)) / s0;
    const fy = (py - (b0.y + view.y)) / s0;
    useEditor.setState({ view: { zoom, x: px - fx * s1 - b1.x, y: py - fy * s1 - b1.y } });
  }

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const { view } = latest.current.ui;
    const zoom = Math.max(0.5, Math.min(6, view.zoom * Math.exp(-e.evt.deltaY * 0.0015)));
    zoomAround({ x: e.evt.clientX, y: e.evt.clientY }, zoom, { x: view.x, y: view.y }, view.zoom);
  }

  function onDblClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (readOnly) return;
    const kfNode = e.target.findAncestor(".kf", true);
    if (kfNode) {
      deleteKeyframe(session.doc, kfNode.getAttr("trackId"), kfNode.getAttr("index"));
      return;
    }
    if (e.target.findAncestor(".annotation", true)) useEditor.setState({ rightTab: "props" });
  }

  // ---------- render helpers ----------

  const visibleLayers = useMemo(
    () =>
      new Set(
        Object.values(state.layers)
          .filter((l) => l.visible)
          .map((l) => l.id),
      ),
    [state.layers],
  );
  const selectedSet = useMemo(() => new Set(ui.selectedTokens), [ui.selectedTokens]);

  const trails = useMemo(() => {
    const out: { track: Track; color: string; active: boolean }[] = [];
    const active = new Set([...byToken.values()].flat().map((t) => t.id));
    for (const tr of Object.values(state.tracks)) {
      const tok = state.tokens[tr.tokenId];
      if (!tok || !visibleLayers.has(tr.layerId)) continue;
      if (!ui.showTrails && !selectedSet.has(tr.tokenId)) continue;
      out.push({ track: tr, color: tok.team === "ball" ? "#f8fafc" : tok.color, active: active.has(tr.id) });
    }
    return out;
  }, [state.tracks, state.tokens, visibleLayers, ui.showTrails, selectedSet, byToken]);

  const kfTracks =
    ui.editPaths && ui.selectedTokens.length === 1
      ? trails.filter((t) => t.track.tokenId === ui.selectedTokens[0])
      : [];
  const pins = comments.filter(
    (c) =>
      !c.parentId &&
      c.anchorX != null &&
      c.anchorY != null &&
      (!c.resolved || c.id === ui.focusedCommentId) &&
      (c.anchorMs == null || Math.abs(time - c.anchorMs) <= PIN_WINDOW_MS || c.id === ui.focusedCommentId),
  );
  const inv = 1 / scale;
  const cursor =
    ui.tool === "pan"
      ? "grab"
      : DRAW_TOOLS.has(ui.tool) || ui.tool === "pin" || ui.tool === "text"
        ? "crosshair"
        : "default";

  function withDraftKf(tr: Track): Track {
    if (draft?.kind !== "kf" || draft.trackId !== tr.id) return tr;
    const keyframes = tr.keyframes.map((k, i) => (i === draft.index ? { ...k, x: draft.x, y: draft.y } : k));
    return { ...tr, keyframes };
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-ink-950"
      style={{ cursor }}
      onPointerLeave={() => setPresence({ cursor: null })}
      data-testid="board"
    >
      {size.w > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onDblClick={onDblClick}
          onDblTap={onDblClick}
        >
          <Layer listening={false}>
            <Group x={offX} y={offY} scaleX={scale} scaleY={scale}>
              <Field sport={sport} />
            </Group>
          </Layer>
          <Layer>
            <Group x={offX} y={offY} scaleX={scale} scaleY={scale}>
              {Object.values(state.annotations)
                .filter((a) => annotationVisibleAt(a, time) || ui.selectedAnnotations.includes(a.id))
                .filter(
                  (a) =>
                    !(
                      draft?.kind === "annotation" &&
                      interaction.current.kind === "annotations" &&
                      a.id === draft.ann.id
                    ),
                )
                .map((a) => (
                  <AnnotationNode key={a.id} a={a} selected={ui.selectedAnnotations.includes(a.id)} />
                ))}
              {draft?.kind === "annotation" && (
                <AnnotationNode
                  a={draft.ann}
                  draft={draft.ann.id === "draft"}
                  selected={draft.ann.id !== "draft"}
                />
              )}

              <Group listening={false}>
                {trails.map(({ track, color, active }) => {
                  const tr = withDraftKf(track);
                  return (
                    <Arrow
                      key={tr.id}
                      points={samplePath(tr.keyframes, tr.easing)}
                      stroke={color}
                      fill={color}
                      strokeWidth={r * 0.14}
                      pointerLength={r * 0.55}
                      pointerWidth={r * 0.55}
                      dash={[r * 0.45, r * 0.3]}
                      opacity={active ? 0.6 : 0.25}
                      lineCap="round"
                      lineJoin="round"
                    />
                  );
                })}
              </Group>

              {Object.values(state.tokens)
                .sort((a, b) => Number(a.team === "ball") - Number(b.team === "ball"))
                .map((tok) => {
                  const pos = positions[tok.id] ?? tok;
                  return (
                    <TokenNode
                      key={tok.id}
                      token={tok}
                      x={pos.x}
                      y={pos.y}
                      baseRadius={r}
                      selected={selectedSet.has(tok.id)}
                      peerColors={peerSelections.get(tok.id) ?? []}
                      locked={locks.has(tok.id)}
                      bigHit={coarse || recording}
                      label={tok.label || (tok.memberId ? memberNames.get(tok.memberId) : undefined)}
                    />
                  );
                })}

              {kfTracks.map(({ track }) =>
                withDraftKf(track).keyframes.map((k, i) => (
                  <Group key={`${track.id}-${i}`} x={k.x} y={k.y} name="kf" trackId={track.id} index={i}>
                    <Circle
                      radius={r * 0.32}
                      fill="#0b1020"
                      stroke="#34d399"
                      strokeWidth={r * 0.08}
                      hitStrokeWidth={r * 0.5}
                    />
                  </Group>
                )),
              )}

              {pins.map((c) => (
                <Group
                  key={c.id}
                  x={c.anchorX!}
                  y={c.anchorY!}
                  name="pin"
                  commentId={c.id}
                  scaleX={inv}
                  scaleY={inv}
                >
                  <Circle
                    radius={11}
                    fill={c.authorColor}
                    stroke={c.id === ui.focusedCommentId ? "#34d399" : "#fff"}
                    strokeWidth={2}
                  />
                  <Text
                    text="!"
                    fontSize={14}
                    fontStyle="bold"
                    fill="#fff"
                    width={22}
                    offsetX={11}
                    offsetY={7}
                    align="center"
                    listening={false}
                  />
                </Group>
              ))}
              {ui.pendingPin && (
                <Group x={ui.pendingPin.x} y={ui.pendingPin.y} scaleX={inv} scaleY={inv} listening={false}>
                  <Circle radius={11} fill="#34d399" stroke="#fff" strokeWidth={2} dash={[4, 3]} />
                </Group>
              )}

              {draft?.kind === "marquee" && (
                <Rect
                  x={Math.min(draft.x1, draft.x2)}
                  y={Math.min(draft.y1, draft.y2)}
                  width={Math.abs(draft.x2 - draft.x1)}
                  height={Math.abs(draft.y2 - draft.y1)}
                  fill="rgba(52,211,153,0.12)"
                  stroke="#34d399"
                  strokeWidth={inv}
                  dash={[4 * inv, 3 * inv]}
                  listening={false}
                />
              )}

              {ui.peers.map((p) =>
                p.cursor ? (
                  <Group
                    key={p.clientId}
                    x={p.cursor.x}
                    y={p.cursor.y}
                    scaleX={inv}
                    scaleY={inv}
                    listening={false}
                  >
                    <Line
                      points={[0, 0, 0, 16, 4.5, 12, 11, 12]}
                      closed
                      fill={p.user?.color ?? "#94a3b8"}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                    <Rect
                      x={10}
                      y={14}
                      width={(p.user?.name.length ?? 4) * 6.6 + 10}
                      height={18}
                      cornerRadius={4}
                      fill={p.user?.color ?? "#94a3b8"}
                    />
                    <Text x={15} y={17.5} text={p.user?.name ?? "Guest"} fontSize={11} fill="#fff" />
                  </Group>
                ) : null,
              )}
            </Group>
          </Layer>
        </Stage>
      )}
      {recording && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC - drag players to record their
          runs
        </div>
      )}
    </div>
  );
}
