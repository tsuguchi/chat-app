import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CallRoom } from "./call-room";
import { getCallToken, startCall } from "./actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ kind?: string }>;

// Mounting this page does two things server-side:
//   1) reserve / join the active call row in the calls table (RLS scopes
//      this to channel members), so other members see the join ribbon;
//   2) mint a LiveKit JWT bound to that room. We do it on the server so
//      the API secret never travels to the browser.
export default async function CallPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { kind } = await searchParams;
  const callKind = kind === "audio" ? "audio" : "video";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: channel } = await supabase
    .from("channels")
    .select("id, type, name")
    .eq("id", id)
    .maybeSingle();
  if (!channel) notFound();

  // Only channel members can sit in a call room.
  const { data: membership } = await supabase
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    redirect(`/channels/${id}`);
  }

  const headerTitle =
    channel.type === "dm" || channel.type === "group_dm" ? "💬 DM" : `# ${channel.name}`;

  // Idempotent: returns the existing active call if one is running.
  const started = await startCall(id, callKind);
  if (!started.ok) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-900 text-white">
        <p className="mb-4 text-lg">通話を開始できませんでした。</p>
        <p className="mb-6 text-sm text-gray-300">{started.error}</p>
        <Link
          href={`/channels/${id}`}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          チャンネルに戻る
        </Link>
      </div>
    );
  }

  const tokenResult = await getCallToken(started.data.callId);
  if (!tokenResult.ok) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-900 text-white">
        <p className="mb-4 text-lg">通話用トークンを取得できませんでした。</p>
        <p className="mb-6 text-sm text-gray-300">{tokenResult.error}</p>
        <Link
          href={`/channels/${id}`}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          チャンネルに戻る
        </Link>
      </div>
    );
  }

  return (
    <CallRoom
      channelId={id}
      channelLabel={headerTitle}
      callId={started.data.callId}
      kind={callKind}
      token={tokenResult.data.token}
      serverUrl={tokenResult.data.serverUrl}
    />
  );
}
