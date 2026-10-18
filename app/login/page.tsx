"use client";

import { Loader2, Mail } from "lucide-react";
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
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}

function LoadingStatus({ children }: { children: string }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-brand-200">
      <Loader2 className="animate-spin" size={16} aria-hidden />
      {children}
    </p>
  );
}

function LoginForm() {
  const search = useSearchParams();
  const router = useRouter();
  const { me, loading, refresh } = useSession();
  const next = safeNext(search.get("next"));
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"email" | "code" | "google" | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || (!loading && me)) {
      router.replace(next);
      router.refresh();
    }
  }, [loading, me, next, router]);

  useEffect(() => {
    if (!isSupabaseConfigured || loading || !me) return;
    const timer = window.setTimeout(() => {
      if (window.location.pathname === "/login") window.location.assign(next);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loading, me, next]);

  const origin = typeof window !== "undefined" ? window.location.origin : siteUrl();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function magicLink() {
    setBusy("email");
    try {
      const { error } = await getBrowserSupabase().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setSent(true);
      setBusy(null);
    } catch (e) {
      toastError(e);
      setBusy(null);
    }
  }

  async function verifyCode() {
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) return;
    setBusy("code");
    try {
      const { error } = await getBrowserSupabase().auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) throw error;
      await refresh();
      router.replace(next);
      router.refresh();
    } catch (e) {
      toastError(e);
      setBusy(null);
    }
  }

  async function google() {
    setBusy("google");
    const { error } = await getBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      toastError(error);
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-ink-800 bg-ink-900 p-6">
        <Logo />
        <div>
          <h1 className="text-xl font-bold">Sign in to taktiks</h1>
          <p className="mt-1 text-sm text-slate-400">
            No password needed. We will email a 6-digit code.
          </p>
        </div>
        {loading || me ? (
          <LoadingStatus>
            {me
              ? next === "/"
                ? "Signed in. Taking you to the homepage..."
                : "Signed in. Taking you back..."
              : "Checking your session..."}
          </LoadingStatus>
        ) : sent ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode();
            }}
          >
            <p className="text-sm text-slate-300">
              Enter the 6-digit code sent to <b>{email}</b>. The email contains only that code.
            </p>
            <div>
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                disabled={busy !== null}
                className="tracking-[0.4em]"
              />
            </div>
            {busy === "code" && <LoadingStatus>Checking your code...</LoadingStatus>}
            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={busy !== null || code.length !== 6}
              aria-busy={busy === "code"}
            >
              {busy === "code" ? "Signing in..." : "Sign in with code"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-slate-400 hover:text-white disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              Use a different email
            </button>
          </form>
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
                disabled={busy !== null}
              />
            </div>
            {busy === "email" && <LoadingStatus>Sending your sign-in email...</LoadingStatus>}
            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={busy !== null}
              aria-busy={busy === "email"}
            >
              {busy === "email" ? (
                <Loader2 className="animate-spin" size={15} aria-hidden />
              ) : (
                <Mail size={15} />
              )}
              {busy === "email" ? "Sending..." : "Email me a code"}
            </Button>
          </form>
        )}
        {!loading && !me && (
          <>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-ink-700" /> or <span className="h-px flex-1 bg-ink-700" />
            </div>
            {busy === "google" && <LoadingStatus>Opening Google...</LoadingStatus>}
            <Button
              variant="outline"
              className="w-full justify-center"
              disabled={busy !== null}
              aria-busy={busy === "google"}
              onClick={() => void google()}
            >
              {busy === "google" && <Loader2 className="animate-spin" size={15} aria-hidden />}
              {busy === "google" ? "Opening Google..." : "Continue with Google"}
            </Button>
          </>
        )}
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
