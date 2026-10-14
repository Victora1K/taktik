"use client";

import { use } from "react";
import { TeamChat } from "@/components/app/TeamChat";
import { TeamNav } from "@/components/app/TeamNav";
import { useTeam } from "@/components/app/useTeam";

export default function TeamChatPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const { team } = useTeam(teamId);

  if (team === undefined) return <p className="text-sm text-slate-500">Loading...</p>;
  if (team === null)
    return <p className="text-sm text-slate-400">Team not found, or you are not a member.</p>;

  return (
    <div className="mx-auto flex h-[calc(100dvh-6.5rem)] min-h-[28rem] max-w-3xl flex-col">
      <TeamNav team={team} />
      <TeamChat teamId={teamId} role={team.role} />
    </div>
  );
}
