"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { TeamNav } from "@/components/app/TeamNav";
import { useTeam } from "@/components/app/useTeam";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { isAdmin } from "@/lib/data";

export default function TeamSettingsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const { data } = useSession();
  const router = useRouter();
  const { team, setTeam } = useTeam(teamId);
  const [name, setName] = useState("");

  useEffect(() => {
    if (team) setName(team.name);
  }, [team]);

  if (team === undefined) return <p className="text-sm text-slate-500">Loading...</p>;
  if (team === null) return <p className="text-sm text-slate-400">Team not found.</p>;
  const admin = isAdmin(team.role);

  return (
    <div>
      <TeamNav team={team} />
      <div className="max-w-lg space-y-8">
        <section className="space-y-2">
          <Label htmlFor="team-name">Team name</Label>
          <div className="flex gap-2">
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={!admin}
            />
            <Button
              variant="primary"
              disabled={!admin || !name.trim() || name === team.name}
              onClick={() =>
                data
                  .updateTeam(teamId, { name: name.trim() })
                  .then(() => {
                    setTeam({ ...team, name: name.trim() });
                    toast("Saved", "success");
                  })
                  .catch(toastError)
              }
            >
              Save
            </Button>
          </div>
        </section>
        {team.role === "owner" && (
          <section className="rounded-xl border border-red-500/30 p-4">
            <h2 className="font-semibold text-red-300">Delete team</h2>
            <p className="mt-1 text-sm text-slate-400">
              Deletes every tactic, version and comment in this team. This cannot be undone.
            </p>
            <Button
              variant="danger"
              className="mt-3"
              onClick={() => {
                if (window.prompt(`Type the team name (${team.name}) to confirm`) !== team.name) return;
                data
                  .deleteTeam(teamId)
                  .then(() => router.push("/teams"))
                  .catch(toastError);
              }}
            >
              Delete team
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
