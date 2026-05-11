import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MessageStream,
  type ChatMessage,
  type ChatProfile,
  type MentionableUser,
} from "./message-stream";

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
    .select("user_id")
    .eq("channel_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isMember = membership !== null;

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

  // Main channel view: top-level messages only. Replies live in thread panel.
  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, body, created_at, user_id, parent_message_id")
    .eq("channel_id", id)
    .is("parent_message_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  const initialMessages = (messageRows ?? []) as ChatMessage[];

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
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-gray-900">{headerTitle}</h1>
          <span className="text-xs text-gray-500">{headerSubtitle}</span>
        </div>
        {channel.description && <p className="mt-1 text-sm text-gray-600">{channel.description}</p>}
      </header>

      {isMember ? (
        <MessageStream
          channelId={channel.id}
          initialMessages={initialMessages}
          initialProfiles={initialProfiles}
          initialReplyCounts={initialReplyCounts}
          mentionableUsers={mentionableUsers}
          currentUserId={user.id}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center text-sm text-gray-500">
          このチャンネルのメンバーではないため、メッセージを表示できません。
        </div>
      )}
    </div>
  );
}
