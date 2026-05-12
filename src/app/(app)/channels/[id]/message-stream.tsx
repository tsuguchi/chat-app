"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "./actions";
import { MentionTextarea, type MentionableUser } from "./mention-textarea";

export type ChatProfile = { id: string; display_name: string; avatar_url: string | null };

export type ChatMessage = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_message_id: string | null;
};

export type { MentionableUser };

type Props = {
  channelId: string;
  initialMessages: ChatMessage[];
  initialProfiles: ChatProfile[];
  initialReplyCounts: Record<string, number>;
  mentionableUsers: MentionableUser[];
  currentUserId: string;
};

export function MessageStream({
  channelId,
  initialMessages,
  initialProfiles,
  initialReplyCounts,
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
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [channelId, supabase]);

  const openThread = useCallback((parentId: string) => setThreadParentId(parentId), []);
  const closeThread = useCallback(() => setThreadParentId(null), []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className={`flex flex-col ${threadParentId ? "flex-1 border-r border-gray-200" : "flex-1"}`}
      >
        <MessageList
          messages={messages}
          profiles={profiles}
          replyCounts={replyCounts}
          currentUserId={currentUserId}
          onOpenThread={openThread}
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
          currentUserId={currentUserId}
          onClose={closeThread}
        />
      )}
    </div>
  );
}

function MessageList({
  messages,
  profiles,
  replyCounts,
  currentUserId,
  onOpenThread,
}: {
  messages: ChatMessage[];
  profiles: Map<string, ChatProfile>;
  replyCounts: Record<string, number>;
  currentUserId: string;
  onOpenThread: (parentId: string) => void;
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
              onReply={() => onOpenThread(m.id)}
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
  onReply,
}: {
  message: ChatMessage;
  profile: ChatProfile | null;
  isMine: boolean;
  replyCount: number;
  onReply: () => void;
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
  currentUserId,
  onClose,
}: {
  channelId: string;
  parentId: string;
  profiles: Map<string, ChatProfile>;
  setProfiles: React.Dispatch<React.SetStateAction<Map<string, ChatProfile>>>;
  mentionableUsers: MentionableUser[];
  currentUserId: string;
  onClose: () => void;
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
  emphasize = false,
}: {
  message: ChatMessage;
  profile: ChatProfile | null;
  isMine: boolean;
  emphasize?: boolean;
}) {
  return (
    <li
      className={`flex gap-3 ${emphasize ? "rounded-md border border-blue-100 bg-blue-50 p-2" : ""}`}
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
      </div>
    </li>
  );
}
