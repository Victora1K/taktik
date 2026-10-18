"use client";

import { Bell, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { toast, toastError } from "@/components/ui/toast";
import { ROLE_LABELS, type Notification, type PendingInvite } from "@/lib/data";
import { PALETTE } from "@/lib/engine/factory";
import { cn, timeAgo } from "@/lib/utils";
import { Logo } from "./Logo";

function NotificationsBell() {
  const { data } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const load = useCallback(() => {
    void data
      .listNotifications()
      .then(setItems)
      .catch(() => undefined);
    void data
      .listPendingInvites()
      .then(setInvites)
      .catch(() => undefined);
  }, [data]);

  useEffect(() => {
    void load();
    return data.subscribeNotifications(() => void load());
  }, [data, load]);

  const unreadNotes = items.filter((n) => !n.readAt).length;
  const unread = unreadNotes + invites.length;

  async function accept(invite: PendingInvite) {
    try {
      const teamId = await data.acceptInvite(invite.token);
      toast(`Joined ${invite.teamName}`, "success");
      load();
      router.push(`/teams/${teamId}`);
      router.refresh();
    } catch (e) {
      toastError(e);
    }
  }

  async function decline(invite: PendingInvite) {
    try {
      await data.declineInvite(invite.token);
      load();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <Menu
      trigger={(p) => (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Notifications (${unread} unread)`}
          {...p}
          className="relative"
        >
          <Bell size={17} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-ink-950">
              {unread}
            </span>
          )}
        </Button>
      )}
      className="w-80"
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadNotes > 0 && (
              <button
                className="text-xs text-brand-400 hover:underline"
                onClick={() => data.markNotificationsRead().then(load)}
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && invites.length === 0 && (
            <p className="px-2.5 py-4 text-center text-sm text-slate-500">You are all caught up.</p>
          )}
          <div className="scrollbar-thin max-h-80 overflow-y-auto">
            {invites.map((invite) => (
              <div key={invite.id} className="rounded-md px-2.5 py-2 text-sm">
                <p>
                  <b>{invite.inviterName}</b> invited you to <b>{invite.teamName}</b> as{" "}
                  {ROLE_LABELS[invite.role]}.
                </p>
                <p className="text-xs text-slate-500">{timeAgo(invite.createdAt)}</p>
                <div className="mt-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      close();
                      void accept(invite);
                    }}
                  >
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void decline(invite)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
            {items.map((n) => (
              <MenuItem
                key={n.id}
                onClick={() => {
                  close();
                  void data.markNotificationsRead([n.id]).then(load);
                  if (n.tacticId)
                    router.push(`/tactics/${n.tacticId}${n.commentId ? `?comment=${n.commentId}` : ""}`);
                }}
              >
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 self-start rounded-full",
                    n.readAt ? "bg-transparent" : "bg-brand-400",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    <b>{n.actorName}</b> {n.kind === "mention" ? "mentioned you" : "replied to you"} in{" "}
                    <b>{n.tacticTitle ?? "a tactic"}</b>
                  </span>
                  <span className="text-xs text-slate-500">{timeAgo(n.createdAt)}</span>
                </span>
              </MenuItem>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}

function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, me, setMe } = useSession();
  const [name, setName] = useState(me?.displayName ?? "");
  const [color, setColor] = useState(me?.avatarColor ?? PALETTE[0]);
  const [digest, setDigest] = useState(me?.emailDigest ?? false);

  useEffect(() => {
    if (open && me) {
      setName(me.displayName);
      setColor(me.avatarColor);
      setDigest(me.emailDigest);
    }
  }, [open, me]);

  async function save() {
    try {
      setMe(
        await data.updateMe({
          displayName: name.trim() || "Player",
          avatarColor: color,
          emailDigest: digest,
        }),
      );
      toast("Profile saved", "success");
      onClose();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Your profile">
      <div className="space-y-4">
        <div>
          <Label htmlFor="pf-name">Display name</Label>
          <Input id="pf-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Teammates use this name to @mention you.</p>
        </div>
        <div>
          <Label>Color</Label>
          <div className="flex gap-1.5">
            {PALETTE.slice(0, 8).map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full",
                  color === c && "ring-2 ring-brand-400 ring-offset-2 ring-offset-ink-900",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        {data.mode === "supabase" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} />
            Email me a daily digest of unread notifications
          </label>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { data, me } = useSession();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Logo />
        <div className="min-w-0 flex-1">{children}</div>
        {data.mode === "local" && (
          <span
            className="hidden rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300 sm:inline"
            title="Data is stored in this browser only"
          >
            Local mode
          </span>
        )}
        <NotificationsBell />
        {me && (
          <Menu
            trigger={(p) => (
              <button {...p} className="rounded-full" aria-label="Account menu">
                <Avatar name={me.displayName} color={me.avatarColor} size={30} />
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="px-2.5 py-1.5 text-xs text-slate-400">
                  Signed in as <b className="text-slate-200">{me.displayName}</b>
                  {me.email && <div className="truncate">{me.email}</div>}
                </div>
                <MenuItem
                  onClick={() => {
                    close();
                    setProfileOpen(true);
                  }}
                >
                  <Settings size={14} /> Profile
                </MenuItem>
                {data.mode === "supabase" && (
                  <MenuItem
                    onClick={async () => {
                      close();
                      await data.signOut();
                      router.push("/");
                      router.refresh();
                    }}
                  >
                    <LogOut size={14} /> Sign out
                  </MenuItem>
                )}
                <div className="border-t border-ink-800 px-2.5 py-1.5 text-xs">
                  <Link href="/terms" className="text-slate-500 hover:text-slate-300">
                    Terms
                  </Link>{" "}
                  <Link href="/privacy" className="text-slate-500 hover:text-slate-300">
                    Privacy
                  </Link>
                </div>
              </>
            )}
          </Menu>
        )}
      </div>
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
