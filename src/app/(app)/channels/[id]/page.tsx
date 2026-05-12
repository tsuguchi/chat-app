import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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

export default async function ChannelDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: channel } = await supabase
    .from("channels")
    .select("id, type, name, description")
    .eq("id", id)
    .maybeSingle();

  if (!channel) {
    notFound();
  }

  const { data: membership } = await supabase
    .from("channel_members")
    .select("user_id, role, notification_setting")
    .eq("channel_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isMember = membership !== null;
  const isChannelOwnerOrAdmin = membership?.role === "owner" || membership?.role === "admin";
  const notificationSetting =
    (membership?.notification_setting as NotificationSetting | undefined) ?? "all";

  // Workspace admin (profiles.role) status is needed both for the private
  // channel invite link and for showing the "delete others' messages"
  // moderation control. Fetch once and reuse.
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isWorkspaceAdmin = callerProfile?.role === "admin";

  const canInvite = channel.type === "private" && (isChannelOwnerOrAdmin || isWorkspaceAdmin);

  // For DMs, build the display label from the other participants.
  let headerTitle: string;
  let headerSubtitle: string;
  if (channel.type === "dm" || channel.type === "group_dm") {
    const { data: otherMembers } = await supabase
      .from("channel_members")
      .select("profile:profiles!user_id(display_name)")
      .eq("channel_id", id)
      .neq("user_id", user.id);
    const names = (otherMembers ?? [])
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

  // Main channel view: top-level messages only. Soft-deleted rows are kept
  // so the UI can render the "deleted" placeholder; replies live in thread
  // panel.
  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, body, created_at, user_id, parent_message_id, is_edited, edited_at, deleted_at")
    .eq("channel_id", id)
    .is("parent_message_id", null)
    .order("created_at", { ascending: true })
    .limit(200);

  const initialMessages = (messageRows ?? []) as ChatMessage[];

  // Mark the channel as read up through the latest visible top-level message.
  // The sidebar's unread badge will clear on the next navigation since the
  // layout always re-renders (cookie-bound server component).
  if (isMember && initialMessages.length > 0) {
    const latestId = initialMessages[initialMessages.length - 1].id;
    await supabase
      .from("channel_members")
      .update({ last_read_message_id: latestId })
      .eq("channel_id", id)
      .eq("user_id", user.id);
  }

  // Compute reply counts for visible top-level messages.
  const topIds = initialMessages.map((m) => m.id);
  const initialReplyCounts: Record<string, number> = {};
  if (topIds.length > 0) {
    const { data: replyRows } = await supabase
      .from("messages")
      .select("parent_message_id")
      .eq("channel_id", id)
      .is("deleted_at", null)
      .in("parent_message_id", topIds);
    for (const r of replyRows ?? []) {
      const pid = r.parent_message_id as string | null;
      if (pid) initialReplyCounts[pid] = (initialReplyCounts[pid] ?? 0) + 1;
    }
  }

  // Pre-fetch reactions for the initial top-level slice. RLS limits this
  // to messages the user can see, which matches what we render.
  let initialReactions: ReactionRow[] = [];
  if (topIds.length > 0) {
    const { data: rxRows } = await supabase
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", topIds);
    initialReactions = (rxRows ?? []) as ReactionRow[];
  }

  // Pre-fetch attachments for the initial top-level slice and mint signed
  // URLs server-side so the client renders without an extra round trip.
  let initialAttachments: ChatAttachment[] = [];
  if (topIds.length > 0) {
    const { data: attRows } = await supabase
      .from("message_attachments")
      .select("id, message_id, storage_path, file_name, mime_type, size_bytes")
      .in("message_id", topIds);
    const rows = attRows ?? [];
    if (rows.length > 0) {
      const paths = rows.map((a) => a.storage_path);
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrls(paths, 3600);
      const urlByPath = new Map<string, string>();
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
      initialAttachments = rows.map((a) => ({
        id: a.id,
        message_id: a.message_id,
        storage_path: a.storage_path,
        file_name: a.file_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        signed_url: urlByPath.get(a.storage_path) ?? "",
      }));
    }
  }

  // Pre-fetch profiles for all authors in the initial message set.
  const authorIds = Array.from(new Set(initialMessages.map((m) => m.user_id)));
  let initialProfiles: ChatProfile[] = [];
  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", authorIds);
    initialProfiles = (profs ?? []) as ChatProfile[];
  }

  // Channel members for the @-mention autocomplete picker.
  let mentionableUsers: MentionableUser[] = [];
  if (isMember) {
    const { data: memberRows } = await supabase
      .from("channel_members")
      .select("profile:profiles!user_id(id, username, display_name)")
      .eq("channel_id", id);
    mentionableUsers = (memberRows ?? [])
      .map((r) => {
        const p = (
          r as unknown as {
            profile:
              | { id: string; username: string | null; display_name: string }
              | { id: string; username: string | null; display_name: string }[];
          }
        ).profile;
        return Array.isArray(p) ? p[0] : p;
      })
      .filter((p): p is { id: string; username: string | null; display_name: string } => Boolean(p))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
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
