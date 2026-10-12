import "server-only";
import { getAdminSupabase } from "@/lib/supabase/server";

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
}

/**
 * Fixed-window rate limit shared across serverless instances via Postgres (`check_rate_limit`). Falls back to a
 * per-instance in-memory window when the service role is not configured or the database call fails.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const admin = getAdminSupabase();
  if (admin) {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });
    const row = Array.isArray(data) ? data[0] : null;
    if (!error && row) return { ok: row.allowed, retryAfter: row.retry_after };
  }
  return memoryRateLimit(key, limit, windowMs);
}

const buckets = new Map<string, { count: number; reset: number }>();

export function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    }
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  return { ok: b.count <= limit, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

export function tooManyRequests(r: RateLimitResult) {
  return Response.json(
    { error: "rate limited" },
    { status: 429, headers: { "Retry-After": String(r.retryAfter) } },
  );
}
