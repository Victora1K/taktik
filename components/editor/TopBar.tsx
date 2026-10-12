"use client";

import {
  ChevronLeft,
  Cloud,
  CloudOff,
  Download,
  FileJson,
  Film,
  History,
  Image as ImageIcon,
  Loader2,
  PanelRight,
  Presentation,
  Share2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { track } from "@/components/providers";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { toast, toastError } from "@/components/ui/toast";
import { setMeta } from "@/lib/collab/actions";
import { applyState } from "@/lib/collab/doc";
import type { SaveStatus, SnapshotSaver } from "@/lib/collab/persistence";
import type { TransportStatus } from "@/lib/collab/transport";
import type { LoadedTactic, Profile } from "@/lib/data";
import { exportJson, exportPng, exportVideo, parseTacticJson, videoSupport } from "@/lib/editor/export";
import { getSession } from "@/lib/editor/session";
import { useEditor } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { ShareDialog } from "./ShareDialog";
import { VersionsDialog } from "./VersionsDialog";

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving...",
  error: "Save failed, retrying",
};

export function TopBar({
  tactic,
  me,
  readOnly,
  saveStatus,
  connection,
  saver,
  onTogglePanel,
}: {
  tactic: LoadedTactic;
  me: Profile;
  readOnly: boolean;
  saveStatus: SaveStatus;
  connection: TransportStatus;
  saver: SnapshotSaver | null;
  onTogglePanel: () => void;
}) {
  const { title, sport, peers, presenting, followClientId } = useEditor(
    useShallow((s) => ({
      title: s.state.meta.title,
      sport: s.state.meta.sport,
      peers: s.peers,
      presenting: s.presenting,
      followClientId: s.followClientId,
    })),
  );
  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const session = getSession()!;

  async function doVideo() {
    if (!session.stage) return;
    setExporting(true);
    try {
      await exportVideo(session.stage, title);
      track("export_video");
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  }

  async function doImport(file: File) {
    try {
      const state = parseTacticJson(await file.text());
      if (!window.confirm("Replace this tactic's content with the imported file? You can undo this.")) return;
      applyState(session.doc, { ...state, meta: { ...state.meta, sport: session.sport.id } });
      toast("Imported", "success");
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900 px-2">
      <Link
        href={`/teams/${tactic.meta.teamId}`}
        className="flex items-center rounded-md p-1.5 text-slate-400 hover:bg-ink-800 hover:text-white"
        aria-label="Back to team library"
      >
        <ChevronLeft size={18} />
      </Link>
      <input
        value={title}
        onChange={(e) => setMeta(session.doc, { title: e.target.value.slice(0, 120) })}
        disabled={readOnly}
        className="h-8 min-w-0 max-w-xs flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold hover:border-ink-700 focus:border-brand-500 focus:outline-none"
        aria-label="Tactic title"
      />
      <span className="hidden rounded bg-ink-800 px-2 py-0.5 text-xs capitalize text-slate-300 sm:inline">
        {sport}
      </span>
      {readOnly && (
        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">View only</span>
      )}

      <span
        className="hidden items-center gap-1 text-xs text-slate-500 md:flex"
        title={`Live sync: ${connection}`}
        data-testid="save-status"
      >
        {connection === "connected" ? (
          <Cloud size={14} className="text-brand-400" />
        ) : (
          <CloudOff size={14} className="text-amber-400" />
        )}
        {!readOnly && (
          <span className={cn(saveStatus === "error" && "text-red-400")}>{SAVE_LABEL[saveStatus]}</span>
        )}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <div className="mr-1 flex -space-x-1.5" aria-label="People here">
          <Avatar name={`${me.displayName} (you)`} color={me.avatarColor} size={26} ring />
          {peers.slice(0, 5).map((p) => (
            <button
              key={p.clientId}
              onClick={() =>
                p.presenting &&
                useEditor.setState({ followClientId: followClientId === p.clientId ? null : p.clientId })
              }
              title={
                p.presenting
                  ? `${p.user?.name} is presenting - click to ${followClientId === p.clientId ? "stop following" : "follow"}`
                  : p.user?.name
              }
              className={cn(
                "rounded-full",
                p.presenting && "ring-2 ring-amber-400",
                followClientId === p.clientId && "ring-brand-400",
              )}
            >
              <Avatar name={p.user?.name ?? "Guest"} color={p.user?.color ?? "#64748b"} size={26} ring />
            </button>
          ))}
          {peers.length > 5 && (
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ink-700 text-[10px]">
              +{peers.length - 5}
            </span>
          )}
        </div>
        {peers.some((p) => p.presenting) && followClientId == null && (
          <Button
            size="sm"
            variant="outline"
            className="hidden sm:inline-flex"
            onClick={() => useEditor.setState({ followClientId: peers.find((p) => p.presenting)!.clientId })}
          >
            Follow presenter
          </Button>
        )}
        {followClientId != null && (
          <Button size="sm" variant="outline" onClick={() => useEditor.setState({ followClientId: null })}>
            Stop following
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          active={presenting}
          onClick={() => useEditor.setState({ presenting: !presenting, followClientId: null })}
          title="Present: teammates can follow your playback"
          className="hidden sm:inline-flex"
        >
          <Presentation size={15} />{" "}
          <span className="hidden md:inline">{presenting ? "Presenting" : "Present"}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setVersionsOpen(true)} title="Versions">
          <History size={15} /> <span className="hidden md:inline">Versions</span>
        </Button>
        <Menu
          trigger={(p) => (
            <Button size="sm" variant="ghost" {...p} title="Export" disabled={exporting}>
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              <span className="hidden md:inline">{exporting ? "Recording..." : "Export"}</span>
            </Button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  close();
                  if (session.stage) exportPng(session.stage, title);
                  track("export_png");
                }}
              >
                <ImageIcon size={14} /> Snapshot (PNG)
              </MenuItem>
              <MenuItem
                disabled={!videoSupport()}
                onClick={() => {
                  close();
                  void doVideo();
                }}
              >
                <Film size={14} /> Animation video ({videoSupport()?.startsWith("video/mp4") ? "MP4" : "WebM"}
                )
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  exportJson(useEditor.getState().state);
                  track("export_json");
                }}
              >
                <FileJson size={14} /> Tactic file (JSON)
              </MenuItem>
              {!readOnly && (
                <MenuItem
                  onClick={() => {
                    close();
                    fileRef.current?.click();
                  }}
                >
                  <Upload size={14} /> Import tactic file
                </MenuItem>
              )}
            </>
          )}
        </Menu>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="primary" onClick={() => setShareOpen(true)}>
          <Share2 size={15} /> <span className="hidden sm:inline">Share</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          onClick={onTogglePanel}
          aria-label="Toggle side panel"
        >
          <PanelRight size={17} />
        </Button>
      </div>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} tactic={tactic} readOnly={readOnly} />
      <VersionsDialog
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        tacticId={tactic.meta.id}
        readOnly={readOnly}
        saver={saver}
      />
    </header>
  );
}
