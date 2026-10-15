"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { useSession } from "@/components/providers";
import { COLLECTIONS, docToState, LOCAL_ORIGIN, metaMap } from "@/lib/collab/doc";
import { SnapshotSaver, type SaveStatus } from "@/lib/collab/persistence";
import { YjsProvider } from "@/lib/collab/provider";
import { BroadcastChannelTransport, SupabaseTransport, type TransportStatus } from "@/lib/collab/transport";
import { canEdit, type LoadedTactic, type Member, type Profile } from "@/lib/data";
import { useComments } from "@/lib/editor/comments";
import { pause, seek, stopClock } from "@/lib/editor/clock";
import { cancelRecording } from "@/lib/editor/recording";
import { setPresence, setSession, type EditorSession } from "@/lib/editor/session";
import { resetEditorStores, useEditor, usePlayback, type Peer, type PeerState } from "@/lib/editor/store";
import { getSport } from "@/lib/sports";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { RightPanel } from "./RightPanel";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { useShortcuts } from "./useShortcuts";

const Board = dynamic(() => import("@/components/board/Board"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-slate-500">Loading board...</div>,
});

export function thumbnailOf(session: EditorSession | null): string | undefined {
  const stage = session?.stage;
  if (!stage || !stage.width()) return undefined;
  return stage.toDataURL({
    mimeType: "image/jpeg",
    quality: 0.7,
    pixelRatio: Math.min(1, 480 / stage.width()),
  });
}

export function Editor({ tactic, me, members }: { tactic: LoadedTactic; me: Profile; members: Member[] }) {
  const { data } = useSession();
  const readOnly = !canEdit(tactic.role);
  const tacticId = tactic.meta.id;
  const [session, setLocalSession] = useState<EditorSession | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [connection, setConnection] = useState<TransportStatus>("connecting");
  const [saver, setSaver] = useState<SnapshotSaver | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    resetEditorStores();
    const doc = new Y.Doc();
    if (tactic.docState) Y.applyUpdate(doc, tactic.docState, "load");
    const awareness = new Awareness(doc);
    awareness.setLocalState({
      user: { id: me.id, name: me.displayName, color: me.avatarColor },
    } satisfies PeerState);
    const undo = readOnly
      ? null
      : new Y.UndoManager([...COLLECTIONS.map((c) => doc.getMap(c)), metaMap(doc)], {
          trackedOrigins: new Set([LOCAL_ORIGIN]),
          captureTimeout: 400,
        });
    const sport = getSport((metaMap(doc).get("sport") as string) ?? tactic.meta.sport);
    const s: EditorSession = {
      doc,
      awareness,
      undo,
      readOnly,
      sport,
      tacticId,
      userId: me.id,
      members,
      stage: null,
    };
    setSession(s);

    // Mirror the CRDT into the store once per frame.
    let raf = 0;
    const sync = () => {
      raf = 0;
      const st = docToState(doc);
      const layers = Object.values(st.layers).sort((a, b) => a.order - b.order);
      const { activeLayerId, activePhaseId, routeDraft, selectedTokens, selectedAnnotations } =
        useEditor.getState();
      useEditor.setState({
        state: st,
        activeLayerId: activeLayerId && st.layers[activeLayerId] ? activeLayerId : (layers[0]?.id ?? null),
        activePhaseId: activePhaseId && st.phases[activePhaseId] ? activePhaseId : null,
        routeDraft: routeDraft && st.tokens[routeDraft.tokenId] ? routeDraft : null,
        selectedTokens: selectedTokens.filter((id) => st.tokens[id]),
        selectedAnnotations: selectedAnnotations.filter((id) => st.annotations[id]),
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    sync();
    doc.on("update", schedule);

    let peerRaf = 0;
    const syncPeers = () => {
      peerRaf = 0;
      const peers: Peer[] = [];
      awareness.getStates().forEach((st, clientId) => {
        if (clientId !== doc.clientID && (st as PeerState).user)
          peers.push({ ...(st as PeerState), clientId });
      });
      useEditor.setState({ peers });
    };
    const onAwareness = () => {
      if (!peerRaf) peerRaf = requestAnimationFrame(syncPeers);
    };
    awareness.on("change", onAwareness);

    const updateUndo = () =>
      useEditor.setState({
        canUndo: (undo?.undoStack.length ?? 0) > 0,
        canRedo: (undo?.redoStack.length ?? 0) > 0,
      });
    undo?.on("stack-item-added", updateUndo);
    undo?.on("stack-item-popped", updateUndo);

    const transport =
      data.mode === "supabase"
        ? new SupabaseTransport(getBrowserSupabase(), `tactic:${tacticId}`)
        : new BroadcastChannelTransport(`taktik-tactic-${tacticId}`);
    const provider = new YjsProvider(doc, awareness, transport, { readOnly });
    const unsubProvider = provider.subscribe(() => setConnection(provider.status));
    setConnection(provider.status);

    const snap = readOnly
      ? null
      : new SnapshotSaver(
          doc,
          { save: (u, o) => data.saveSnapshot(tacticId, u, o) },
          { thumbnail: () => thumbnailOf(s) },
        );
    const unsubSaver = snap?.subscribe(setSaveStatus);
    setSaver(snap);
    setLocalSession(s);
    (window as unknown as { __taktik?: unknown }).__taktik = { editor: useEditor, playback: usePlayback };

    return () => {
      cancelRecording();
      stopClock();
      pause();
      if (raf) cancelAnimationFrame(raf);
      if (peerRaf) cancelAnimationFrame(peerRaf);
      unsubSaver?.();
      snap?.destroy();
      unsubProvider();
      provider.destroy();
      awareness.off("change", onAwareness);
      awareness.destroy();
      undo?.destroy();
      doc.off("update", schedule);
      doc.destroy();
      setSession(null);
    };
    // Re-initialise only when switching tactics; profile/member changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tacticId, readOnly, data]);

  useEffect(() => {
    if (!session) return;
    session.members = members;
    setPresence({ user: { id: me.id, name: me.displayName, color: me.avatarColor } });
  }, [session, members, me]);

  // Comments: load once and keep fresh through the realtime feed.
  useEffect(() => {
    let alive = true;
    const load = () =>
      data
        .listComments(tacticId)
        .then((comments) => alive && useComments.setState({ comments, loaded: true }))
        .catch(() => undefined);
    void load();
    const unsub = data.subscribeComments(tacticId, load);
    return () => {
      alive = false;
      unsub();
      useComments.setState({ comments: [], loaded: false });
    };
  }, [data, tacticId]);

  // Broadcast selection so teammates can see what each person is working on.
  useEffect(
    () =>
      useEditor.subscribe(
        (s, prev) => s.selectedTokens !== prev.selectedTokens && setPresence({ selection: s.selectedTokens }),
      ),
    [],
  );

  // Presenter mode: share playback; followers mirror it.
  useEffect(() => {
    let lastSent = 0;
    const share = (force: boolean) => {
      if (!useEditor.getState().presenting) return;
      const now = Date.now();
      if (!force && now - lastSent < 500) return;
      lastSent = now;
      const { time, playing, speed } = usePlayback.getState();
      setPresence({ presenting: { time, playing, speed, at: now } });
    };
    const unsubPb = usePlayback.subscribe((s, prev) =>
      share(s.playing !== prev.playing || s.speed !== prev.speed || Math.abs(s.time - prev.time) > 200),
    );
    const unsubEd = useEditor.subscribe((s, prev) => {
      if (s.presenting !== prev.presenting) {
        if (s.presenting) share(true);
        else setPresence({ presenting: null });
      }
      if (s.followClientId == null || s.peers === prev.peers) return;
      const leader = s.peers.find((p) => p.clientId === s.followClientId);
      const ps = leader?.presenting;
      if (!leader || !ps) {
        useEditor.setState({ followClientId: null });
        return;
      }
      const target = ps.playing ? ps.time + (Date.now() - ps.at) * ps.speed : ps.time;
      const pb = usePlayback.getState();
      if (pb.speed !== ps.speed) usePlayback.setState({ speed: ps.speed });
      if (Math.abs(pb.time - target) > 150 || pb.playing !== ps.playing) {
        seek(target);
        usePlayback.setState({ playing: ps.playing });
      }
    });
    return () => {
      unsubPb();
      unsubEd();
    };
  }, []);

  useShortcuts(readOnly, !!session);

  if (!session) return <div className="grid h-dvh place-items-center text-slate-500">Opening tactic...</div>;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        tactic={tactic}
        me={me}
        readOnly={readOnly}
        saveStatus={saveStatus}
        connection={connection}
        saver={saver}
        onTogglePanel={() => setPanelOpen((o) => !o)}
      />
      <div className="flex min-h-0 flex-1">
        <Toolbar readOnly={readOnly} />
        <main className="relative min-w-0 flex-1">
          <Board readOnly={readOnly} />
        </main>
        <RightPanel
          readOnly={readOnly}
          me={me}
          members={members}
          tacticId={tacticId}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
        />
      </div>
      <Timeline readOnly={readOnly} />
    </div>
  );
}
