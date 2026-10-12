import { NextResponse, type NextRequest } from "next/server";
import { emailEnabled, emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getServerSupabase } from "@/lib/supabase/server";

/** Emails an invite. Reading the invite through the user's own client means RLS limits this to team admins. */
export async function POST(req: NextRequest) {
  if (!emailEnabled()) return NextResponse.json({ sent: false, reason: "email disabled" });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await rateLimit(`invite-email:${auth.user.id}`, 20, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  const { inviteId } = (await req.json().catch(() => ({}))) as { inviteId?: string };
  if (!inviteId) return NextResponse.json({ error: "missing inviteId" }, { status: 400 });

  const { data: invite } = await supabase
    .from("team_invites")
    .select("token, email, role, teams(name)")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite?.email) return NextResponse.json({ error: "not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const team = escapeHtml((invite as any).teams?.name ?? "a team");
  const ok = await sendEmail(
    invite.email,
    `You're invited to join ${(invite as { teams?: { name?: string } }).teams?.name ?? "a team"} on Taktik`,
    emailLayout(
      `<p>You have been invited to plan tactics with <b>${team}</b> on Taktik.</p><p>The invite expires in 7 days.</p>`,
      {
        href: `${siteUrl()}/invite/${invite.token}`,
        label: "Join the team",
      },
    ),
  );
  return NextResponse.json({ sent: ok });
}
