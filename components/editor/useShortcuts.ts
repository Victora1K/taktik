"use client";

import { useEffect } from "react";
import { deleteAnnotations, deleteTokens, duplicateTokens, translateTokens } from "@/lib/collab/actions";
import { step, togglePlay } from "@/lib/editor/clock";
import { cancelRoute, finishRoute } from "@/lib/editor/phase-routing";
import { cancelRecording, isRecording, stopRecording, toggleRecording } from "@/lib/editor/recording";
import { getSession } from "@/lib/editor/session";
import { clearSelection, selectTokens, useEditor, usePlayback, type Tool } from "@/lib/editor/store";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "pan",
  a: "arrow",
  l: "line",
  z: "zone",
  t: "text",
  f: "freehand",
  c: "pin",
  g: "route",
};

export function undo() {
  getSession()?.undo?.undo();
}

export function redo() {
  getSession()?.undo?.redo();
}

export function useShortcuts(readOnly: boolean, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      const session = getSession();
      if (!session) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const ed = useEditor.getState();

      if (key === " ") {
        // Space activates focused controls for keyboard users.
        if (el?.closest("button, a, [role=tab], [role=menuitem], [role=checkbox], summary")) return;
        e.preventDefault();
        if (isRecording()) stopRecording();
        else togglePlay();
        return;
      }
      if (key === "escape") {
        if (isRecording()) cancelRecording();
        if (ed.routeDraft) {
          cancelRoute();
          return;
        }
        clearSelection();
        useEditor.setState({ tool: "select", pendingPin: null });
        return;
      }
      if (key === "enter" && ed.routeDraft) {
        e.preventDefault();
        finishRoute();
        return;
      }
      if (key === "," || key === ".") {
        step(key === "," ? -1 : 1);
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        selectTokens(Object.keys(ed.state.tokens));
        return;
      }
      if (readOnly) {
        if (!mod && key === "c") useEditor.setState({ tool: "pin" });
        if (!mod && (key === "v" || key === "h")) useEditor.setState({ tool: TOOL_KEYS[key] });
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        if (ed.selectedTokens.length) selectTokens(duplicateTokens(session.doc, ed.selectedTokens));
        return;
      }
      if (key === "delete" || key === "backspace") {
        if (ed.selectedTokens.length) deleteTokens(session.doc, ed.selectedTokens);
        if (ed.selectedAnnotations.length) deleteAnnotations(session.doc, ed.selectedAnnotations);
        clearSelection();
        return;
      }
      if (
        key.startsWith("arrow") &&
        ed.selectedTokens.length &&
        !ed.routeDraft &&
        !usePlayback.getState().recording
      ) {
        e.preventDefault();
        const d = e.shiftKey ? 2 : 0.5;
        const dx = key === "arrowleft" ? -d : key === "arrowright" ? d : 0;
        const dy = key === "arrowup" ? -d : key === "arrowdown" ? d : 0;
        translateTokens(session.doc, Object.fromEntries(ed.selectedTokens.map((id) => [id, { dx, dy }])));
        return;
      }
      if (!mod && key === "r") {
        toggleRecording();
        return;
      }
      if (!mod && TOOL_KEYS[key]) useEditor.setState({ tool: TOOL_KEYS[key] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, enabled]);
}
