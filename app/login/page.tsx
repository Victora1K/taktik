"use client";

import { Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/client";

function safeNext(next: string | null) {
  return next && /^\/(?![/\\])/.test(next) ? next : "/teams";
}

function LoginForm() {
  const search = useSearchParams();
  const router = useRouter();
  const { me, loading } = useSession();
  const next = safeNext(search.get("next"));
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || (!loading && me)) router.replace(next);
  }, [loading, me, next, router]);

  const redirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;

  async function magicLink() {
    setBusy(true);
    try {
      const { error } = await getBrowserSupabase().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const { error } = await getBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) toastError(error);
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-ink-800 bg-ink-900 p-6">
        <Logo />
        <div>
          <h1 className="text-xl font-bold">Sign in to taktiks</h1>
          <p className="mt-1 text-sm text-slate-400">No password needed. We will email you a sign-in link.</p>
        </div>
        {sent ? (
          <div className="rounded-lg bg-brand-500/10 p-4 text-sm text-brand-100">
            Check <b>{email}</b> for a sign-in link. You can close this tab.
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void magicLink();
            }}
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@club.com"
              />
            </div>
            <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy}>
              <Mail size={15} /> {busy ? "Sending..." : "Email me a link"}
            </Button>
          </form>
        )}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-ink-700" /> or <span className="h-px flex-1 bg-ink-700" />
        </div>
        <Button variant="outline" className="w-full justify-center" onClick={() => void google()}>
          Continue with Google
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
