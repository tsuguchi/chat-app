"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ActiveCall = {
  id: string;
  kind: "audio" | "video";
  started_by: string;
};

type Props = {
  channelId: string;
  initialActiveCall: ActiveCall | null;
};

// Renders the "start audio/video call" buttons; if a call is already running
// in this channel, swaps in a "join" ribbon. Subscribes to the calls table
// over Realtime so peers see the ribbon appear/disappear without refresh.
export function CallControls({ channelId, initialActiveCall }: Props) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(initialActiveCall);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      const ch = supabase
        .channel(`channel-${channelId}-calls`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "calls",
            filter: `channel_id=eq.${channelId}`,
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              kind: "audio" | "video";
              started_by: string;
              ended_at: string | null;
            };
            if (row.ended_at === null) {
              setActiveCall({ id: row.id, kind: row.kind, started_by: row.started_by });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "calls",
            filter: `channel_id=eq.${channelId}`,
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              kind: "audio" | "video";
              started_by: string;
              ended_at: string | null;
            };
            if (row.ended_at !== null) {
              setActiveCall((prev) => (prev?.id === row.id ? null : prev));
            } else {
              setActiveCall({ id: row.id, kind: row.kind, started_by: row.started_by });
            }
          },
        )
        .subscribe();
      channels.push(ch);
    })();

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [channelId, supabase]);

  if (activeCall) {
    return (
      <Link
        href={`/channels/${channelId}/call?kind=${activeCall.kind}`}
        className="inline-flex animate-pulse items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500"
        title="進行中の通話に参加"
      >
        <span>{activeCall.kind === "video" ? "🎥" : "🎙"}</span>
        <span>通話に参加</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/channels/${channelId}/call?kind=audio`}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        title="音声通話を開始"
      >
        <span>🎙</span>
        <span>音声</span>
      </Link>
      <Link
        href={`/channels/${channelId}/call?kind=video`}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        title="ビデオ通話を開始"
      >
        <span>🎥</span>
        <span>ビデオ</span>
      </Link>
    </div>
  );
}
