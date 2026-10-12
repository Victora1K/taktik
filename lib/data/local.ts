import { nanoid } from "nanoid";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "@/lib/collab/encoding";
import type { TacticState } from "@/lib/engine/types";
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
  Role,
  TacticMeta,
  TacticVersion,
  Team,
} from "./types";

/**
 * Browser-only data store used when Supabase is not configured. Everything lives in localStorage and change
 * notifications are shared between tabs with a BroadcastChannel, so the whole product can be tried offline.
 */

const PREFIX = "taktik:v1:";
const CHANGES = "taktik-data-changes";

interface LocalDb {
  me: Profile | null;
  teams: (Omit<Team, "role"> & { members: { userId: string; role: Role; joinedAt: string }[] })[];
  tactics: TacticMeta[];
  versions: TacticVersion[];
  comments: Omit<Comment, "authorName" | "authorColor">[];
  notifications: (Omit<Notification, "actorName" | "tacticTitle"> & { userId: string; actorId: string })[];
}

const EMPTY: LocalDb = { me: null, teams: [], tactics: [], versions: [], comments: [], notifications: [] };
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316", "#0891b2", "#db2777"];

function now() {
  return new Date().toISOString();
}

export class LocalDataStore implements DataStore {
  readonly mode = "local" as const;
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANGES) : null;
  private listeners = new Set<(topic: string) => void>();

  constructor() {
    if (this.channel) this.channel.onmessage = (e) => this.listeners.forEach((cb) => cb(e.data as string));
  }

  // ---------- storage ----------

  private read(): LocalDb {
    try {
      const raw = localStorage.getItem(PREFIX + "db");
      return raw ? { ...EMPTY, ...(JSON.parse(raw) as LocalDb) } : structuredClone(EMPTY);
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private write(db: LocalDb, topic?: string) {
    localStorage.setItem(PREFIX + "db", JSON.stringify(db));
    if (topic) {
      this.channel?.postMessage(topic);
      this.listeners.forEach((cb) => cb(topic));
    }
  }

  private subscribe(match: (topic: string) => boolean, cb: () => void) {
    const fn = (topic: string) => match(topic) && cb();
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private ensureMe(db: LocalDb): Profile {
    if (!db.me) {
      db.me = {
        id: nanoid(),
        displayName: `Coach ${Math.floor(100 + Math.random() * 900)}`,
        avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
        emailDigest: false,
      };
      this.write(db);
    }
    return db.me;
  }

  private ensureTeam(db: LocalDb) {
    const me = this.ensureMe(db);
    if (!db.teams.length) {
      db.teams.push({
        id: nanoid(),
        name: "My Team",
        createdAt: now(),
        members: [{ userId: me.id, role: "owner", joinedAt: now() }],
      });
      this.write(db);
    }
  }

  // ---------- profile ----------

  async getMe() {
    const db = this.read();
    this.ensureTeam(db);
    return db.me;
  }

  async updateMe(patch: Partial<Pick<Profile, "displayName" | "avatarColor" | "emailDigest">>) {
    const db = this.read();
    const me = { ...this.ensureMe(db), ...patch };
    db.me = me;
    this.write(db, "me");
    return me;
  }

  async signOut() {
    // Local mode has no accounts.
  }

  // ---------- teams ----------

  async listTeams(): Promise<Team[]> {
    const db = this.read();
    this.ensureTeam(db);
    return db.teams.map(({ members: _m, ...t }) => ({ ...t, role: "owner" as Role }));
  }

  async createTeam(name: string): Promise<Team> {
    const db = this.read();
    const me = this.ensureMe(db);
    const team = {
      id: nanoid(),
      name,
      createdAt: now(),
      members: [{ userId: me.id, role: "owner" as Role, joinedAt: now() }],
    };
    db.teams.push(team);
    this.write(db, "teams");
    return { id: team.id, name, createdAt: team.createdAt, role: "owner" };
  }

  async getTeam(id: string) {
    return (await this.listTeams()).find((t) => t.id === id) ?? null;
  }

  async updateTeam(id: string, patch: { name: string }) {
    const db = this.read();
    db.teams = db.teams.map((t) => (t.id === id ? { ...t, ...patch } : t));
    this.write(db, "teams");
  }

  async deleteTeam(id: string) {
    const db = this.read();
    const tacticIds = new Set(db.tactics.filter((t) => t.teamId === id).map((t) => t.id));
    db.teams = db.teams.filter((t) => t.id !== id);
    db.tactics = db.tactics.filter((t) => t.teamId !== id);
    db.versions = db.versions.filter((v) => !tacticIds.has(v.tacticId));
    db.comments = db.comments.filter((c) => !tacticIds.has(c.tacticId));
    tacticIds.forEach((tid) => localStorage.removeItem(PREFIX + "doc:" + tid));
    this.write(db, "teams");
  }

  async listMembers(teamId: string): Promise<Member[]> {
    const db = this.read();
    const me = this.ensureMe(db);
    const team = db.teams.find((t) => t.id === teamId);
    return (team?.members ?? []).map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      displayName: m.userId === me.id ? me.displayName : "Teammate",
      avatarColor: m.userId === me.id ? me.avatarColor : "#64748b",
    }));
  }

  async updateMemberRole() {
    throw new Error("Roles need a Supabase backend. Configure Supabase to invite teammates.");
  }

  async removeMember() {
    throw new Error("Members need a Supabase backend.");
  }

  async listInvites(): Promise<Invite[]> {
    return [];
  }

  async createInvite(): Promise<Invite> {
    throw new Error("Invites need a Supabase backend. Set NEXT_PUBLIC_SUPABASE_URL to enable teams.");
  }

  async deleteInvite() {}

  async getInviteInfo(): Promise<InviteInfo | null> {
    return null;
  }

  async acceptInvite(): Promise<string> {
    throw new Error("Invites need a Supabase backend.");
  }

  // ---------- tactics ----------

  async listTactics(teamId: string) {
    return this.read()
      .tactics.filter((t) => t.teamId === teamId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createTactic(input: {
    teamId: string;
    sport: TacticMeta["sport"];
    title: string;
    docState: Uint8Array;
    folder?: string | null;
  }) {
    const db = this.read();
    const me = this.ensureMe(db);
    const meta: TacticMeta = {
      id: nanoid(),
      teamId: input.teamId,
      sport: input.sport,
      title: input.title,
      folder: input.folder ?? null,
      tags: [],
      thumbnailUrl: null,
      visibility: "team",
      shareSlug: null,
      createdBy: me.id,
      createdAt: now(),
      updatedAt: now(),
    };
    db.tactics.push(meta);
    localStorage.setItem(PREFIX + "doc:" + meta.id, toBase64(input.docState));
    this.write(db, "tactics");
    return meta;
  }

  async getTactic(id: string): Promise<LoadedTactic | null> {
    const meta = this.read().tactics.find((t) => t.id === id);
    if (!meta) return null;
    const raw = localStorage.getItem(PREFIX + "doc:" + id);
    return { meta, docState: raw ? fromBase64(raw) : null, role: "owner" };
  }

  async updateTactic(
    id: string,
    patch: Partial<Pick<TacticMeta, "title" | "folder" | "tags" | "visibility" | "shareSlug">>,
  ) {
    const db = this.read();
    let updated: TacticMeta | undefined;
    db.tactics = db.tactics.map((t) => (t.id === id ? (updated = { ...t, ...patch, updatedAt: now() }) : t));
    if (!updated) throw new Error("Tactic not found");
    this.write(db, "tactics");
    return updated;
  }

  async deleteTactic(id: string) {
    const db = this.read();
    db.tactics = db.tactics.filter((t) => t.id !== id);
    db.versions = db.versions.filter((v) => v.tacticId !== id);
    db.comments = db.comments.filter((c) => c.tacticId !== id);
    localStorage.removeItem(PREFIX + "doc:" + id);
    this.write(db, "tactics");
  }

  async saveSnapshot(id: string, update: Uint8Array, opts: { thumbnail?: string }) {
    const key = PREFIX + "doc:" + id;
    const existing = localStorage.getItem(key);
    const doc = new Y.Doc();
    if (existing) Y.applyUpdate(doc, fromBase64(existing));
    Y.applyUpdate(doc, update);
    localStorage.setItem(key, toBase64(Y.encodeStateAsUpdate(doc)));
    const db = this.read();
    const title = (doc.getMap("meta").get("title") as string | undefined) ?? undefined;
    db.tactics = db.tactics.map((t) =>
      t.id === id
        ? { ...t, title: title ?? t.title, updatedAt: now(), thumbnailUrl: opts.thumbnail ?? t.thumbnailUrl }
        : t,
    );
    this.write(db);
  }

  async getPublicTactic(slug: string): Promise<PublicTactic | null> {
    const meta = this.read().tactics.find((t) => t.shareSlug === slug && t.visibility === "link");
    if (!meta) return null;
    const raw = localStorage.getItem(PREFIX + "doc:" + meta.id);
    return { id: meta.id, title: meta.title, sport: meta.sport, docState: raw ? fromBase64(raw) : null };
  }

  // ---------- versions ----------

  async listVersions(tacticId: string) {
    return this.read()
      .versions.filter((v) => v.tacticId === tacticId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createVersion(tacticId: string, name: string, state: TacticState) {
    const db = this.read();
    const me = this.ensureMe(db);
    const v: TacticVersion = {
      id: nanoid(),
      tacticId,
      name,
      state,
      createdBy: me.id,
      authorName: me.displayName,
      createdAt: now(),
    };
    db.versions.push(v);
    this.write(db, "versions");
    return v;
  }

  async deleteVersion(id: string) {
    const db = this.read();
    db.versions = db.versions.filter((v) => v.id !== id);
    this.write(db, "versions");
  }

  // ---------- comments ----------

  async listComments(tacticId: string): Promise<Comment[]> {
    const db = this.read();
    const me = this.ensureMe(db);
    return db.comments
      .filter((c) => c.tacticId === tacticId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({
        ...c,
        authorName: c.authorId === me.id ? me.displayName : "Teammate",
        authorColor: c.authorId === me.id ? me.avatarColor : "#64748b",
      }));
  }

  async createComment(input: NewComment): Promise<Comment> {
    const db = this.read();
    const me = this.ensureMe(db);
    const c = {
      id: nanoid(),
      tacticId: input.tacticId,
      parentId: input.parentId ?? null,
      authorId: me.id,
      body: input.body,
      anchorMs: input.anchorMs ?? null,
      anchorX: input.anchorX ?? null,
      anchorY: input.anchorY ?? null,
      mentions: input.mentions ?? [],
      resolved: false,
      createdAt: now(),
      updatedAt: now(),
      reactions: [],
    };
    db.comments.push(c);
    for (const uid of c.mentions) {
      if (uid === me.id) continue;
      db.notifications.push({
        id: nanoid(),
        userId: uid,
        actorId: me.id,
        kind: "mention",
        tacticId: c.tacticId,
        commentId: c.id,
        createdAt: now(),
        readAt: null,
      });
    }
    this.write(db, `comments:${input.tacticId}`);
    return { ...c, authorName: me.displayName, authorColor: me.avatarColor };
  }

  async updateComment(id: string, patch: { body?: string; resolved?: boolean }) {
    const db = this.read();
    const c = db.comments.find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch, { updatedAt: now() });
    this.write(db, `comments:${c.tacticId}`);
  }

  async deleteComment(id: string) {
    const db = this.read();
    const c = db.comments.find((x) => x.id === id);
    if (!c) return;
    db.comments = db.comments.filter((x) => x.id !== id && x.parentId !== id);
    this.write(db, `comments:${c.tacticId}`);
  }

  async toggleReaction(comment: Comment, emoji: string) {
    const db = this.read();
    const me = this.ensureMe(db);
    const c = db.comments.find((x) => x.id === comment.id);
    if (!c) return;
    const r = c.reactions.find((x) => x.emoji === emoji);
    if (!r) c.reactions.push({ emoji, userIds: [me.id] });
    else if (r.userIds.includes(me.id)) r.userIds = r.userIds.filter((u) => u !== me.id);
    else r.userIds.push(me.id);
    c.reactions = c.reactions.filter((x) => x.userIds.length);
    this.write(db, `comments:${c.tacticId}`);
  }

  subscribeComments(tacticId: string, cb: () => void) {
    return this.subscribe((t) => t === `comments:${tacticId}`, cb);
  }

  // ---------- notifications ----------

  async listNotifications(): Promise<Notification[]> {
    const db = this.read();
    const me = this.ensureMe(db);
    return db.notifications
      .filter((n) => n.userId === me.id)
      .map(({ userId: _u, actorId: _a, ...n }) => ({
        ...n,
        actorName: "Teammate",
        tacticTitle: db.tactics.find((t) => t.id === n.tacticId)?.title ?? null,
      }));
  }

  async markNotificationsRead(ids?: string[]) {
    const db = this.read();
    db.notifications = db.notifications.map((n) =>
      !ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now() } : n,
    );
    this.write(db, "notifications");
  }

  subscribeNotifications(cb: () => void) {
    return this.subscribe((t) => t === "notifications" || t.startsWith("comments:"), cb);
  }
}
