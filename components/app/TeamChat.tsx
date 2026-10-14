"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/components/providers";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";
import { isAdmin, type ChatMessage, type Role } from "@/lib/data";
import { cn, timeAgo } from "@/lib/utils";

const PAGE = 50;

function mergeLatest(prev: ChatMessage[], latest: ChatMessage[]): ChatMessage[] {
  if (!latest.length) return prev;
  const start = latest[0].createdAt;
  const seen = new Set(latest.map((m) => m.id));
  const older = prev.filter((m) => m.createdAt < start && !seen.has(m.id));
  return [...older, ...latest];
}

export function TeamChat({ teamId, role }: { teamId: string; role: Role }) {
  const { data, me } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const olderAnchor = useRef(0);
  const admin = isAdmin(role);

  const refresh = useCallback(async () => {
    const latest = await data.listMessages(teamId, { limit: PAGE });
    setMessages((prev) => (prev.length ? mergeLatest(prev, latest) : latest));
    setHasMore((more) => more || latest.length === PAGE);
  }, [data, teamId]);

  useEffect(() => {
    let alive = true;
    data
      .listMessages(teamId, { limit: PAGE })
      .then((page) => {
        if (!alive) return;
        setMessages(page);
        setHasMore(page.length === PAGE);
        stick.current = true;
      })
      .catch(toastError)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [data, teamId]);

  useEffect(() => {
    return data.subscribeMessages(teamId, (change) => {
      if (change?.deletedId) {
        setMessages((prev) => prev.filter((m) => m.id !== change.deletedId));
        return;
      }
      void refresh().catch(toastError);
    });
  }, [data, teamId, refresh]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (olderAnchor.current) {
      el.scrollTop = el.scrollHeight - olderAnchor.current;
      olderAnchor.current = 0;
      return;
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadOlder() {
    const oldest = messages[0];
    const el = scroller.current;
    if (!oldest || !el) return;
    olderAnchor.current = el.scrollHeight;
    try {
      const page = await data.listMessages(teamId, { before: oldest.createdAt, limit: PAGE });
      setHasMore(page.length === PAGE);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...page.filter((m) => !seen.has(m.id)), ...prev];
      });
    } catch (e) {
      olderAnchor.current = 0;
      toastError(e);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const message = await data.sendMessage(teamId, text);
      setDraft("");
      stick.current = true;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await data.deleteMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {hasMore && (
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" onClick={() => void loadOlder()}>
              Load earlier messages
            </Button>
          </div>
        )}
        {loading && <p className="text-center text-sm text-slate-500">Loading chat...</p>}
        {!loading && messages.length === 0 && (
          <p className="px-6 py-16 text-center text-sm text-slate-500">
            No messages yet. Say hello to the team. Anyone who joins later can read this history.
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const grouped =
            prev?.authorId === m.authorId &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
          const mine = m.authorId === me?.id;
          return (
            <div key={m.id} className={cn("group flex gap-2.5", grouped && "mt-1")}>
              {grouped ? (
                <span className="w-8 shrink-0" />
              ) : (
                <Avatar name={m.authorName} color={m.authorColor} size={32} />
              )}
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="mb-0.5 flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{m.authorName}</span>
                    <time className="text-xs text-slate-500" dateTime={m.createdAt}>
                      {timeAgo(m.createdAt)}
                    </time>
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{m.body}</p>
              </div>
              {(mine || admin) && (
                <button
                  type="button"
                  className="self-start text-xs text-slate-500 opacity-0 hover:text-red-300 group-hover:opacity-100"
                  onClick={() => void remove(m.id)}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="flex items-end gap-2 border-t border-ink-800 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={draft}
          rows={2}
          maxLength={2000}
          placeholder="Message the team"
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="submit" variant="primary" disabled={busy || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
