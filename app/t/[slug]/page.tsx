"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { Player } from "@/components/editor/Player";
import { useSession } from "@/components/providers";
import type { PublicTactic } from "@/lib/data";

function PublicTacticView({ slug }: { slug: string }) {
  const { data } = useSession();
  const embed = useSearchParams().get("embed") === "1";
  const [tactic, setTactic] = useState<PublicTactic | null | undefined>(undefined);

  useEffect(() => {
    data
      .getPublicTactic(slug)
      .then(setTactic)
      .catch(() => setTactic(null));
  }, [data, slug]);

  useEffect(() => {
    if (tactic) document.title = `${tactic.title} | Taktik`;
  }, [tactic]);

  if (tactic === undefined)
    return <div className="grid h-dvh place-items-center text-sm text-slate-500">Loading...</div>;
  if (tactic === null)
    return (
      <div className="grid h-dvh place-items-center text-sm text-slate-400">
        This link is no longer shared, or it never existed.
      </div>
    );
  return <Player tactic={tactic} embed={embed} />;
}

export default function PublicTacticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <Suspense>
      <PublicTacticView slug={slug} />
    </Suspense>
  );
}
