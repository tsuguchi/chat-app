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

export type ChatAttachment = {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  signed_url: string;
};
type AttachmentsByMessage = Map<string, ChatAttachment[]>;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export type { MentionableUser };

const COMMON_EMOJIS = ["👍", "👎", "❤️", "😂", "😮", "😢", "😡", "🎉", "🚀", "👀", "✅", "❌"];

type Props = {
  channelId: string;
  initialMessages: ChatMessage[];
  initialProfiles: ChatProfile[];
  initialReplyCounts: Record<string, number>;
  initialReactions: ReactionRow[];
  initialAttachments: ChatAttachment[];
  mentionableUsers: MentionableUser[];
  currentUserId: string;
};

function buildAttachmentMap(rows: ChatAttachment[]): AttachmentsByMessage {
  const map: AttachmentsByMessage = new Map();
  for (const a of rows) {
    const list = map.get(a.message_id) ?? [];
    list.push(a);
    map.set(a.message_id, list);
  }
  return map;
}

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function isImage(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

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
  initialAttachments,
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

  const [attachments, setAttachments] = useState<AttachmentsByMessage>(() =>
    buildAttachmentMap(initialAttachments),
  );

  const [threadParentId, setThreadParentId] = useState<string | null>(null);

  // Stable client. createBrowserClient is a singleton; useMemo avoids tearing
  // the subscription down on every render.
  const supabase = useMemo(() => createClient(), []);

  // Realtime: one channel per table. Bundling multiple `postgres_changes`
  // listeners on a single channel started dropping deliveries once we hit
  // four — splitting them into separate channels keeps each subscription
  // independent and reliable.
  useEffect(() => {
    let cancelled = false;
    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      const messagesChannel = supabase
        .channel(`channel-${channelId}-messages`)
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
              setReplyCounts((prev) => ({
                ...prev,
                [row.parent_message_id!]: (prev[row.parent_message_id!] ?? 0) + 1,
              }));
            } else {
              setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
            }

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
      channels.push(messagesChannel);

      const reactionsChannel = supabase
        .channel(`channel-${channelId}-reactions`)
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
      channels.push(reactionsChannel);

      const attachmentsChannel = supabase
        .channel(`channel-${channelId}-attachments`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "message_attachments" },
          async (payload) => {
            const row = payload.new as {
              id: string;
              message_id: string;
              storage_path: string;
              file_name: string;
              mime_type: string | null;
              size_bytes: number | null;
            };
            const { data: signed } = await supabase.storage
              .from("attachments")
              .createSignedUrl(row.storage_path, 3600);
            const att: ChatAttachment = {
              ...row,
              signed_url: signed?.signedUrl ?? "",
            };
            setAttachments((prev) => {
              const list = prev.get(row.message_id) ?? [];
              if (list.some((x) => x.id === att.id)) return prev;
              const next = new Map(prev);
              next.set(row.message_id, [...list, att]);
              return next;
            });
          },
        )
        .subscribe();
      channels.push(attachmentsChannel);
    })();

    return () => {
      cancelled = true;
      for (const c of channels) supabase.removeChannel(c);
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
          attachments={attachments}
          currentUserId={currentUserId}
          onOpenThread={openThread}
          onToggleReaction={toggleReaction}
        />
        <Composer
          channelId={channelId}
          parentMessageId={null}
          mentionableUsers={mentionableUsers}
          supabase={supabase}
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
          attachments={attachments}
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
  attachments,
  currentUserId,
  onOpenThread,
  onToggleReaction,
}: {
  messages: ChatMessage[];
  profiles: Map<string, ChatProfile>;
  replyCounts: Record<string, number>;
  reactions: ReactionsByMessage;
  attachments: AttachmentsByMessage;
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
              attachments={attachments.get(m.id) ?? []}
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
  attachments,
  onReply,
  onToggleReaction,
}: {
  message: ChatMessage;
  profile: ChatProfile | null;
  isMine: boolean;
  replyCount: number;
  reactionSummary: ReactionSummary[];
  attachments: ChatAttachment[];
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
        {message.body && <MessageBody body={message.body} />}
        <AttachmentList attachments={attachments} />
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

type BrowserClient = ReturnType<typeof createClient>;

function Composer({
  channelId,
  parentMessageId,
  mentionableUsers,
  supabase,
  placeholder,
}: {
  channelId: string;
  parentMessageId: string | null;
  mentionableUsers: MentionableUser[];
  supabase: BrowserClient;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const added: File[] = [];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`「${f.name}」は 10MB を超えています。`);
        continue;
      }
      added.push(f);
    }
    if (added.length > 0) {
      setFiles((prev) => [...prev, ...added]);
      setError(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const canSend = !sending && (draft.trim().length > 0 || files.length > 0);

  const submit = useCallback(async () => {
    if (sending) return;
    if (!draft.trim() && files.length === 0) return;
    setSending(true);
    setError(null);

    // Upload files first; the path encodes the channel so storage RLS can
    // validate membership without a separate lookup.
    const uploaded: {
      storage_path: string;
      file_name: string;
      mime_type: string | null;
      size_bytes: number;
    }[] = [];
    for (const file of files) {
      const uuid = crypto.randomUUID();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${channelId}/${uuid}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (upErr) {
        setError(`アップロード失敗: ${upErr.message}`);
        setSending(false);
        return;
      }
      uploaded.push({
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
    }

    const result = await sendMessage(channelId, draft, parentMessageId, uploaded);
    setSending(false);
    if (result.ok) {
      setDraft("");
      setFiles([]);
    } else {
      setError(result.error);
    }
  }, [channelId, draft, files, parentMessageId, sending, supabase]);

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {error && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700"
            >
              <span className="truncate max-w-[12rem]">{f.name}</span>
              <span className="text-gray-400">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-gray-400 hover:text-red-600"
                aria-label="削除"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          aria-label="ファイルを添付"
          title="ファイルを添付"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
        />
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
          disabled={!canSend}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {sending ? "送信中..." : "送信"}
        </button>
      </div>
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: ChatAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {attachments.map((a) =>
        isImage(a.mime_type) && a.signed_url ? (
          <li key={a.id}>
            <a href={a.signed_url} target="_blank" rel="noopener noreferrer">
              {/* Signed URLs change every hour, so next/image's loader does
                  not help. Using a plain <img> is intentional here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.signed_url}
                alt={a.file_name}
                className="max-h-80 max-w-md rounded-md border border-gray-200 object-contain"
              />
            </a>
            <p className="mt-0.5 text-xs text-gray-500">
              {a.file_name} {a.size_bytes ? `· ${formatBytes(a.size_bytes)}` : ""}
            </p>
          </li>
        ) : (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
          >
            <span className="text-lg">📄</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-gray-900">{a.file_name}</p>
              <p className="text-xs text-gray-500">
                {a.mime_type ?? "unknown"} · {formatBytes(a.size_bytes ?? 0)}
              </p>
            </div>
            {a.signed_url && (
              <a
                href={a.signed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                ダウンロード
              </a>
            )}
          </li>
        ),
      )}
    </ul>
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
  attachments,
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
  attachments: AttachmentsByMessage;
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
              attachments={attachments.get(parent.id) ?? []}
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
                  attachments={attachments.get(m.id) ?? []}
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
        supabase={supabase}
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
  attachments,
  onToggleReaction,
  emphasize = false,
}: {
  message: ChatMessage;
  profile: ChatProfile | null;
  isMine: boolean;
  reactionSummary: ReactionSummary[];
  attachments: ChatAttachment[];
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
        {message.body && <MessageBody body={message.body} />}
        <AttachmentList attachments={attachments} />
        <ReactionBar summary={reactionSummary} onToggle={onToggleReaction} alwaysShowAdd={false} />
      </div>
    </li>
  );
}
