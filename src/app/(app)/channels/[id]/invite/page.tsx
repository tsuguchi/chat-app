import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvitePicker, type InvitableUser } from "./invite-picker";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

const ERROR_LABELS: Record<string, string> = {
  no_user: "招待するユーザーを 1 人以上選択してください。",
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const errorLabel = error ? (ERROR_LABELS[error] ?? error) : null;

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
  if (!channel) {
    notFound();
  }

  // Authorization: only callable for channels that support invitation
  // (private). DMs / group DMs are not invitable through this page; public
  // channels use the self-join flow under /channels/browse.
  if (channel.type !== "private") {
    redirect(`/channels/${id}`);
  }

  // Authorize: caller must be channel owner/admin, or a workspace admin.
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("channel_members")
      .select("role")
      .eq("channel_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const isOwnerOrChannelAdmin = membership?.role === "owner" || membership?.role === "admin";
  const isWorkspaceAdmin = profile?.role === "admin";
  if (!isOwnerOrChannelAdmin && !isWorkspaceAdmin) {
    redirect(`/channels/${id}`);
  }

  // Candidate users: everyone except already-members.
  const { data: existing } = await supabase
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", id);
  const memberIds = new Set((existing ?? []).map((m) => m.user_id));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, username")
    .order("display_name", { ascending: true });

  const candidates: InvitableUser[] = (profiles ?? []).filter((p) => !memberIds.has(p.id));

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900"># {channel.name} に招待</h1>
        <p className="mt-1 text-sm text-gray-600">
          このプライベートチャンネルにメンバーを追加します。
        </p>
      </header>

      {errorLabel && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-800">
          {errorLabel}
        </div>
      )}

      <InvitePicker channelId={id} users={candidates} />
    </div>
  );
}
