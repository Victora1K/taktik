"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track, useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";
import { encodeState } from "@/lib/collab/doc";
import { createInitialState } from "@/lib/engine/factory";
import { formationsFor, getSport, SPORT_LIST, type SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";
import { SportPreview } from "./SportPreview";

export function NewTacticDialog({
  open,
  onClose,
  teamId,
  folders,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  folders: string[];
}) {
  const { data } = useSession();
  const router = useRouter();
  const [sportId, setSportId] = useState<SportId>("soccer");
  const sport = getSport(sportId);
  const [title, setTitle] = useState("");
  const [home, setHome] = useState(sport.defaultPerSide);
  const [away, setAway] = useState(sport.defaultPerSide);
  const [homeFormation, setHomeFormation] = useState(sport.formations[0].id);
  const [awayFormation, setAwayFormation] = useState(sport.formations[0].id);
  const [ball, setBall] = useState(true);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getSport(sportId);
    setHome(s.defaultPerSide);
    setAway(s.defaultPerSide);
    const initial = formationsFor(s, s.defaultPerSide)[0]?.id ?? s.formations[0].id;
    setHomeFormation(initial);
    setAwayFormation(initial);
  }, [sportId]);

  async function create() {
    setBusy(true);
    try {
      const state = createInitialState({
        sport: sportId,
        title,
        homeCount: home,
        awayCount: away,
        formationId: homeShape || undefined,
        awayFormationId: awayShape || undefined,
        includeBall: ball,
      });
      const meta = await data.createTactic({
        teamId,
        sport: sportId,
        title: state.meta.title,
        docState: encodeState(state),
        folder: folder.trim() || null,
      });
      track("tactic_created", { sport: sportId, home, away });
      router.push(`/tactics/${meta.id}`);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  const max = sport.maxPerSide;
  const homeShapes = formationsFor(sport, home);
  const awayShapes = formationsFor(sport, away);
  const homeShape = homeShapes.some((item) => item.id === homeFormation)
    ? homeFormation
    : (homeShapes[0]?.id ?? "");
  const awayShape = awayShapes.some((item) => item.id === awayFormation)
    ? awayFormation
    : (awayShapes[0]?.id ?? "");

  return (
    <Dialog open={open} onClose={onClose} title="New tactic" className="w-[min(94vw,40rem)]">
      <div className="space-y-5">
        <div>
          <Label>Sport</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
            {SPORT_LIST.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={sportId === s.id}
                onClick={() => setSportId(s.id)}
                className={cn(
                  "overflow-hidden rounded-lg border-2 text-left transition",
                  sportId === s.id ? "border-brand-400" : "border-ink-700 opacity-75 hover:opacity-100",
                )}
                data-testid={`sport-${s.id}`}
              >
                <SportPreview sport={s} className="aspect-[16/10] w-full" />
                <div className="px-2 py-1.5 text-sm font-medium">{s.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="nt-title">Title</Label>
            <Input
              id="nt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${
                {
                  soccer: "High press from goal kick",
                  basketball: "Horns flare",
                  volleyball: "Serve receive rotation 1",
                  football: "Mesh concept vs cover 2",
                  baseball: "Hit and run",
                  tennis: "Serve plus one",
                }[sportId]
              }`}
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="nt-home">
              Your players: <b className="text-blue-400">{home}</b>
            </Label>
            <input
              id="nt-home"
              type="range"
              min={0}
              max={max}
              value={home}
              onChange={(e) => {
                const count = Number(e.target.value);
                setHome(count);
                const next = formationsFor(sport, count);
                if (!next.some((item) => item.id === homeFormation)) setHomeFormation(next[0]?.id ?? "");
              }}
              className="w-full"
            />
          </div>
          <div>
            <Label htmlFor="nt-away">
              Opponents: <b className="text-red-400">{away}</b>
            </Label>
            <input
              id="nt-away"
              type="range"
              min={0}
              max={max}
              value={away}
              onChange={(e) => {
                const count = Number(e.target.value);
                setAway(count);
                const next = formationsFor(sport, count);
                if (!next.some((item) => item.id === awayFormation)) setAwayFormation(next[0]?.id ?? "");
              }}
              className="w-full"
            />
          </div>
          <div>
            <Label htmlFor="nt-home-formation">Your shape</Label>
            <Select
              id="nt-home-formation"
              value={homeShape}
              onChange={(e) => setHomeFormation(e.target.value)}
              disabled={!homeShapes.length}
            >
              {homeShapes.length ? (
                homeShapes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option value="">Even spread</option>
              )}
            </Select>
            {!homeShapes.length && (
              <p className="mt-1 text-xs text-slate-500">
                No preset for this count; players are spread evenly.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="nt-away-formation">Opponent shape</Label>
            <Select
              id="nt-away-formation"
              value={awayShape}
              onChange={(e) => setAwayFormation(e.target.value)}
              disabled={!awayShapes.length}
            >
              {awayShapes.length ? (
                awayShapes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option value="">Even spread</option>
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="nt-folder">Folder (optional)</Label>
            <Input
              id="nt-folder"
              list="nt-folders"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g. Set pieces"
              maxLength={60}
            />
            <datalist id="nt-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ball} onChange={(e) => setBall(e.target.checked)} /> Include a
            ball
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy} data-testid="create-tactic">
            {busy ? "Creating..." : "Create and open"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
