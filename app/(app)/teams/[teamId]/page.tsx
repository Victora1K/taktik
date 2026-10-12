"use client";

import { Copy, Folder, MoreVertical, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { NewTacticDialog } from "@/components/app/NewTacticDialog";
import { SportPreview } from "@/components/app/SportPreview";
import { TeamNav } from "@/components/app/TeamNav";
import { useTeam } from "@/components/app/useTeam";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { toastError } from "@/components/ui/toast";
import { canEdit, type TacticMeta } from "@/lib/data";
import { getSport, SPORT_LIST, type SportId } from "@/lib/sports";
import { cn, timeAgo } from "@/lib/utils";

export default function TeamLibraryPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const { data } = useSession();
  const { team } = useTeam(teamId);
  const [tactics, setTactics] = useState<TacticMeta[] | null>(null);
  const [sport, setSport] = useState<SportId | "all">("all");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(() => data.listTactics(teamId).then(setTactics).catch(toastError), [data, teamId]);
  useEffect(() => {
    if (team) void load();
  }, [team, load]);

  const folders = useMemo(
    () => [...new Set((tactics ?? []).map((t) => t.folder).filter(Boolean) as string[])].sort(),
    [tactics],
  );
  const tags = useMemo(() => [...new Set((tactics ?? []).flatMap((t) => t.tags))].sort(), [tactics]);
  const filtered = (tactics ?? []).filter(
    (t) =>
      (sport === "all" || t.sport === sport) &&
      (folder === "all" || (folder === "" ? !t.folder : t.folder === folder)) &&
      (!tag || t.tags.includes(tag)) &&
      (!query ||
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.tags.some((x) => x.toLowerCase().includes(query.toLowerCase()))),
  );

  if (team === undefined) return <p className="text-sm text-slate-500">Loading...</p>;
  if (team === null)
    return <p className="text-sm text-slate-400">Team not found, or you are not a member.</p>;
  const editable = canEdit(team.role);

  async function update(t: TacticMeta, patch: Partial<TacticMeta>) {
    try {
      await data.updateTactic(t.id, patch);
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  async function duplicate(t: TacticMeta) {
    try {
      const full = await data.getTactic(t.id);
      if (!full?.docState) return;
      await data.createTactic({
        teamId,
        sport: t.sport,
        title: `Copy of ${t.title}`.slice(0, 120),
        docState: full.docState,
        folder: t.folder,
      });
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div>
      <TeamNav team={team} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
          {(["all", ...SPORT_LIST.map((s) => s.id)] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={cn(
                "rounded-md px-3 py-1 text-sm capitalize",
                sport === s ? "bg-ink-700 text-white" : "text-slate-400 hover:text-white",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative w-56">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tactics or tags"
            className="pl-8"
            aria-label="Search"
          />
        </div>
        {folders.length > 0 && (
          <Select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="w-44"
            aria-label="Folder"
          >
            <option value="all">All folders</option>
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        )}
        {editable && (
          <Button
            variant="primary"
            className="ml-auto"
            onClick={() => setNewOpen(true)}
            data-testid="new-tactic"
          >
            <Plus size={15} /> New tactic
          </Button>
        )}
      </div>
      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                tag === t
                  ? "border-brand-400 bg-brand-500/15 text-brand-400"
                  : "border-ink-700 text-slate-400",
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {tactics === null ? (
        <p className="text-sm text-slate-500">Loading tactics...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-700 p-12 text-center">
          <p className="text-slate-300">
            {tactics.length ? "No tactics match these filters." : "No tactics yet."}
          </p>
          {editable && !tactics.length && (
            <Button variant="primary" className="mt-4" onClick={() => setNewOpen(true)}>
              <Plus size={15} /> Draw your first play
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="group relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900 hover:border-brand-500/50"
            >
              <Link href={`/tactics/${t.id}`} className="block" data-testid="tactic-card">
                {t.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.thumbnailUrl} alt="" className="aspect-[16/10] w-full object-cover" />
                ) : (
                  <SportPreview sport={getSport(t.sport)} className="aspect-[16/10] w-full" />
                )}
                <div className="p-3">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="capitalize">{t.sport}</span>
                    {t.folder && (
                      <span className="inline-flex items-center gap-1">
                        <Folder size={11} /> {t.folder}
                      </span>
                    )}
                    <span className="ml-auto">{timeAgo(t.updatedAt)}</span>
                  </div>
                  {t.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.tags.map((x) => (
                        <span key={x} className="rounded bg-ink-800 px-1.5 text-[11px] text-slate-400">
                          #{x}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
              {editable && (
                <div className="absolute right-2 top-2">
                  <Menu
                    trigger={(p) => (
                      <button
                        {...p}
                        className="rounded-md bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 aria-expanded:opacity-100"
                        aria-label="Tactic actions"
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem
                          onClick={() => {
                            close();
                            const title = window.prompt("Rename tactic", t.title);
                            if (title?.trim()) void update(t, { title: title.trim() });
                          }}
                        >
                          <Pencil size={14} /> Rename
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            close();
                            const f = window.prompt("Move to folder (leave empty for none)", t.folder ?? "");
                            if (f !== null) void update(t, { folder: f.trim() || null });
                          }}
                        >
                          <Folder size={14} /> Move to folder
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            close();
                            const v = window.prompt("Tags, separated by commas", t.tags.join(", "));
                            if (v !== null)
                              void update(t, {
                                tags: [
                                  ...new Set(
                                    v
                                      .split(",")
                                      .map((x) => x.trim().toLowerCase())
                                      .filter(Boolean),
                                  ),
                                ].slice(0, 10),
                              });
                          }}
                        >
                          <Tag size={14} /> Edit tags
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            close();
                            void duplicate(t);
                          }}
                        >
                          <Copy size={14} /> Duplicate
                        </MenuItem>
                        <MenuItem
                          danger
                          onClick={() => {
                            close();
                            if (window.confirm(`Delete "${t.title}"? This cannot be undone.`))
                              void data.deleteTactic(t.id).then(load).catch(toastError);
                          }}
                        >
                          <Trash2 size={14} /> Delete
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <NewTacticDialog open={newOpen} onClose={() => setNewOpen(false)} teamId={teamId} folders={folders} />
    </div>
  );
}
