"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type SendMessageResult = ActionResult;

type ParsedMention = { kind: "user"; username: string } | { kind: "channel" } | { kind: "here" };

// Matches @username / @channel / @here. Allowed username chars match the
// CHECK constraint range (letters, digits, underscore — 1 to 32 chars).
const MENTION_RE = /(?:^|\s)@([A-Za-z0-9_]{1,32})\b/g;

function parseMentions(body: string): ParsedMention[] {
  const out: ParsedMention[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const handle = m[1];
    if (handle === "channel") out.push({ kind: "channel" });
    else if (handle === "here") out.push({ kind: "here" });
    else out.push({ kind: "user", username: handle });
  }
  return out;
}

export type AttachmentPayload = {
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
};

export async function sendMessage(
  channelId: string,
  body: string,
  parentMessageId: string | null = null,
  attachments: AttachmentPayload[] = [],
): Promise<SendMessageResult> {
  const text = body.trim();
  if (!text && attachments.length === 0) {
    return { ok: false, error: "メッセージまたは添付ファイルが必要です。" };
  }
  if (text.length > 4000) return { ok: false, error: "メッセージが長すぎます (4000文字まで)。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが切れています。" };

  const { data: newMessage, error: insertErr } = await supabase
    .from("messages")
    .insert({
      channel_id: channelId,
      user_id: user.id,
      parent_message_id: parentMessageId,
      body: text || "",
    })
    .select("id")
    .single();

  if (insertErr) return { ok: false, error: insertErr.message };

  // Attach files that the client uploaded to storage.
  if (attachments.length > 0) {
    const attachmentRows = attachments.map((a) => ({
      message_id: newMessage.id,
      storage_path: a.storage_path,
      file_name: a.file_name,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
    }));
    const { error: attachErr } = await supabase.from("message_attachments").insert(attachmentRows);
    if (attachErr) return { ok: false, error: attachErr.message };
  }

  // Resolve mention targets into concrete (mentioned_user_id, mention_type)
  // rows. Wrong usernames are silently dropped so the message still posts.
  const parsed = parseMentions(text);
  if (parsed.length > 0) {
    const userHandles = Array.from(
      new Set(parsed.filter((p) => p.kind === "user").map((p) => p.username)),
    );
    const hasChannel = parsed.some((p) => p.kind === "channel");
    const hasHere = parsed.some((p) => p.kind === "here");

    type MentionRow = { message_id: string; mentioned_user_id: string; mention_type: string };
    const rows: MentionRow[] = [];

    if (userHandles.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username")
        .in("username", userHandles);
      for (const p of profs ?? []) {
        rows.push({ message_id: newMessage.id, mentioned_user_id: p.id, mention_type: "user" });
      }
    }

    if (hasChannel || hasHere) {
      const { data: members } = await supabase
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", channelId);
      const memberIds = (members ?? []).map((m) => m.user_id);

      if (hasChannel) {
        for (const uid of memberIds) {
          rows.push({ message_id: newMessage.id, mentioned_user_id: uid, mention_type: "channel" });
        }
      }
      if (hasHere && memberIds.length > 0) {
        const { data: online } = await supabase
          .from("user_presence")
          .select("user_id")
          .in("user_id", memberIds)
          .eq("status", "online");
        for (const o of online ?? []) {
          rows.push({
            message_id: newMessage.id,
            mentioned_user_id: o.user_id,
            mention_type: "here",
          });
        }
      }
    }

    if (rows.length > 0) {
      // Deduplicate on the composite primary key.
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        const k = `${r.mentioned_user_id}|${r.mention_type}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      await supabase.from("message_mentions").insert(unique);
    }
  }

  return { ok: true };
}

export async function addReaction(messageId: string, emoji: string): Promise<ActionResult> {
  if (!emoji) return { ok: false, error: "絵文字を指定してください。" };
  if (emoji.length > 64) return { ok: false, error: "絵文字が長すぎます。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが切れています。" };

  const { error } = await supabase.from("message_reactions").insert({
    message_id: messageId,
    user_id: user.id,
    emoji,
  });
  // 23505 = unique_violation: already reacted with this emoji. Idempotent success.
  if (error && error.code !== "23505") return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeReaction(messageId: string, emoji: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが切れています。" };

  const { error } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
