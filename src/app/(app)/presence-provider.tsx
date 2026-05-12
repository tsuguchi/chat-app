"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PresenceContextValue = {
  /** Set of user_ids currently online. */
  onlineIds: ReadonlySet<string>;
};

const PresenceContext = createContext<PresenceContextValue>({ onlineIds: new Set() });

export function usePresence() {
  return useContext(PresenceContext);
}

export function PresenceProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const supabase = useMemo(() => createClient(), []);

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

      channel = supabase.channel("presence:workspace", {
        config: { presence: { key: userId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState();
          setOnlineIds(new Set(Object.keys(state)));
        })
        .on("presence", { event: "join" }, ({ key }: { key: string }) => {
          setOnlineIds((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        })
        .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
          setOnlineIds((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({ user_id: userId, online_at: new Date().toISOString() });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[presence] channel:", status);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  const value = useMemo(() => ({ onlineIds }), [onlineIds]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function OnlineDot({
  userId,
  size = "sm",
  className = "",
}: {
  userId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { onlineIds } = usePresence();
  if (!onlineIds.has(userId)) return null;
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span
      aria-label="オンライン"
      title="オンライン"
      className={`inline-block flex-none rounded-full bg-green-500 ring-2 ring-white ${dim} ${className}`}
    />
  );
}
