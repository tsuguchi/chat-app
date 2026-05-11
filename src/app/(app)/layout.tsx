import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

type ChannelRow = { id: string; type: string; name: string | null; is_archived: boolean };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberRows } = await supabase
    .from("channel_members")
    .select("channel:channels!inner(id, type, name, is_archived)")
    .eq("user_id", user.id);

  const joined: ChannelRow[] = (memberRows ?? [])
    .map((r) => r.channel as unknown as ChannelRow)
    .filter((c) => !c.is_archived);

  const publicChannels = joined
    .filter((c) => c.type === "public")
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const privateChannels = joined
    .filter((c) => c.type === "private")
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const dmChannels = joined.filter((c) => c.type === "dm" || c.type === "group_dm");

  // For DMs we don't have a name; build a label from the *other* members.
  const dmIds = dmChannels.map((c) => c.id);
  type DmLabel = { id: string; label: string };
  let dms: DmLabel[] = [];
  if (dmIds.length > 0) {
    const { data: otherMembers } = await supabase
      .from("channel_members")
      .select("channel_id, profile:profiles!user_id(display_name)")
      .in("channel_id", dmIds)
      .neq("user_id", user.id);

    const byChannel = new Map<string, string[]>();
    for (const row of otherMembers ?? []) {
      const profile = (
        row as unknown as { profile: { display_name: string } | { display_name: string }[] }
      ).profile;
      const name = Array.isArray(profile)
        ? (profile[0]?.display_name ?? "")
        : (profile?.display_name ?? "");
      if (!name) continue;
      const list = byChannel.get(row.channel_id) ?? [];
      list.push(name);
      byChannel.set(row.channel_id, list);
    }
    dms = dmChannels
      .map((c) => ({
        id: c.id,
        label: (byChannel.get(c.id) ?? []).join(", ") || "(自分のみ)",
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <Link href="/" className="block text-lg font-semibold text-gray-900">
            chat-app
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm">
          <ChannelSection title="パブリック" prefix="#" channels={publicChannels} />
          <ChannelSection title="プライベート" prefix="#" channels={privateChannels} />
          <DmSection dms={dms} />

          <div className="mt-4 space-y-0.5 px-2">
            <Link
              href="/dm/new"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-gray-600 hover:bg-gray-100"
            >
              <span className="text-lg leading-none">💬</span>
              <span>新規 DM</span>
            </Link>
            <Link
              href="/channels/browse"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-gray-600 hover:bg-gray-100"
            >
              <span className="text-lg leading-none">🔍</span>
              <span>チャンネルを探す</span>
            </Link>
            <Link
              href="/channels/new"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-gray-600 hover:bg-gray-100"
            >
              <span className="text-lg leading-none">+</span>
              <span>チャンネルを作成</span>
            </Link>
          </div>
        </nav>

        <div className="border-t border-gray-200 px-4 py-3">
          <p className="truncate text-xs text-gray-500">{user.email}</p>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1">{children}</main>
    </div>
  );
}

function ChannelSection({
  title,
  prefix,
  channels,
}: {
  title: string;
  prefix: string;
  channels: { id: string; name: string | null }[];
}) {
  return (
    <div className="mb-4">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      <ul className="mt-1 space-y-0.5">
        {channels.length === 0 ? (
          <li className="px-2 py-1 text-xs text-gray-400">なし</li>
        ) : (
          channels.map((c) => (
            <li key={c.id}>
              <Link
                href={`/channels/${c.id}`}
                className="block truncate rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100"
              >
                {prefix} {c.name}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function DmSection({ dms }: { dms: { id: string; label: string }[] }) {
  return (
    <div className="mb-4">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">DM</h2>
      <ul className="mt-1 space-y-0.5">
        {dms.length === 0 ? (
          <li className="px-2 py-1 text-xs text-gray-400">なし</li>
        ) : (
          dms.map((d) => (
            <li key={d.id}>
              <Link
                href={`/channels/${d.id}`}
                className="block truncate rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100"
              >
                💬 {d.label}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
