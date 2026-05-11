"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "./actions";

export type ChatProfile = { id: string; display_name: string; avatar_url: string | null };

export type ChatMessage = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
};

type Props = {
  channelId: string;
  initialMessages: ChatMessage[];
  initialProfiles: ChatProfile[];
  currentUserId: string;
};

export function MessageStream({
  channelId,
  initialMessages,
  initialProfiles,
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
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  // Stable client across renders. createBrowserClient is a singleton anyway,
  // but useMemo also avoids re-running the subscription useEffect.
  const supabase = useMemo(() => createClient(), []);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription for new messages in this channel.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Ensure realtime has the current user's JWT so RLS-protected
      // postgres_changes events on `messages` are delivered.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
        console.log("[realtime] auth set, user:", session.user.id);
      } else {
        console.warn("[realtime] no session — INSERT events will be blocked by RLS");
      }

      console.log("[realtime] subscribing to channel:", channelId);
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
            console.log("[realtime] INSERT event received:", payload);
            const row = payload.new as ChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));

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
        .subscribe((status, err) => {
          console.log("[realtime] subscription status:", status, err ?? "");
        });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        console.log("[realtime] removing channel:", channelId);
        supabase.removeChannel(channel);
      }
    };
  }, [channelId, supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const body = draft;
    setSending(true);
    setError(null);
    const result = await sendMessage(channelId, body);
    setSending(false);
    if (result.ok) {
      setDraft("");
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            まだメッセージがありません。最初の一通を送ってみましょう。
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const profile = profiles.get(m.user_id);
              const isMine = m.user_id === currentUserId;
              return (
                <li key={m.id} className="flex gap-3">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                    {(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {profile?.display_name ?? "Unknown"}
                        {isMine && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                      </span>
                      <time className="text-xs text-gray-400" dateTime={m.created_at}>
                        {new Date(m.created_at).toLocaleString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
                      {m.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white px-4 py-3">
        {error && (
          <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            {error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="メッセージを入力 (Enter で送信、Shift+Enter で改行)"
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            送信
          </button>
        </div>
      </form>
    </>
  );
}
