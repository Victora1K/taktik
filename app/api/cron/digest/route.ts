import { NextResponse, type NextRequest } from "next/server";
import { emailEnabled, emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Daily digest of unread, un-emailed notifications for users who opted in. Triggered by Vercel Cron. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = getAdminSupabase();
  if (!admin || !emailEnabled()) return NextResponse.json({ sent: 0, reason: "email disabled" });

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: rows, error } = await admin
    .from("notifications")
    .select(
      "id, kind, user_id, tactic_id, tactics(title), actor:profiles!notifications_actor_id_fkey(display_name), recipient:profiles!notifications_user_id_fkey(email, email_digest)",
    )
    .is("read_at", null)
    .is("emailed_at", null)
    .gte("created_at", since)
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const byUser = new Map<string, any[]>();
  for (const r of (rows ?? []) as any[]) {
    if (!r.recipient?.email_digest || !r.recipient?.email) continue;
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  }

  let sent = 0;
  for (const list of byUser.values()) {
    const items = list
      .slice(0, 20)
      .map(
        (n) =>
          `<li style="margin:6px 0"><b>${escapeHtml(n.actor?.display_name ?? "Someone")}</b> ${n.kind === "mention" ? "mentioned you" : "replied to you"} on <a href="${siteUrl()}/tactics/${n.tactic_id}">${escapeHtml(n.tactics?.title ?? "a tactic")}</a></li>`,
      )
      .join("");
    const ok = await sendEmail(
      list[0].recipient.email,
      `You have ${list.length} unread Taktik notification${list.length === 1 ? "" : "s"}`,
      emailLayout(`<p>Here is what happened on your teams:</p><ul>${items}</ul>`, {
        href: `${siteUrl()}/teams`,
        label: "Open Taktik",
      }),
    );
    if (ok) {
      sent++;
      await admin
        .from("notifications")
        .update({ emailed_at: new Date().toISOString() })
        .in(
          "id",
          list.map((n) => n.id),
        );
    }
  }
  return NextResponse.json({ sent });
}
