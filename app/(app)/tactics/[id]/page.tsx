"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { Editor } from "@/components/editor/Editor";
import { useSession } from "@/components/providers";
import type { LoadedTactic, Member } from "@/lib/data";
import { useEditor } from "@/lib/editor/store";

function TacticLoader({ id }: { id: string }) {
  const { data, me, loading } = useSession();
  const search = useSearchParams();
  const [tactic, setTactic] = useState<LoadedTactic | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !me) return;
    let alive = true;
    data
      .getTactic(id)
      .then(async (t) => {
        if (!alive) return;
        setTactic(t);
        if (t) setMembers(await data.listMembers(t.meta.teamId).catch(() => []));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [data, me, loading, id]);

  const commentId = search.get("comment");
  useEffect(() => {
    if (tactic && commentId) useEditor.setState({ focusedCommentId: commentId, rightTab: "comments" });
  }, [tactic, commentId]);

  useEffect(() => {
    if (tactic) document.title = `${tactic.meta.title} | Taktik`;
  }, [tactic]);

  if (error) return <Centered>Could not open this tactic: {error}</Centered>;
  if (!loading && !me) return <Centered>Please sign in to open this tactic.</Centered>;
  if (tactic === undefined || !me) return <Centered>Loading tactic...</Centered>;
  if (tactic === null)
    return (
      <Centered>
        This tactic does not exist or you do not have access.{" "}
        <Link className="text-brand-400 underline" href="/teams">
          Back to your teams
        </Link>
      </Centered>
    );
  return <Editor tactic={tactic} me={me} members={members} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-dvh place-items-center p-6 text-center text-sm text-slate-400">{children}</div>
  );
}

export default function TacticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Centered>Loading tactic...</Centered>}>
      <TacticLoader id={id} />
    </Suspense>
  );
}
