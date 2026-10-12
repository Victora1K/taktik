"use client";

import { CheckCircle2, Clock, MapPin, MessageSquare, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useShallow } from "zustand/react/shallow";
import { track, useSession } from "@/components/providers";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";
import type { Comment, Member, Profile } from "@/lib/data";
import { useComments } from "@/lib/editor/comments";
import { seek } from "@/lib/editor/clock";
import { useEditor, usePlayback } from "@/lib/editor/store";
import { cn, formatTime, timeAgo } from "@/lib/utils";

const REACTIONS = ["👍", "🔥", "👀", "✅", "❓"];

/** Mentions are written as @Display Name; resolve them against the team roster. */
export function extractMentions(body: string, members: Member[]): string[] {
  const lower = body.toLowerCase();
  return members
    .filter((m) => m.displayName && lower.includes(`@${m.displayName.toLowerCase()}`))
    .map((m) => m.userId);
}

function Markdown({ body, members }: { body: string; members: Member[] }) {
  const highlighted = useMemo(() => {
    let out = body;
    for (const m of members) {
      if (!m.displayName) continue;
      const re = new RegExp(`@${m.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
      out = out.replace(re, (s) => `**${s}**`);
    }
    return out;
  }, [body, members]);
  return (
    <div className="prose-comment break-words text-sm text-slate-200">
      <ReactMarkdown
        disallowedElements={["img", "h1", "h2", "h3"]}
        unwrapDisallowed
        components={{
          a: (p) => (
            <a href={p.href} target="_blank" rel="noopener noreferrer nofollow">
              {p.children}
            </a>
          ),
        }}
      >
        {highlighted}
      </ReactMarkdown>
    </div>
  );
}

function Composer({
  members,
  placeholder,
  onSubmit,
  autoFocus,
  initial = "",
  submitLabel = "Comment",
  onCancel,
  children,
}: {
  members: Member[];
  placeholder: string;
  onSubmit: (body: string) => Promise<void>;
  autoFocus?: boolean;
  initial?: string;
  submitLabel?: string;
  onCancel?: () => void;
  children?: React.ReactNode;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const mention = /@([\w ]{0,20})$/.exec(body.slice(0, ref.current?.selectionStart ?? body.length));
  const query = mention?.[1]?.toLowerCase() ?? null;
  const suggestions =
    query !== null
      ? members.filter((m) => m.displayName.toLowerCase().startsWith(query.trim())).slice(0, 5)
      : [];

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setBody("");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  function insertMention(m: Member) {
    const pos = ref.current?.selectionStart ?? body.length;
    const before = body.slice(0, pos).replace(/@([\w ]{0,20})$/, `@${m.displayName} `);
    setBody(before + body.slice(pos));
    ref.current?.focus();
  }

  return (
    <div className="relative space-y-2">
      <Textarea
        ref={ref}
        value={body}
        autoFocus={autoFocus}
        rows={2}
        maxLength={5000}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          if (e.key === "Escape") onCancel?.();
        }}
        aria-label={placeholder}
      />
      {suggestions.length > 0 && (
        <ul className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-ink-700 bg-ink-900 p-1 shadow-lg">
          {suggestions.map((m) => (
            <li key={m.userId}>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-ink-800"
                onClick={() => insertMention(m)}
              >
                <Avatar name={m.displayName} color={m.avatarColor} size={20} /> {m.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <div className="ml-auto flex gap-1">
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={!body.trim() || busy} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CommentsPanel({
  me,
  members,
  tacticId,
}: {
  me: Profile;
  members: Member[];
  tacticId: string;
}) {
  const { data } = useSession();
  const comments = useComments((s) => s.comments);
  const { pendingPin, focusedCommentId } = useEditor(
    useShallow((s) => ({ pendingPin: s.pendingPin, focusedCommentId: s.focusedCommentId })),
  );
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [pinTime, setPinTime] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const roots = comments.filter(
    (c) => !c.parentId && (filter === "all" || (filter === "open" ? !c.resolved : c.resolved)),
  );
  const replies = (id: string) => comments.filter((c) => c.parentId === id);

  useEffect(() => {
    if (!focusedCommentId) return;
    const c = comments.find((x) => x.id === focusedCommentId);
    if (c?.resolved && filter === "open") setFilter("all");
    listRef.current
      ?.querySelector(`[data-comment="${focusedCommentId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedCommentId, comments, filter]);

  async function refresh() {
    useComments.setState({ comments: await data.listComments(tacticId) });
  }

  async function post(body: string, parentId: string | null) {
    const time = usePlayback.getState().time;
    const pin = parentId ? null : useEditor.getState().pendingPin;
    await data.createComment({
      tacticId,
      parentId,
      body,
      mentions: extractMentions(body, members),
      anchorMs: parentId ? null : pinTime ? Math.round(time) : null,
      anchorX: pin?.x ?? null,
      anchorY: pin?.y ?? null,
    });
    track("comment_created", { reply: !!parentId, pinned: !!pin });
    if (!parentId) useEditor.setState({ pendingPin: null });
    setReplyTo(null);
    await refresh();
  }

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toastError(e);
    }
  }

  function renderComment(c: Comment, isReply = false) {
    const mine = c.authorId === me.id;
    return (
      <div key={c.id} className={cn("group", isReply && "ml-8 mt-2")} data-comment={c.id}>
        <div className="flex items-start gap-2">
          <Avatar name={c.authorName} color={c.authorColor} size={isReply ? 22 : 26} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-semibold text-slate-100">{c.authorName}</span>
              <span className="text-slate-500">{timeAgo(c.createdAt)}</span>
              {c.anchorMs != null && (
                <button
                  className="inline-flex items-center gap-0.5 rounded bg-ink-800 px-1.5 text-[11px] text-brand-400 hover:bg-ink-700"
                  onClick={() => {
                    seek(c.anchorMs!);
                    useEditor.setState({ focusedCommentId: c.id });
                  }}
                  title="Jump to this moment"
                >
                  <Clock size={10} /> {formatTime(c.anchorMs)}
                </button>
              )}
              {c.anchorX != null && (
                <button
                  className="inline-flex items-center gap-0.5 rounded bg-ink-800 px-1.5 text-[11px] text-amber-300 hover:bg-ink-700"
                  onClick={() => useEditor.setState({ focusedCommentId: c.id })}
                  title="Show the pin on the field"
                >
                  <MapPin size={10} /> pin
                </button>
              )}
            </div>
            {editing === c.id ? (
              <div className="mt-1">
                <Composer
                  members={members}
                  initial={c.body}
                  placeholder="Edit comment"
                  submitLabel="Save"
                  autoFocus
                  onCancel={() => setEditing(null)}
                  onSubmit={async (body) => {
                    await data.updateComment(c.id, { body });
                    setEditing(null);
                    await refresh();
                  }}
                />
              </div>
            ) : (
              <Markdown body={c.body} members={members} />
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {c.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => act(() => data.toggleReaction(c, r.emoji))}
                  className={cn(
                    "rounded-full border px-1.5 text-xs",
                    r.userIds.includes(me.id) ? "border-brand-500/60 bg-brand-500/15" : "border-ink-700",
                  )}
                  aria-label={`${r.emoji} ${r.userIds.length}`}
                >
                  {r.emoji} {r.userIds.length}
                </button>
              ))}
              <span className="flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                {REACTIONS.filter((e) => !c.reactions.some((r) => r.emoji === e)).map((e) => (
                  <button
                    key={e}
                    className="rounded px-1 text-xs hover:bg-ink-800"
                    onClick={() => act(() => data.toggleReaction(c, e))}
                    aria-label={`React ${e}`}
                  >
                    {e}
                  </button>
                ))}
                {!isReply && (
                  <button
                    className="rounded px-1.5 text-xs text-slate-400 hover:bg-ink-800"
                    onClick={() => setReplyTo(c.id)}
                  >
                    Reply
                  </button>
                )}
                {!isReply && (
                  <button
                    className="rounded px-1 text-slate-400 hover:bg-ink-800"
                    title={c.resolved ? "Reopen" : "Resolve"}
                    aria-label={c.resolved ? "Reopen" : "Resolve"}
                    onClick={() => act(() => data.updateComment(c.id, { resolved: !c.resolved }))}
                  >
                    {c.resolved ? <RotateCcw size={12} /> : <CheckCircle2 size={12} />}
                  </button>
                )}
                {mine && (
                  <button
                    className="rounded px-1 text-slate-400 hover:bg-ink-800"
                    aria-label="Edit"
                    onClick={() => setEditing(c.id)}
                  >
                    <Pencil size={12} />
                  </button>
                )}
                {mine && (
                  <button
                    className="rounded px-1 text-slate-400 hover:bg-ink-800 hover:text-red-400"
                    aria-label="Delete"
                    onClick={() =>
                      window.confirm("Delete this comment?") && act(() => data.deleteComment(c.id))
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-3">
        <Composer
          members={members}
          placeholder="Discuss this tactic... use @ to mention"
          onSubmit={(b) => post(b, null)}
        >
          <label className="flex items-center gap-1 text-xs text-slate-400">
            <input type="checkbox" checked={pinTime} onChange={(e) => setPinTime(e.target.checked)} />
            <Clock size={12} /> at {formatTime(usePlayback.getState().time)}
          </label>
          {pendingPin ? (
            <span className="inline-flex items-center gap-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-xs text-brand-400">
              <MapPin size={12} /> pinned
              <button onClick={() => useEditor.setState({ pendingPin: null })} aria-label="Remove pin">
                <X size={12} />
              </button>
            </span>
          ) : (
            <button
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
              onClick={() => useEditor.setState({ tool: "pin" })}
            >
              <MapPin size={12} /> Pin on field
            </button>
          )}
        </Composer>
      </div>
      <div className="flex gap-1 px-3 pt-2 text-xs">
        {(["open", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded px-2 py-0.5 capitalize",
              filter === f ? "bg-ink-700 text-white" : "text-slate-400 hover:text-white",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {roots.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500">
            <MessageSquare size={22} />
            {filter === "open" ? "No open comments. Start the discussion above." : "Nothing here."}
          </div>
        )}
        {roots.map((c) => (
          <div
            key={c.id}
            className={cn(
              "rounded-lg p-2",
              c.id === focusedCommentId && "bg-brand-500/10 ring-1 ring-brand-500/40",
              c.resolved && "opacity-60",
            )}
          >
            {renderComment(c)}
            {replies(c.id).map((r) => renderComment(r, true))}
            {replyTo === c.id && (
              <div className="ml-8 mt-2">
                <Composer
                  members={members}
                  placeholder="Reply..."
                  autoFocus
                  submitLabel="Reply"
                  onCancel={() => setReplyTo(null)}
                  onSubmit={(b) => post(b, c.id)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
