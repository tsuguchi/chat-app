import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MessageStream,
  type ChatAttachment,
  type ChatMessage,
  type ChatProfile,
  type MentionableUser,
  type ReactionRow,
} from "./message-stream";
import { NotificationSelector } from "./notification-selector";
import type { NotificationSetting } from "./actions";

type Params = Promise<{ id: string }>;

// Channel rendering used to be a chain of ~10 sequential awaits, which on a
// cold Supabase round trip stacks up to several hundred ms of perceived
// navigation latency. We now run queries in three phases:
//   1. channel metadata + membership + caller profile (parallel)
//   2. messages + mentionable members + DM peer label (parallel)
//   3. reply counts + reactions + attachments + author profiles (parallel,
//      depend on the message id slice from phase 2)
// The "mark as read" write is moved to `after()` so it never blocks render.
export default async function ChannelDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Phase 1: channel + membership + caller profile in parallel.
  const [channelRes, membershipRes, callerProfileRes] = await Promise.all([
    supabase.from("channels").select("id, type, name, description").eq("id", id).maybeSingle(),
    supabase
      .from("channel_members")
      .select("user_id, role, notification_setting")
      .eq("channel_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const channel = channelRes.data;
  if (!channel) notFound();

  const membership = membershipRes.data;
  const isMember = membership !== null;
  const isChannelOwnerOrAdmin = membership?.role === "owner" || membership?.role === "admin";
  const notificationSetting =
    (membership?.notification_setting as NotificationSetting | undefined) ?? "all";
  const isWorkspaceAdmin = callerProfileRes.data?.role === "admin";
  const canInvite = channel.type === "private" && (isChannelOwnerOrAdmin || isWorkspaceAdmin);
  const isDm = channel.type === "dm" || channel.type === "group_dm";

  // Phase 2: messages + DM peer label + mentionable users (parallel).
  // - DM peer query is only needed for DM channels.
  // - Mentionable users only matter for members of a non-DM channel.
  const [messageRowsRes, dmPeersRes, mentionableRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id, body, created_at, user_id, parent_message_id, is_edited, edited_at, deleted_at")
      .eq("channel_id", id)
      .is("parent_message_id", null)
      .order("created_at", { ascending: true })
      .limit(200),
    isDm
      ? supabase
          .from("channel_members")
          .select("profile:profiles!user_id(display_name)")
          .eq("channel_id", id)
          .neq("user_id", user.id)
      : Promise.resolve({ data: null as null }),
    isMember
      ? supabase
          .from("channel_members")
          .select("profile:profiles!user_id(id, username, display_name)")
          .eq("channel_id", id)
      : Promise.resolve({ data: null as null }),
  ]);

  const initialMessages = (messageRowsRes.data ?? []) as ChatMessage[];

  // Build DM header label from the parallel result.
  let headerTitle: string;
  let headerSubtitle: string;
  if (isDm) {
    const names = (dmPeersRes.data ?? [])
      .map((r) => {
        const profile = (
          r as unknown as { profile: { display_name: string } | { display_name: string }[] }
        ).profile;
        return Array.isArray(profile)
          ? (profile[0]?.display_name ?? "")
          : (profile?.display_name ?? "");
      })
      .filter(Boolean);
    headerTitle = names.length > 0 ? `💬 ${names.join(", ")}` : "💬 (自分のみ)";
    headerSubtitle = channel.type === "dm" ? "ダイレクトメッセージ" : "グループ DM";
  } else {
    headerTitle = `# ${channel.name}`;
    headerSubtitle = channel.type === "private" ? "プライベート" : "パブリック";
  }

  const mentionableUsers: MentionableUser[] = ((mentionableRes.data ?? []) as unknown[])
    .map((r) => {
      const p = (
        r as {
          profile:
            | { id: string; username: string | null; display_name: string }
            | { id: string; username: string | null; display_name: string }[];
        }
      ).profile;
      return Array.isArray(p) ? p[0] : p;
    })
    .filter((p): p is { id: string; username: string | null; display_name: string } => Boolean(p))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  // Defer the "mark as read" write until after the response is flushed —
  // the user does not need to wait on this, and the sidebar's unread badge
  // updates on the next navigation anyway.
  if (isMember && initialMessages.length > 0) {
    const latestId = initialMessages[initialMessages.length - 1].id;
    after(async () => {
      await supabase
        .from("channel_members")
        .update({ last_read_message_id: latestId })
        .eq("channel_id", id)
        .eq("user_id", user.id);
    });
  }

  // Phase 3: reply counts + reactions + attachments + author profiles
  // (all depend on the message id slice and can run in parallel).
  const topIds = initialMessages.map((m) => m.id);
  const authorIds = Array.from(new Set(initialMessages.map((m) => m.user_id)));

  const [replyRowsRes, rxRowsRes, attRowsRes, authorProfsRes] = await Promise.all([
    topIds.length > 0
      ? supabase
          .from("messages")
          .select("parent_message_id")
          .eq("channel_id", id)
          .is("deleted_at", null)
          .in("parent_message_id", topIds)
      : Promise.resolve({ data: null as null }),
    topIds.length > 0
      ? supabase
          .from("message_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", topIds)
      : Promise.resolve({ data: null as null }),
    topIds.length > 0
      ? supabase
          .from("message_attachments")
          .select("id, message_id, storage_path, file_name, mime_type, size_bytes")
          .in("message_id", topIds)
      : Promise.resolve({ data: null as null }),
    authorIds.length > 0
      ? supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds)
      : Promise.resolve({ data: null as null }),
  ]);

  const initialReplyCounts: Record<string, number> = {};
  for (const r of (replyRowsRes.data ?? []) as { parent_message_id: string | null }[]) {
    if (r.parent_message_id) {
      initialReplyCounts[r.parent_message_id] =
        (initialReplyCounts[r.parent_message_id] ?? 0) + 1;
    }
  }

  const initialReactions: ReactionRow[] = (rxRowsRes.data ?? []) as ReactionRow[];
  const initialProfiles: ChatProfile[] = (authorProfsRes.data ?? []) as ChatProfile[];

  // Attachments need signed URLs minted server-side, so this branch still
  // has one sequential storage call after the table read.
  let initialAttachments: ChatAttachment[] = [];
  const attRows = (attRowsRes.data ?? []) as {
    id: string;
    message_id: string;
    storage_path: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number;
  }[];
  if (attRows.length > 0) {
    const paths = attRows.map((a) => a.storage_path);
    const { data: signed } = await supabase.storage.from("attachments").createSignedUrls(paths, 3600);
    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
    initialAttachments = attRows.map((a) => ({
      id: a.id,
      message_id: a.message_id,
      storage_path: a.storage_path,
      file_name: a.file_name,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      signed_url: urlByPath.get(a.storage_path) ?? "",
    }));
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold text-gray-900">{headerTitle}</h1>
            <span className="text-xs text-gray-500">{headerSubtitle}</span>
          </div>
          <div className="flex items-center gap-2">
            {isMember && <NotificationSelector channelId={id} initial={notificationSetting} />}
            {canInvite && (
              <Link
                href={`/channels/${id}/invite`}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                + メンバーを招待
              </Link>
            )}
          </div>
        </div>
        {channel.description && <p className="mt-1 text-sm text-gray-600">{channel.description}</p>}
      </header>

      {isMember ? (
        <MessageStream
          channelId={channel.id}
          initialMessages={initialMessages}
          initialProfiles={initialProfiles}
          initialReplyCounts={initialReplyCounts}
          initialReactions={initialReactions}
          initialAttachments={initialAttachments}
          mentionableUsers={mentionableUsers}
          currentUserId={user.id}
          isWorkspaceAdmin={isWorkspaceAdmin}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center text-sm text-gray-500">
          このチャンネルのメンバーではないため、メッセージを表示できません。
        </div>
      )}
    </div>
  );
}
