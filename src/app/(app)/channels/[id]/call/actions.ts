"use server";

import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@/lib/supabase/server";

export type CallKind = "audio" | "video";

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

type CallRow = {
  id: string;
  channel_id: string;
  started_by: string;
  kind: CallKind;
  started_at: string;
  ended_at: string | null;
};

// Start a call, or join the existing active one. The unique partial index
// (calls_one_active_per_channel_idx) guarantees at most one active row per
// channel, so a race between two "start" clicks resolves to one shared call.
export async function startCall(
  channelId: string,
  kind: CallKind,
): Promise<ActionResult<{ callId: string }>> {
  if (kind !== "audio" && kind !== "video") {
    return { ok: false, error: "通話種別が不正です。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが切れています。" };

  // Fast path: someone is already in a call here; join it.
  const { data: existing } = await supabase
    .from("calls")
    .select("id")
    .eq("channel_id", channelId)
    .is("ended_at", null)
    .maybeSingle();
  if (existing) return { ok: true, data: { callId: existing.id } };

  const { data: created, error } = await supabase
    .from("calls")
    .insert({ channel_id: channelId, started_by: user.id, kind })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique_violation: another tab beat us to starting. Re-query.
    if (error.code === "23505") {
      const { data: again } = await supabase
        .from("calls")
        .select("id")
        .eq("channel_id", channelId)
        .is("ended_at", null)
        .maybeSingle();
      if (again) return { ok: true, data: { callId: again.id } };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { callId: created.id } };
}

// Anyone in the channel can hang up the room. The UI surfaces this on the
// call screen; the realtime UPDATE then clears the "join" ribbon for the
// other channel members.
export async function endCall(callId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが切れています。" };

  const { error } = await supabase
    .from("calls")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", callId)
    .is("ended_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Mint a short-lived LiveKit JWT for the caller. The token grants publish/
// subscribe rights to exactly one room — the room name embeds the call id
// so a token is never reusable across calls. Channel membership is checked
// via RLS: the caller must be able to SELECT the call row.
export async function getCallToken(
  callId: string,
): Promise<ActionResult<{ token: string; serverUrl: string; roomName: string }>> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !serverUrl) {
    return { ok: false, error: "LiveKit が未設定です。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが切れています。" };

  // RLS will silently return null if the user is not a channel member.
  const { data: call } = await supabase
    .from("calls")
    .select("id, channel_id, ended_at")
    .eq("id", callId)
    .maybeSingle();
  if (!call) return { ok: false, error: "通話が見つかりません。" };
  if (call.ended_at) return { ok: false, error: "通話は既に終了しています。" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = profile?.display_name ?? "User";

  const roomName = `call-${call.id}`;
  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: displayName,
    ttl: 60 * 60,
    metadata: JSON.stringify({ avatar_url: profile?.avatar_url ?? null }),
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return { ok: true, data: { token, serverUrl, roomName } };
}

export async function getActiveCall(channelId: string): Promise<CallRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calls")
    .select("id, channel_id, started_by, kind, started_at, ended_at")
    .eq("channel_id", channelId)
    .is("ended_at", null)
    .maybeSingle();
  return (data as CallRow | null) ?? null;
}
