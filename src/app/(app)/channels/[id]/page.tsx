import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessageStream, type ChatMessage, type ChatProfile } from "./message-stream";

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

  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, body, created_at, user_id")
    .eq("channel_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  const initialMessages = (messageRows ?? []) as ChatMessage[];

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

  const typeLabel = channel.type === "private" ? "プライベート" : "パブリック";

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-gray-900"># {channel.name}</h1>
          <span className="text-xs text-gray-500">{typeLabel}</span>
        </div>
        {channel.description && <p className="mt-1 text-sm text-gray-600">{channel.description}</p>}
      </header>

      {isMember ? (
        <MessageStream
          channelId={channel.id}
          initialMessages={initialMessages}
          initialProfiles={initialProfiles}
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
