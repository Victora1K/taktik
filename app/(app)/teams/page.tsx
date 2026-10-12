"use client";

import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track, useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";
import { ROLE_LABELS, type Team } from "@/lib/data";

export default function TeamsPage() {
  const { data, me, loading } = useSession();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (loading || !me) return;
    data
      .listTeams()
      .then((t) => {
        if (data.mode === "local" && t.length === 1) router.replace(`/teams/${t[0].id}`);
        else setTeams(t);
      })
      .catch(toastError);
  }, [data, me, loading, router]);

  async function create() {
    if (!name.trim()) return;
    try {
      const team = await data.createTeam(name.trim());
      track("team_created");
      router.push(`/teams/${team.id}`);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Your teams</h1>
        <p className="mt-1 text-sm text-slate-400">
          Each team has its own tactics library, members and discussions.
        </p>
      </div>

      <ul className="space-y-2">
        {teams === null && <li className="text-sm text-slate-500">Loading...</li>}
        {teams?.length === 0 && (
          <li className="rounded-lg border border-dashed border-ink-700 p-6 text-center text-sm text-slate-400">
            You are not on a team yet. Create one below, or open an invite link from a teammate.
          </li>
        )}
        {teams?.map((t) => (
          <li key={t.id}>
            <Link
              href={`/teams/${t.id}`}
              className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900 p-4 hover:border-brand-500/50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
                <Users size={18} />
              </span>
              <span className="flex-1 font-medium">{t.name}</span>
              <span className="text-xs text-slate-500">{ROLE_LABELS[t.role]}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
        <h2 className="mb-2 text-sm font-semibold">Create a team</h2>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Riverside U14"
            maxLength={80}
            onKeyDown={(e) => e.key === "Enter" && void create()}
          />
          <Button variant="primary" onClick={() => void create()} disabled={!name.trim()}>
            <Plus size={15} /> Create
          </Button>
        </div>
      </div>
    </div>
  );
}
