"use server";

import { createClient } from "@/lib/supabase/server";

export type SendMessageResult = { ok: true } | { ok: false; error: string };

export async function sendMessage(channelId: string, body: string): Promise<SendMessageResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "メッセージを入力してください。" };
  if (text.length > 4000) return { ok: false, error: "メッセージが長すぎます (4000文字まで)。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが切れています。" };

  const { error } = await supabase.from("messages").insert({
    channel_id: channelId,
    user_id: user.id,
    body: text,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
