"use client";

import { RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { applyState, docToState } from "@/lib/collab/doc";
import type { SnapshotSaver } from "@/lib/collab/persistence";
import type { TacticVersion } from "@/lib/data";
import { getSession } from "@/lib/editor/session";
import { timeAgo } from "@/lib/utils";

export function VersionsDialog({
  open,
  onClose,
  tacticId,
  readOnly,
  saver,
}: {
  open: boolean;
  onClose: () => void;
  tacticId: string;
  readOnly: boolean;
  saver: SnapshotSaver | null;
}) {
  const { data } = useSession();
  const [versions, setVersions] = useState<TacticVersion[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => data.listVersions(tacticId).then(setVersions).catch(toastError),
    [data, tacticId],
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function save() {
    const session = getSession();
    if (!session) return;
    setBusy(true);
    try {
      await data.createVersion(
        tacticId,
        name.trim() || `Version ${versions.length + 1}`,
        docToState(session.doc),
      );
      setName("");
      await load();
      toast("Version saved", "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function restore(v: TacticVersion) {
    const session = getSession();
    if (!session || !window.confirm(`Restore "${v.name}"? The current state is saved as a version first.`))
      return;
    setBusy(true);
    try {
      await data.createVersion(tacticId, `Before restoring "${v.name}"`, docToState(session.doc));
      applyState(session.doc, { ...v.state, meta: { ...v.state.meta, sport: session.sport.id } });
      await saver?.flush({ forceThumbnail: true });
      await load();
      toast(`Restored "${v.name}"`, "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Versions">
      {!readOnly && (
        <div className="mb-4 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this version, e.g. Before halftime"
            maxLength={120}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            <Save size={14} /> Save
          </Button>
        </div>
      )}
      <ul className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto">
        {versions.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-500">No saved versions yet.</li>
        )}
        {versions.map((v) => (
          <li key={v.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-ink-800">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{v.name}</div>
              <div className="text-xs text-slate-500">
                {v.authorName} - {timeAgo(v.createdAt)} - {Object.keys(v.state.tokens ?? {}).length} players,{" "}
                {Object.keys(v.state.tracks ?? {}).length} runs
              </div>
            </div>
            {!readOnly && (
              <>
                <Button size="sm" variant="outline" onClick={() => void restore(v)} disabled={busy}>
                  <RotateCcw size={13} /> Restore
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete version"
                  onClick={() =>
                    window.confirm("Delete this version?") &&
                    data.deleteVersion(v.id).then(load).catch(toastError)
                  }
                >
                  <Trash2 size={13} />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
