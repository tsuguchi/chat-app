"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addReaction, removeReaction, sendMessage } from "./actions";
import { MentionTextarea, type MentionableUser } from "./mention-textarea";

export type ChatProfile = { id: string; display_name: string; avatar_url: string | null };

export type ChatMessage = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_message_id: string | null;
};

export type ReactionRow = { message_id: string; user_id: string; emoji: string };
type ReactionSummary = { emoji: string; count: number; hasMine: boolean };
type ReactionsByMessage = Map<string, ReactionRow[]>;

export type { MentionableUser };

const COMMON_EMOJIS = ["👍", "👎", "❤️", "😂", "😮", "😢", "😡", "🎉", "🚀", "👀", "✅", "❌"];

type Props = {
  channelId: string;
  initialMessages: ChatMessage[];
  initialProfiles: ChatProfile[];
  initialReplyCounts: Record<string, number>;
  initialReactions: ReactionRow[];
  mentionableUsers: MentionableUser[];
  currentUserId: string;
};

function buildReactionMap(rows: ReactionRow[]): ReactionsByMessage {
  const map: ReactionsByMessage = new Map();
  for (const r of rows) {
    const list = map.get(r.message_id) ?? [];
    list.push(r);
    map.set(r.message_id, list);
  }
  return map;
}

function summarizeReactions(
  rows: ReactionRow[] | undefined,
  currentUserId: string,
): ReactionSummary[] {
  if (!rows || rows.length === 0) return [];
  const byEmoji = new Map<string, { count: number; hasMine: boolean }>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, hasMine: false };
    cur.count += 1;
    if (r.user_id === currentUserId) cur.hasMine = true;
    byEmoji.set(r.emoji, cur);
  }
  return Array.from(byEmoji, ([emoji, info]) => ({ emoji, ...info })).sort(
    (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji),
  );
}

export function MessageStream({
  channelId,
  initialMessages,
  initialProfiles,
  initialReplyCounts,
  initialReactions,
  mentionableUsers,
  currentUserId,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [profiles, setProfiles] = useState<Map<string, ChatProfile>>(
    () => new Map(initialProfiles.map((p) => [p.id, p])),
  );
  const profilesRef = useRef(profiles);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  const [replyCounts, setReplyCounts] = useState<Record<string, number>>(initialReplyCounts);

  const [reactions, setReactions] = useState<ReactionsByMessage>(() =>
    buildReactionMap(initialReactions),
  );

  const [threadParentId, setThreadParentId] = useState<string | null>(null);

  // Stable client. createBrowserClient is a singleton; useMemo avoids tearing
  // the subscription down on every render.
  const supabase = useMemo(() => createClient(), []);

  // Realtime subscription: route INSERTs to main list, reply counts, and/or
  // the open thread panel based on parent_message_id.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`messages:channel:${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const row = payload.new as ChatMessage;
            if (row.parent_message_id) {
              // Reply: bump reply count.
              setReplyCounts((prev) => ({
                ...prev,
                [row.parent_message_id!]: (prev[row.parent_message_id!] ?? 0) + 1,
              }));
            } else {
              // Top-level: append to main list (dedupe).
              setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
            }

            // Lazy-load author profile if unknown.
            if (!profilesRef.current.has(row.user_id)) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("id, display_name, avatar_url")
                .eq("id", row.user_id)
                .maybeSingle();
              if (prof) {
                setProfiles((prev) => new Map(prev).set(prof.id, prof));
              }
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "message_reactions" },
          (payload) => {
            const row = payload.new as ReactionRow;
            setReactions((prev) => {
              const list = prev.get(row.message_id);
              if (list && list.some((r) => r.user_id === row.user_id && r.emoji === row.emoji)) {
                return prev;
              }
              const next = new Map(prev);
              next.set(row.message_id, [...(list ?? []), row]);
              return next;
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "message_reactions" },
          (payload) => {
            const old = payload.old as ReactionRow;
            setReactions((prev) => {
              const list = prev.get(old.message_id);
              if (!list) return prev;
              const next = list.filter(
                (r) => !(r.user_id === old.user_id && r.emoji === old.emoji),
              );
              const map = new Map(prev);
              if (next.length === 0) map.delete(old.message_id);
              else map.set(old.message_id, next);
              return map;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [channelId, supabase]);

  const openThread = useCallback((parentId: string) => setThreadParentId(parentId), []);
  const closeThread = useCallback(() => setThreadParentId(null), []);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      // Optimistic update: realtime will eventually echo, but we should not
      // wait a round trip to repaint the pill.
      let hasMineNow = false;
      setReactions((prev) => {
        const list = prev.get(messageId) ?? [];
        hasMineNow = list.some((r) => r.user_id === currentUserId && r.emoji === emoji);
        const next = hasMineNow
          ? list.filter((r) => !(r.user_id === currentUserId && r.emoji === emoji))
          : [...list, { message_id: messageId, user_id: currentUserId, emoji }];
        const map = new Map(prev);
        if (next.length === 0) map.delete(messageId);
        else map.set(messageId, next);
        return map;
      });
      if (hasMineNow) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    },
    [currentUserId],
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className={`flex flex-col ${threadParentId ? "flex-1 border-r border-gray-200" : "flex-1"}`}
      >
        <MessageList
          messages={messages}
          profiles={profiles}
          replyCounts={replyCounts}
          reactions={reactions}
          currentUserId={currentUserId}
          onOpenThread={openThread}
          onToggleReaction={toggleReaction}
        />
        <Composer
          channelId={channelId}
          parentMessageId={null}
          mentionableUsers={mentionableUsers}
          placeholder="メッセージを入力 (@ でメンション、Enter で送信、Shift+Enter で改行)"
        />
      </div>

      {threadParentId && (
        <ThreadPanel
          key={threadParentId}
          channelId={channelId}
          parentId={threadParentId}
          profiles={profiles}
          setProfiles={setProfiles}
          mentionableUsers={mentionableUsers}
          reactions={reactions}
          currentUserId={currentUserId}
          onClose={closeThread}
          onToggleReaction={toggleReaction}
        />
      )}
    </div>
  );
}

function MessageList({
  messages,
  profiles,
  replyCounts,
  reactions,
  currentUserId,
  onOpenThread,
  onToggleReaction,
}: {
  messages: ChatMessage[];
  profiles: Map<string, ChatProfile>;
  replyCounts: Record<string, number>;
  reactions: ReactionsByMessage;
  currentUserId: string;
  onOpenThread: (parentId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-gray-400">
          まだメッセージがありません。最初の一通を送ってみましょう。
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              profile={profiles.get(m.user_id) ?? null}
              isMine={m.user_id === currentUserId}
              replyCount={replyCounts[m.id] ?? 0}
              reactionSummary={summarizeReactions(reactions.get(m.id), currentUserId)}
              onReply={() => onOpenThread(m.id)}
              onToggleReaction={(emoji) => onToggleReaction(m.id, emoji)}
            />
          ))}
        </ul>
      )}
      <div ref={endRef} />
    </div>
  );
}

function MessageRow({
  message,
  profile,
  isMine,
  replyCount,
  reactionSummary,
  onReply,
  onToggleReaction,
}: {
  message: ChatMessage;
  profile: ChatProfile | null;
  isMine: boolean;
  replyCount: number;
  reactionSummary: ReactionSummary[];
  onReply: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  return (
    <li className="group flex gap-3">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
        {(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {profile?.display_name ?? "Unknown"}
            {isMine && <span className="ml-1 text-xs text-gray-400">(you)</span>}
          </span>
          <time className="text-xs text-gray-400" dateTime={message.created_at}>
            {new Date(message.created_at).toLocaleString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        <MessageBody body={message.body} />
        <ReactionBar summary={reactionSummary} onToggle={onToggleReaction} alwaysShowAdd={false} />
        <div className="mt-1 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={onReply}
            className="text-gray-500 opacity-0 hover:text-blue-600 group-hover:opacity-100"
          >
            💬 返信
          </button>
          {replyCount > 0 && (
            <button
              type="button"
              onClick={onReply}
              className="font-medium text-blue-600 hover:underline"
            >
              返信 {replyCount} 件
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ReactionBar({
  summary,
  onToggle,
  alwaysShowAdd,
}: {
  summary: ReactionSummary[];
  onToggle: (emoji: string) => void;
  alwaysShowAdd: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasAny = summary.length > 0;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {summary.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
            r.hasMine
              ? "border-blue-300 bg-blue-50 text-blue-900"
              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-medium">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={`rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 ${
            alwaysShowAdd || hasAny ? "" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label="リアクションを追加"
        >
          😊+
        </button>
        {pickerOpen && (
          <div
            className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 rounded-md border border-gray-200 bg-white p-2 shadow-lg"
            onMouseLeave={() => setPickerOpen(false)}
          >
            {COMMON_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onToggle(e);
                  setPickerOpen(false);
                }}
                className="rounded p-1 text-lg hover:bg-gray-100"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  channelId,
  parentMessageId,
  mentionableUsers,
  placeholder,
}: {
  channelId: string;
  parentMessageId: string | null;
  mentionableUsers: MentionableUser[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (sending) return;
    const body = draft;
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    const result = await sendMessage(channelId, body, parentMessageId);
    setSending(false);
    if (result.ok) {
      setDraft("");
    } else {
      setError(result.error);
    }
  }, [channelId, draft, parentMessageId, sending]);

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {error && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          users={mentionableUsers}
          placeholder={placeholder}
          rows={2}
          maxLength={4000}
          disabled={sending}
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || !draft.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          送信
        </button>
      </div>
    </div>
  );
}

const MENTION_RE = /(?:^|\s)(@[A-Za-z0-9_]{1,32})\b/g;

function MessageBody({ body }: { body: string }) {
  const parts = useMemo(() => {
    const out: Array<{ kind: "text" | "mention"; value: string }> = [];
    let lastIndex = 0;
    for (const m of body.matchAll(MENTION_RE)) {
      const handle = m[1];
      const idx = (m.index ?? 0) + m[0].indexOf(handle);
      if (idx > lastIndex) out.push({ kind: "text", value: body.slice(lastIndex, idx) });
      out.push({ kind: "mention", value: handle });
      lastIndex = idx + handle.length;
    }
    if (lastIndex < body.length) out.push({ kind: "text", value: body.slice(lastIndex) });
    return out;
  }, [body]);

  return (
    <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
      {parts.map((p, i) =>
        p.kind === "mention" ? (
          <span
            key={i}
            className="rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-800"
          >
            {p.value}
          </span>
        ) : (
          <Fragment key={i}>{p.value}</Fragment>
        ),
      )}
    </p>
  );
}

function ThreadPanel({
  channelId,
  parentId,
  profiles,
  setProfiles,
  mentionableUsers,
  reactions,
  currentUserId,
  onClose,
  onToggleReaction,
}: {
  channelId: string;
  parentId: string;
  profiles: Map<string, ChatProfile>;
  setProfiles: React.Dispatch<React.SetStateAction<Map<string, ChatProfile>>>;
  mentionableUsers: MentionableUser[];
  reactions: ReactionsByMessage;
  currentUserId: string;
  onClose: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const [parent, setParent] = useState<ChatMessage | null>(null);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  // Load parent + existing replies on mount (component is keyed by parentId,
  // so a new parentId remounts and starts fresh with loading=true).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: parentRow }, { data: replyRows }] = await Promise.all([
        supabase
          .from("messages")
          .select("id, body, created_at, user_id, parent_message_id")
          .eq("id", parentId)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("id, body, created_at, user_id, parent_message_id")
          .eq("parent_message_id", parentId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setParent((parentRow ?? null) as ChatMessage | null);
      setReplies((replyRows ?? []) as ChatMessage[]);

      // Fetch any unknown author profiles in this thread.
      const allAuthors = new Set<string>();
      if (parentRow) allAuthors.add(parentRow.user_id);
      for (const r of replyRows ?? []) allAuthors.add(r.user_id);
      const missing = Array.from(allAuthors).filter((id) => !profiles.has(id));
      if (missing.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", missing);
        if (!cancelled && profs) {
          setProfiles((prev) => {
            const next = new Map(prev);
            for (const p of profs) next.set(p.id, p as ChatProfile);
            return next;
          });
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [parentId, supabase, profiles, setProfiles]);

  // Realtime subscription scoped to this thread.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`thread:${parentId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `parent_message_id=eq.${parentId}`,
          },
          (payload) => {
            const row = payload.new as ChatMessage;
            setReplies((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [parentId, supabase]);

  return (
    <aside className="flex w-96 flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">スレッド</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="閉じる"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">読み込み中...</div>
        ) : !parent ? (
          <div className="py-8 text-center text-sm text-gray-400">
            親メッセージが見つかりません。
          </div>
        ) : (
          <>
            <ThreadMessage
              message={parent}
              profile={profiles.get(parent.user_id) ?? null}
              isMine={parent.user_id === currentUserId}
              reactionSummary={summarizeReactions(reactions.get(parent.id), currentUserId)}
              onToggleReaction={(emoji) => onToggleReaction(parent.id, emoji)}
              emphasize
            />
            {replies.length > 0 && (
              <div className="my-3 flex items-center gap-2 text-xs text-gray-400">
                <hr className="flex-1 border-gray-200" />
                <span>{replies.length} 件の返信</span>
                <hr className="flex-1 border-gray-200" />
              </div>
            )}
            <ul className="space-y-3">
              {replies.map((m) => (
                <ThreadMessage
                  key={m.id}
                  message={m}
                  profile={profiles.get(m.user_id) ?? null}
                  isMine={m.user_id === currentUserId}
                  reactionSummary={summarizeReactions(reactions.get(m.id), currentUserId)}
                  onToggleReaction={(emoji) => onToggleReaction(m.id, emoji)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <Composer
        channelId={channelId}
        parentMessageId={parentId}
        mentionableUsers={mentionableUsers}
        placeholder="スレッドに返信 (@ でメンション)"
      />
    </aside>
  );
}

function ThreadMessage({
  message,
  profile,
  isMine,
  reactionSummary,
  onToggleReaction,
  emphasize = false,
}: {
  message: ChatMessage;
  profile: ChatProfile | null;
  isMine: boolean;
  reactionSummary: ReactionSummary[];
  onToggleReaction: (emoji: string) => void;
  emphasize?: boolean;
}) {
  return (
    <li
      className={`group flex gap-3 ${emphasize ? "rounded-md border border-blue-100 bg-blue-50 p-2" : ""}`}
    >
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
        {(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-gray-900">
            {profile?.display_name ?? "Unknown"}
            {isMine && <span className="ml-1 text-xs text-gray-400">(you)</span>}
          </span>
          <time className="text-xs text-gray-400" dateTime={message.created_at}>
            {new Date(message.created_at).toLocaleString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        <MessageBody body={message.body} />
        <ReactionBar summary={reactionSummary} onToggle={onToggleReaction} alwaysShowAdd={false} />
      </div>
    </li>
  );
}
