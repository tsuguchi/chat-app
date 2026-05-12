import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { PresenceProvider } from "./presence-provider";
import { SidebarSearchInput } from "./search-input";

type ChannelRow = { id: string; type: string; name: string | null; is_archived: boolean };
type UnreadInfo = { unread: number; mentions: number };
type NotifSetting = "all" | "mentions" | "none";
type ChannelWithUnread = {
  id: string;
  type: string;
  name: string | null;
  unread: UnreadInfo;
  setting: NotifSetting;
};
type DmWithUnread = { id: string; label: string; unread: UnreadInfo; setting: NotifSetting };

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
    .select("notification_setting, channel:channels!inner(id, type, name, is_archived)")
    .eq("user_id", user.id);

  const settingByChannel = new Map<string, NotifSetting>();
  for (const r of memberRows ?? []) {
    const ch = r.channel as unknown as ChannelRow | null;
    if (ch?.id) {
      settingByChannel.set(ch.id, (r.notification_setting as NotifSetting | null) ?? "all");
    }
  }

  const joined: ChannelRow[] = (memberRows ?? [])
    .map((r) => r.channel as unknown as ChannelRow)
    .filter((c) => !c.is_archived);

  // Unread/mention counts per channel (one RPC call).
  const unreadMap = new Map<string, UnreadInfo>();
  const { data: unreadRows } = await supabase.rpc("get_unread_summary", { _user_id: user.id });
  for (const r of (unreadRows ?? []) as Array<{
    channel_id: string;
    unread_count: number;
    mention_count: number;
  }>) {
    unreadMap.set(r.channel_id, {
      unread: Number(r.unread_count ?? 0),
      mentions: Number(r.mention_count ?? 0),
    });
  }
  const attachUnread = (c: ChannelRow): ChannelWithUnread => ({
    id: c.id,
    type: c.type,
    name: c.name,
    unread: unreadMap.get(c.id) ?? { unread: 0, mentions: 0 },
    setting: settingByChannel.get(c.id) ?? "all",
  });

  const publicChannels = joined
    .filter((c) => c.type === "public")
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map(attachUnread);
  const privateChannels = joined
    .filter((c) => c.type === "private")
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map(attachUnread);
  const dmChannels = joined.filter((c) => c.type === "dm" || c.type === "group_dm");

  // For DMs we don't have a name; build a label from the *other* members.
  const dmIds = dmChannels.map((c) => c.id);
  let dms: DmWithUnread[] = [];
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
        unread: unreadMap.get(c.id) ?? { unread: 0, mentions: 0 },
        setting: settingByChannel.get(c.id) ?? "all",
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <PresenceProvider userId={user.id}>
      <div className="flex min-h-screen bg-gray-50">
        <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200">
            <div className="px-4 py-4">
              <Link href="/" className="block text-lg font-semibold text-gray-900">
                chat-app
              </Link>
            </div>
            <SidebarSearchInput />
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
    </PresenceProvider>
  );
}

function ChannelSection({
  title,
  prefix,
  channels,
}: {
  title: string;
  prefix: string;
  channels: ChannelWithUnread[];
}) {
  return (
    <div className="mb-4">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      <ul className="mt-1 space-y-0.5">
        {channels.length === 0 ? (
          <li className="px-2 py-1 text-xs text-gray-400">なし</li>
        ) : (
          channels.map((c) => (
            <SidebarItem
              key={c.id}
              href={`/channels/${c.id}`}
              label={`${prefix} ${c.name}`}
              unread={c.unread}
              setting={c.setting}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function DmSection({ dms }: { dms: DmWithUnread[] }) {
  return (
    <div className="mb-4">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">DM</h2>
      <ul className="mt-1 space-y-0.5">
        {dms.length === 0 ? (
          <li className="px-2 py-1 text-xs text-gray-400">なし</li>
        ) : (
          dms.map((d) => (
            <SidebarItem
              key={d.id}
              href={`/channels/${d.id}`}
              label={`💬 ${d.label}`}
              unread={d.unread}
              setting={d.setting}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function SidebarItem({
  href,
  label,
  unread,
  setting,
}: {
  href: string;
  label: string;
  unread: UnreadInfo;
  setting: NotifSetting;
}) {
  // Mute settings filter what counts toward the badge:
  //   "all"     — show mentions and unread as normal
  //   "mentions"— only show the @-mention pill, never the unread pill
  //   "none"    — fully muted; no pill, no bold name
  const showUnread = setting === "all" && unread.unread > 0;
  const showMention = setting !== "none" && unread.mentions > 0;
  const muted = setting === "none";
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-gray-100 ${
          muted
            ? "text-gray-400"
            : showUnread || showMention
              ? "font-semibold text-gray-900"
              : "text-gray-700"
        }`}
      >
        <span className="min-w-0 truncate">
          {muted && <span className="mr-1 text-xs">🔕</span>}
          {label}
        </span>
        {showMention ? (
          <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            @{unread.mentions}
          </span>
        ) : showUnread ? (
          <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-gray-700 px-1 text-[10px] font-semibold text-white">
            {unread.unread}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
