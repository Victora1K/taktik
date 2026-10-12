"use client";

import { Copy, Link2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { track, useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import type { LoadedTactic, TacticMeta } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { randomSlug } from "@/lib/utils";

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard", "success"));
}

export function ShareDialog({
  open,
  onClose,
  tactic,
  readOnly,
}: {
  open: boolean;
  onClose: () => void;
  tactic: LoadedTactic;
  readOnly: boolean;
}) {
  const { data } = useSession();
  const [meta, setMeta] = useState<TacticMeta>(tactic.meta);
  const [busy, setBusy] = useState(false);
  const publicUrl = meta.shareSlug ? `${siteUrl()}/t/${meta.shareSlug}` : "";
  const editorUrl = `${siteUrl()}/tactics/${meta.id}`;
  const embed = publicUrl
    ? `<iframe src="${publicUrl}?embed=1" width="800" height="560" style="border:0;border-radius:12px" allowfullscreen></iframe>`
    : "";

  async function setLink(enabled: boolean) {
    setBusy(true);
    try {
      const next = await data.updateTactic(meta.id, {
        visibility: enabled ? "link" : "team",
        shareSlug: meta.shareSlug ?? (enabled ? randomSlug() : null),
      });
      setMeta(next);
      track("share_link_toggled", { enabled });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Share tactic">
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users size={15} /> Your team
          </h3>
          <p className="text-xs text-slate-400">
            Everyone on the team can open, edit (players and coaches) and comment on this tactic.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={editorUrl} aria-label="Team link" onFocus={(e) => e.target.select()} />
            <Button onClick={() => copy(editorUrl)} aria-label="Copy team link">
              <Copy size={14} />
            </Button>
          </div>
          <Link href={`/teams/${meta.teamId}/members`} className="text-xs text-brand-400 hover:underline">
            Invite teammates to the team
          </Link>
        </section>

        <section className="space-y-2 border-t border-ink-800 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Link2 size={15} /> Public view-only link
            </h3>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={meta.visibility === "link"}
                disabled={readOnly || busy}
                onChange={(e) => void setLink(e.target.checked)}
                data-testid="public-link-toggle"
              />
              {meta.visibility === "link" ? "On" : "Off"}
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Anyone with the link can watch the animation, without an account. They cannot edit or comment.
          </p>
          {meta.visibility === "link" && publicUrl && (
            <>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={publicUrl}
                  aria-label="Public link"
                  onFocus={(e) => e.target.select()}
                  data-testid="public-link"
                />
                <Button onClick={() => copy(publicUrl)} aria-label="Copy public link">
                  <Copy size={14} />
                </Button>
              </div>
              <Label>Embed code</Label>
              <div className="flex gap-2">
                <Input readOnly value={embed} aria-label="Embed code" onFocus={(e) => e.target.select()} />
                <Button onClick={() => copy(embed)} aria-label="Copy embed code">
                  <Copy size={14} />
                </Button>
              </div>
              {data.mode === "local" && (
                <p className="text-xs text-amber-300">
                  Local mode: public links only work in this browser. Connect Supabase to share them.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
}
