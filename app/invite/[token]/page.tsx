"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";
import { ROLE_LABELS, type InviteInfo } from "@/lib/data";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, me, loading } = useSession();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!me) return;
    data
      .getInviteInfo(token)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [data, token, me, loading]);

  async function accept() {
    setBusy(true);
    try {
      const teamId = await data.acceptInvite(token);
      router.push(`/teams/${teamId}`);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-ink-800 bg-ink-900 p-6 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : !me || data.mode === "local" ? (
          data.mode === "local" ? (
            <p className="text-sm text-slate-400">Invites need the hosted version of Taktik.</p>
          ) : (
            <>
              <p className="text-sm text-slate-300">Sign in to accept your team invite.</p>
              <Link
                href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                className="inline-block rounded-md bg-brand-500 px-4 py-2 font-semibold text-ink-950"
              >
                Sign in
              </Link>
            </>
          )
        ) : info === undefined ? (
          <p className="text-sm text-slate-400">Checking invite...</p>
        ) : info === null || info.expired ? (
          <p className="text-sm text-slate-300">
            This invite link is invalid, expired, or has already been used. Ask your coach for a new one.
          </p>
        ) : (
          <>
            <p className="text-slate-300">
              You have been invited to join <b className="text-white">{info.teamName}</b> as{" "}
              <b>{ROLE_LABELS[info.role]}</b>.
            </p>
            <Button
              variant="primary"
              className="w-full justify-center"
              onClick={() => void accept()}
              disabled={busy}
            >
              {busy ? "Joining..." : "Join team"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
