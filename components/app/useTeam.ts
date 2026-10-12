"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import type { Team } from "@/lib/data";

export function useTeam(teamId: string) {
  const { data, me, loading } = useSession();
  const [team, setTeam] = useState<Team | null | undefined>(undefined);

  useEffect(() => {
    if (loading || !me) return;
    data
      .getTeam(teamId)
      .then(setTeam)
      .catch(() => setTeam(null));
  }, [data, me, loading, teamId]);

  return { team, setTeam };
}
