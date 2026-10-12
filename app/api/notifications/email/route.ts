import { NextResponse, type NextRequest } from "next/server";
import { emailEnabled, emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";

/**
 * Sends immediate emails for the notifications created by a new comment (mentions and replies).
 * The caller must be the comment's author; recipients come from the notifications table, not the request.
 */
export async function POST(req: NextRequest) {
  const admin = getAdminSupabase();
  if (!admin || !emailEnabled()) return NextResponse.json({ sent: 0, reason: "email disabled" });

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await rateLimit(`notify-email:${auth.user.id}`, 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  const { commentId } = (await req.json().catch(() => ({}))) as { commentId?: string };
  if (!commentId) return NextResponse.json({ error: "missing commentId" }, { status: 400 });

  const { data: comment } = await admin
    .from("comments")
    .select("id, body, author_id, tactic_id, tactics(title), profiles!comments_author_id_fkey(display_name)")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment || comment.author_id !== auth.user.id)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: notes } = await admin
    .from("notifications")
    .select("id, kind, user_id, profiles!notifications_user_id_fkey(email, display_name)")
    .eq("comment_id", commentId)
    .is("emailed_at", null);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const c = comment as any;
  const author = escapeHtml(c.profiles?.display_name ?? "A teammate");
  const title = escapeHtml(c.tactics?.title ?? "a tactic");
  const excerpt = escapeHtml(String(c.body).slice(0, 280));
  let sent = 0;
  for (const n of (notes ?? []) as any[]) {
    const email = n.profiles?.email;
    if (!email) continue;
    const verb = n.kind === "mention" ? "mentioned you" : "replied to your comment";
    const ok = await sendEmail(
      email,
      `${c.profiles?.display_name ?? "A teammate"} ${verb} on ${c.tactics?.title ?? "a tactic"}`,
      emailLayout(
        `<p><b>${author}</b> ${verb} on <b>${title}</b>:</p><blockquote style="border-left:3px solid #10b981;margin:12px 0;padding:4px 12px;color:#334155">${excerpt}</blockquote>`,
        {
          href: `${siteUrl()}/tactics/${c.tactic_id}?comment=${c.id}`,
          label: "Open the discussion",
        },
      ),
    );
    if (ok) {
      sent++;
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id);
    }
  }
  return NextResponse.json({ sent });
}
