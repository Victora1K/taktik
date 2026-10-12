import type { TacticState } from "@/lib/engine/types";
import type { SportId } from "@/lib/sports";

export type Role = "owner" | "coach" | "member" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  coach: "Coach",
  member: "Player",
  viewer: "Viewer",
};

export function canEdit(role: Role | null | undefined): boolean {
  return role === "owner" || role === "coach" || role === "member";
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === "owner" || role === "coach";
}

export interface Profile {
  id: string;
  displayName: string;
  email?: string | null;
  avatarColor: string;
  emailDigest: boolean;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
  role: Role;
}

export interface Member {
  userId: string;
  displayName: string;
  email?: string | null;
  avatarColor: string;
  role: Role;
  joinedAt: string;
}

export interface Invite {
  id: string;
  teamId: string;
  token: string;
  email?: string | null;
  role: Role;
  uses: number;
  expiresAt: string;
  acceptedAt?: string | null;
}

export interface InviteInfo {
  teamId: string;
  teamName: string;
  role: Role;
  expired: boolean;
}

export type Visibility = "team" | "link";

export interface TacticMeta {
  id: string;
  teamId: string;
  sport: SportId;
  title: string;
  folder: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  visibility: Visibility;
  shareSlug: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TacticVersion {
  id: string;
  tacticId: string;
  name: string;
  state: TacticState;
  createdBy: string | null;
  authorName: string;
  createdAt: string;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Comment {
  id: string;
  tacticId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorColor: string;
  body: string;
  anchorMs: number | null;
  anchorX: number | null;
  anchorY: number | null;
  mentions: string[];
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  reactions: Reaction[];
}

export interface NewComment {
  tacticId: string;
  parentId?: string | null;
  body: string;
  anchorMs?: number | null;
  anchorX?: number | null;
  anchorY?: number | null;
  mentions?: string[];
}

export interface Notification {
  id: string;
  kind: "mention" | "reply";
  tacticId: string | null;
  tacticTitle: string | null;
  commentId: string | null;
  actorName: string;
  createdAt: string;
  readAt: string | null;
}

export interface LoadedTactic {
  meta: TacticMeta;
  docState: Uint8Array | null;
  role: Role;
}

export interface PublicTactic {
  id: string;
  title: string;
  sport: SportId;
  docState: Uint8Array | null;
}

export interface DataStore {
  readonly mode: "local" | "supabase";

  getMe(): Promise<Profile | null>;
  updateMe(patch: Partial<Pick<Profile, "displayName" | "avatarColor" | "emailDigest">>): Promise<Profile>;
  signOut(): Promise<void>;

  listTeams(): Promise<Team[]>;
  createTeam(name: string): Promise<Team>;
  getTeam(id: string): Promise<Team | null>;
  updateTeam(id: string, patch: { name: string }): Promise<void>;
  deleteTeam(id: string): Promise<void>;

  listMembers(teamId: string): Promise<Member[]>;
  updateMemberRole(teamId: string, userId: string, role: Role): Promise<void>;
  removeMember(teamId: string, userId: string): Promise<void>;

  listInvites(teamId: string): Promise<Invite[]>;
  createInvite(teamId: string, opts: { email?: string; role: Role }): Promise<Invite>;
  deleteInvite(id: string): Promise<void>;
  getInviteInfo(token: string): Promise<InviteInfo | null>;
  acceptInvite(token: string): Promise<string>;

  listTactics(teamId: string): Promise<TacticMeta[]>;
  createTactic(input: {
    teamId: string;
    sport: SportId;
    title: string;
    docState: Uint8Array;
    folder?: string | null;
  }): Promise<TacticMeta>;
  getTactic(id: string): Promise<LoadedTactic | null>;
  updateTactic(
    id: string,
    patch: Partial<Pick<TacticMeta, "title" | "folder" | "tags" | "visibility" | "shareSlug">>,
  ): Promise<TacticMeta>;
  deleteTactic(id: string): Promise<void>;
  saveSnapshot(id: string, update: Uint8Array, opts: { thumbnail?: string; beacon?: boolean }): Promise<void>;
  getPublicTactic(slug: string): Promise<PublicTactic | null>;

  listVersions(tacticId: string): Promise<TacticVersion[]>;
  createVersion(tacticId: string, name: string, state: TacticState): Promise<TacticVersion>;
  deleteVersion(id: string): Promise<void>;

  listComments(tacticId: string): Promise<Comment[]>;
  createComment(input: NewComment): Promise<Comment>;
  updateComment(id: string, patch: { body?: string; resolved?: boolean }): Promise<void>;
  deleteComment(id: string): Promise<void>;
  toggleReaction(comment: Comment, emoji: string): Promise<void>;
  subscribeComments(tacticId: string, cb: () => void): () => void;

  listNotifications(): Promise<Notification[]>;
  markNotificationsRead(ids?: string[]): Promise<void>;
  subscribeNotifications(cb: () => void): () => void;
}
