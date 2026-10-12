"use client";

import { Copy, Link2, Mail, Trash2 } from "lucide-react";
import { use, useCallback, useEffect, useState } from "react";
import { TeamNav } from "@/components/app/TeamNav";
import { useTeam } from "@/components/app/useTeam";
import { useSession } from "@/components/providers";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast, toastError } from "@/components/ui/toast";
import { isAdmin, ROLE_LABELS, type Invite, type Member, type Role } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { timeAgo } from "@/lib/utils";

const ASSIGNABLE: Role[] = ["coach", "member", "viewer"];

export default function MembersPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const { data, me } = useSession();
  const { team } = useTeam(teamId);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const admin = isAdmin(team?.role);
  const load = useCallback(async () => {
    try {
      setMembers(await data.listMembers(teamId));
      if (admin) setInvites(await data.listInvites(teamId));
    } catch (e) {
      toastError(e);
    }
  }, [data, teamId, admin]);

  useEffect(() => {
    if (team) void load();
  }, [team, load]);

  if (team === undefined) return <p className="text-sm text-slate-500">Loading...</p>;
  if (team === null) return <p className="text-sm text-slate-400">Team not found.</p>;

  async function invite(withEmail: boolean) {
    try {
      const inv = await data.createInvite(teamId, { email: withEmail ? email : undefined, role });
      setEmail("");
      await load();
      if (!withEmail) {
        await navigator.clipboard.writeText(`${siteUrl()}/invite/${inv.token}`).catch(() => undefined);
        toast("Invite link created and copied", "success");
      } else toast(`Invite sent to ${inv.email}`, "success");
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div>
      <TeamNav team={team} />
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Members ({members.length})
          </h2>
          <ul className="divide-y divide-ink-800 rounded-xl border border-ink-800 bg-ink-900">
            {members.map((m) => {
              const self = m.userId === me?.id;
              const canChange = admin && !self && (team.role === "owner" || m.role !== "owner");
              return (
                <li key={m.userId} className="flex items-center gap-3 p-3">
                  <Avatar name={m.displayName} color={m.avatarColor} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.displayName} {self && <span className="text-slate-500">(you)</span>}
                    </div>
                    {m.email && <div className="truncate text-xs text-slate-500">{m.email}</div>}
                  </div>
                  {canChange ? (
                    <Select
                      className="w-28"
                      value={m.role}
                      onChange={(e) =>
                        data
                          .updateMemberRole(teamId, m.userId, e.target.value as Role)
                          .then(load)
                          .catch(toastError)
                      }
                      aria-label={`Role for ${m.displayName}`}
                    >
                      {(team.role === "owner" ? (["owner", ...ASSIGNABLE] as Role[]) : ASSIGNABLE).map(
                        (r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ),
                      )}
                    </Select>
                  ) : (
                    <span className="text-xs text-slate-400">{ROLE_LABELS[m.role]}</span>
                  )}
                  {(canChange || (self && m.role !== "owner")) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={self ? "Leave team" : `Remove ${m.displayName}`}
                      onClick={() =>
                        window.confirm(
                          self ? "Leave this team?" : `Remove ${m.displayName} from the team?`,
                        ) &&
                        data
                          .removeMember(teamId, m.userId)
                          .then(() => {
                            if (self) window.location.href = "/teams";
                            else void load();
                          })
                          .catch(toastError)
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Coaches and players can edit tactics. Viewers can watch and comment. Owners and coaches manage
            members.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Invite</h2>
          {data.mode === "local" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Taktik is running in local mode, so everything lives in this browser. Connect a Supabase project
              (see the README) to invite teammates and collaborate across devices.
            </div>
          ) : !admin ? (
            <p className="text-sm text-slate-400">Ask a coach or the team owner to invite people.</p>
          ) : (
            <div className="space-y-4 rounded-xl border border-ink-800 bg-ink-900 p-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="inv-role">
                  Role for new members
                </label>
                <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  aria-label="Email"
                />
                <Button onClick={() => void invite(true)} disabled={!/.+@.+\..+/.test(email)}>
                  <Mail size={14} /> Send
                </Button>
              </div>
              <Button variant="outline" className="w-full justify-center" onClick={() => void invite(false)}>
                <Link2 size={14} /> Create shareable invite link
              </Button>

              {invites.length > 0 && (
                <ul className="space-y-2 border-t border-ink-800 pt-3">
                  {invites.map((i) => {
                    const expired = new Date(i.expiresAt) < new Date() || (i.email && i.acceptedAt);
                    return (
                      <li key={i.id} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">
                          {i.email ?? "Link"} - {ROLE_LABELS[i.role]}{" "}
                          <span className="text-slate-500">
                            {expired ? "expired/used" : `expires ${timeAgo(i.expiresAt).replace(" ago", "")}`}{" "}
                            {i.uses ? `- used ${i.uses}x` : ""}
                          </span>
                        </span>
                        {!expired && (
                          <button
                            className="text-slate-400 hover:text-white"
                            aria-label="Copy invite link"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(`${siteUrl()}/invite/${i.token}`)
                                .then(() => toast("Copied", "success"))
                            }
                          >
                            <Copy size={13} />
                          </button>
                        )}
                        <button
                          className="text-slate-400 hover:text-red-400"
                          aria-label="Revoke invite"
                          onClick={() => data.deleteInvite(i.id).then(load).catch(toastError)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
