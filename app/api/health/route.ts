import { NextResponse } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Uptime check target. Reports whether the database API is reachable when Supabase is configured. */
export async function GET() {
  let database: "ok" | "down" | "not-configured" = "not-configured";
  if (isSupabaseConfigured) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(3000),
      });
      database = res.ok ? "ok" : "down";
    } catch {
      database = "down";
    }
  }
  const ok = database !== "down";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      database,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    },
    { status: ok ? 200 : 503 },
  );
}
