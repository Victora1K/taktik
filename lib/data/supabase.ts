import type { SupabaseClient } from "@supabase/supabase-js";
import { fromByteaHex, toBase64, toByteaHex } from "@/lib/collab/encoding";
import type { TacticState } from "@/lib/engine/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type {
  Comment,
  DataStore,
  Invite,
  InviteInfo,
  LoadedTactic,
  Member,
  NewComment,
  Notification,
  Profile,
  PublicTactic,
  Reaction,
  Role,
  TacticMeta,
  TacticVersion,
  Team,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TACTIC_COLUMNS =
  "id, team_id, sport, title, folder, tags, thumbnail_url, visibility, share_slug, created_by, created_at, updated_at";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    avatarColor: row.avatar_color,
    emailDigest: row.email_digest,
  };
}

function mapTactic(row: any): TacticMeta {
  return {
    id: row.id,
    teamId: row.team_id,
    sport: row.sport,
    title: row.title,
    folder: row.folder,
    tags: row.tags ?? [],
    thumbnailUrl: row.thumbnail_url,
    visibility: row.visibility,
    shareSlug: row.share_slug,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvite(row: any): Invite {
  return {
    id: row.id,
    teamId: row.team_id,
    token: row.token,
    email: row.email,
    role: row.role,
    uses: row.uses,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  };
}

export class SupabaseDataStore implements DataStore {
  readonly mode = "supabase" as const;
  private sb: SupabaseClient;
  private uid: string | null = null;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? getBrowserSupabase();
  }

  private async userId(): Promise<string> {
    if (this.uid) return this.uid;
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new Error("Not signed in");
    this.uid = data.user.id;
    return this.uid;
  }

  // ---------- profile ----------

  async getMe() {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) return null;
    this.uid = data.user.id;
    const row = check(await this.sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle());
    return row ? mapProfile(row) : null;
  }

  async updateMe(patch: Partial<Pick<Profile, "displayName" | "avatarColor" | "emailDigest">>) {
    const id = await this.userId();
    const row = check(
      await this.sb
        .from("profiles")
        .update({
          ...(patch.displayName !== undefined && { display_name: patch.displayName }),
          ...(patch.avatarColor !== undefined && { avatar_color: patch.avatarColor }),
          ...(patch.emailDigest !== undefined && { email_digest: patch.emailDigest }),
        })
        .eq("id", id)
        .select()
        .single(),
    );
    return mapProfile(row);
  }

  async signOut() {
    this.uid = null;
    await this.sb.auth.signOut();
  }

  // ---------- teams ----------

  async listTeams(): Promise<Team[]> {
    const id = await this.userId();
    const rows = check(
      await this.sb.from("team_members").select("role, teams(id, name, created_at)").eq("user_id", id),
    ) as any[];
    return rows
      .filter((r) => r.teams)
      .map((r) => ({
        id: r.teams.id,
        name: r.teams.name,
        createdAt: r.teams.created_at,
        role: r.role as Role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createTeam(name: string): Promise<Team> {
    const row = check(await this.sb.rpc("create_team", { p_name: name })) as any;
    return { id: row.id, name: row.name, createdAt: row.created_at, role: "owner" };
  }

  async getTeam(id: string) {
    const uid = await this.userId();
    const row = check(
      await this.sb
        .from("team_members")
        .select("role, teams(id, name, created_at)")
        .eq("user_id", uid)
        .eq("team_id", id)
        .maybeSingle(),
    ) as any;
    if (!row?.teams) return null;
    return {
      id: row.teams.id,
      name: row.teams.name,
      createdAt: row.teams.created_at,
      role: row.role as Role,
    };
  }

  async updateTeam(id: string, patch: { name: string }) {
    check(await this.sb.from("teams").update(patch).eq("id", id));
  }

  async deleteTeam(id: string) {
    check(await this.sb.from("teams").delete().eq("id", id));
  }

  async listMembers(teamId: string): Promise<Member[]> {
    const rows = check(
      await this.sb
        .from("team_members")
        .select(
          "user_id, role, joined_at, profiles!team_members_user_id_fkey(display_name, avatar_color, email)",
        )
        .eq("team_id", teamId),
    ) as any[];
    return rows.map((r) => ({
      userId: r.user_id,
      role: r.role,
      joinedAt: r.joined_at,
      displayName: r.profiles?.display_name || "Player",
      avatarColor: r.profiles?.avatar_color ?? "#64748b",
      email: r.profiles?.email,
    }));
  }

  async updateMemberRole(teamId: string, userId: string, role: Role) {
    check(await this.sb.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", userId));
  }

  async removeMember(teamId: string, userId: string) {
    check(await this.sb.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId));
  }

  async listInvites(teamId: string) {
    const rows = check(
      await this.sb
        .from("team_invites")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
    ) as any[];
    return rows.map(mapInvite);
  }

  async createInvite(teamId: string, opts: { email?: string; role: Role }) {
    const row = check(
      await this.sb
        .from("team_invites")
        .insert({ team_id: teamId, email: opts.email?.trim() || null, role: opts.role })
        .select()
        .single(),
    );
    const invite = mapInvite(row);
    if (invite.email) {
      void fetch("/api/invites/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteId: invite.id }),
      }).catch(() => undefined);
    }
    return invite;
  }

  async deleteInvite(id: string) {
    check(await this.sb.from("team_invites").delete().eq("id", id));
  }

  async getInviteInfo(token: string): Promise<InviteInfo | null> {
    const rows = check(await this.sb.rpc("get_invite_info", { p_token: token })) as any[];
    const r = rows?.[0];
    return r ? { teamId: r.team_id, teamName: r.team_name, role: r.role, expired: r.expired } : null;
  }

  async acceptInvite(token: string) {
    return check(await this.sb.rpc("accept_invite", { p_token: token })) as string;
  }

  // ---------- tactics ----------

  async listTactics(teamId: string) {
    const rows = check(
      await this.sb
        .from("tactics")
        .select(TACTIC_COLUMNS)
        .eq("team_id", teamId)
        .order("updated_at", { ascending: false }),
    ) as any[];
    return rows.map(mapTactic);
  }

  async createTactic(input: {
    teamId: string;
    sport: TacticMeta["sport"];
    title: string;
    docState: Uint8Array;
    folder?: string | null;
  }) {
    const row = check(
      await this.sb
        .from("tactics")
        .insert({
          team_id: input.teamId,
          sport: input.sport,
          title: input.title,
          folder: input.folder ?? null,
          doc_state: toByteaHex(input.docState),
        })
        .select(TACTIC_COLUMNS)
        .single(),
    );
    return mapTactic(row);
  }

  async getTactic(id: string): Promise<LoadedTactic | null> {
    const uid = await this.userId();
    const row = check(
      await this.sb.from("tactics").select(`${TACTIC_COLUMNS}, doc_state`).eq("id", id).maybeSingle(),
    ) as any;
    if (!row) return null;
    const member = check(
      await this.sb
        .from("team_members")
        .select("role")
        .eq("team_id", row.team_id)
        .eq("user_id", uid)
        .maybeSingle(),
    ) as any;
    return {
      meta: mapTactic(row),
      docState: fromByteaHex(row.doc_state),
      role: (member?.role ?? "viewer") as Role,
    };
  }

  async updateTactic(
    id: string,
    patch: Partial<Pick<TacticMeta, "title" | "folder" | "tags" | "visibility" | "shareSlug">>,
  ) {
    const row = check(
      await this.sb
        .from("tactics")
        .update({
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.folder !== undefined && { folder: patch.folder }),
          ...(patch.tags !== undefined && { tags: patch.tags }),
          ...(patch.visibility !== undefined && { visibility: patch.visibility }),
          ...(patch.shareSlug !== undefined && { share_slug: patch.shareSlug }),
        })
        .eq("id", id)
        .select(TACTIC_COLUMNS)
        .single(),
    );
    return mapTactic(row);
  }

  async deleteTactic(id: string) {
    check(await this.sb.from("tactics").delete().eq("id", id));
  }

  async saveSnapshot(id: string, update: Uint8Array, opts: { thumbnail?: string; beacon?: boolean }) {
    const url = `/api/tactics/${id}/snapshot`;
    const body = JSON.stringify({ update: toBase64(update), thumbnail: opts.thumbnail });
    if (opts.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: body.length < 60_000,
    });
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
  }

  async getPublicTactic(slug: string): Promise<PublicTactic | null> {
    const rows = check(await this.sb.rpc("get_public_tactic", { p_slug: slug })) as any[];
    const r = rows?.[0];
    return r ? { id: r.id, title: r.title, sport: r.sport, docState: fromByteaHex(r.doc_state) } : null;
  }

  // ---------- versions ----------

  async listVersions(tacticId: string): Promise<TacticVersion[]> {
    const rows = check(
      await this.sb
        .from("tactic_versions")
        .select("*, profiles!tactic_versions_created_by_fkey(display_name)")
        .eq("tactic_id", tacticId)
        .order("created_at", { ascending: false }),
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      tacticId: r.tactic_id,
      name: r.name,
      state: r.state,
      createdBy: r.created_by,
      authorName: r.profiles?.display_name ?? "Someone",
      createdAt: r.created_at,
    }));
  }

  async createVersion(tacticId: string, name: string, state: TacticState) {
    const row = check(
      await this.sb
        .from("tactic_versions")
        .insert({ tactic_id: tacticId, name, state })
        .select("*, profiles!tactic_versions_created_by_fkey(display_name)")
        .single(),
    ) as any;
    return {
      id: row.id,
      tacticId: row.tactic_id,
      name: row.name,
      state: row.state,
      createdBy: row.created_by,
      authorName: row.profiles?.display_name ?? "You",
      createdAt: row.created_at,
    };
  }

  async deleteVersion(id: string) {
    check(await this.sb.from("tactic_versions").delete().eq("id", id));
  }

  // ---------- comments ----------

  async listComments(tacticId: string): Promise<Comment[]> {
    const [comments, reactions] = await Promise.all([
      this.sb
        .from("comments")
        .select("*, profiles!comments_author_id_fkey(display_name, avatar_color)")
        .eq("tactic_id", tacticId)
        .order("created_at", { ascending: true }),
      this.sb.from("comment_reactions").select("comment_id, user_id, emoji").eq("tactic_id", tacticId),
    ]);
    const byComment = new Map<string, Reaction[]>();
    for (const r of (check(reactions) as any[]) ?? []) {
      const list = byComment.get(r.comment_id) ?? [];
      const entry = list.find((x) => x.emoji === r.emoji);
      if (entry) entry.userIds.push(r.user_id);
      else list.push({ emoji: r.emoji, userIds: [r.user_id] });
      byComment.set(r.comment_id, list);
    }
    return (check(comments) as any[]).map((r) => ({
      id: r.id,
      tacticId: r.tactic_id,
      parentId: r.parent_id,
      authorId: r.author_id,
      authorName: r.profiles?.display_name ?? "Player",
      authorColor: r.profiles?.avatar_color ?? "#64748b",
      body: r.body,
      anchorMs: r.anchor_ms,
      anchorX: r.anchor_x,
      anchorY: r.anchor_y,
      mentions: r.mentions ?? [],
      resolved: r.resolved,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      reactions: byComment.get(r.id) ?? [],
    }));
  }

  async createComment(input: NewComment): Promise<Comment> {
    const uid = await this.userId();
    const row = check(
      await this.sb
        .from("comments")
        .insert({
          tactic_id: input.tacticId,
          parent_id: input.parentId ?? null,
          author_id: uid,
          body: input.body,
          anchor_ms: input.anchorMs ?? null,
          anchor_x: input.anchorX ?? null,
          anchor_y: input.anchorY ?? null,
          mentions: input.mentions ?? [],
        })
        .select("*, profiles!comments_author_id_fkey(display_name, avatar_color)")
        .single(),
    ) as any;
    if (row.mentions?.length || row.parent_id) {
      void fetch("/api/notifications/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentId: row.id }),
      }).catch(() => undefined);
    }
    return {
      id: row.id,
      tacticId: row.tactic_id,
      parentId: row.parent_id,
      authorId: row.author_id,
      authorName: row.profiles?.display_name ?? "You",
      authorColor: row.profiles?.avatar_color ?? "#64748b",
      body: row.body,
      anchorMs: row.anchor_ms,
      anchorX: row.anchor_x,
      anchorY: row.anchor_y,
      mentions: row.mentions ?? [],
      resolved: row.resolved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reactions: [],
    };
  }

  async updateComment(id: string, patch: { body?: string; resolved?: boolean }) {
    check(await this.sb.from("comments").update(patch).eq("id", id));
  }

  async deleteComment(id: string) {
    check(await this.sb.from("comments").delete().eq("id", id));
  }

  async toggleReaction(comment: Comment, emoji: string) {
    const uid = await this.userId();
    const mine = comment.reactions.find((r) => r.emoji === emoji)?.userIds.includes(uid);
    if (mine) {
      check(
        await this.sb
          .from("comment_reactions")
          .delete()
          .eq("comment_id", comment.id)
          .eq("user_id", uid)
          .eq("emoji", emoji),
      );
    } else {
      check(
        await this.sb
          .from("comment_reactions")
          .insert({ comment_id: comment.id, tactic_id: comment.tacticId, user_id: uid, emoji }),
      );
    }
  }

  /** Change feeds are filtered by RLS with the socket's token, so it must carry the user session before joining. */
  private feed(name: string, setup: (channel: ReturnType<SupabaseClient["channel"]>) => void) {
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let closed = false;
    void this.sb.realtime.setAuth().then(() => {
      if (closed) return;
      channel = this.sb.channel(`${name}:${Math.random().toString(36).slice(2)}`);
      setup(channel);
      channel.subscribe();
    });
    return () => {
      closed = true;
      if (channel) void this.sb.removeChannel(channel);
    };
  }

  subscribeComments(tacticId: string, cb: () => void) {
    return this.feed(`comments-feed:${tacticId}`, (channel) =>
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "comments", filter: `tactic_id=eq.${tacticId}` },
          cb,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "comment_reactions", filter: `tactic_id=eq.${tacticId}` },
          cb,
        )
        // Deletes cannot be filtered by column; refresh on any visible delete.
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "comment_reactions" }, cb)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "comments" }, cb),
    );
  }

  // ---------- notifications ----------

  async listNotifications(): Promise<Notification[]> {
    const uid = await this.userId();
    const rows = check(
      await this.sb
        .from("notifications")
        .select(
          "id, kind, tactic_id, comment_id, created_at, read_at, tactics(title), actor:profiles!notifications_actor_id_fkey(display_name)",
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      tacticId: r.tactic_id,
      tacticTitle: r.tactics?.title ?? null,
      commentId: r.comment_id,
      actorName: r.actor?.display_name ?? "Someone",
      createdAt: r.created_at,
      readAt: r.read_at,
    }));
  }

  async markNotificationsRead(ids?: string[]) {
    const uid = await this.userId();
    let q = this.sb
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", uid)
      .is("read_at", null);
    if (ids) q = q.in("id", ids);
    check(await q);
  }

  subscribeNotifications(cb: () => void) {
    let unsubscribe: (() => void) | null = null;
    let closed = false;
    void this.userId().then((uid) => {
      if (closed) return;
      unsubscribe = this.feed(`notifications:${uid}`, (channel) =>
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          cb,
        ),
      );
    });
    return () => {
      closed = true;
      unsubscribe?.();
    };
  }
}
