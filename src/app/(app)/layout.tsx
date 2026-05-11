import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: channels } = await supabase
    .from("channels")
    .select("id, type, name")
    .in("type", ["public", "private"])
    .eq("is_archived", false)
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  const publicChannels = (channels ?? []).filter((c) => c.type === "public");
  const privateChannels = (channels ?? []).filter((c) => c.type === "private");

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <Link href="/" className="block text-lg font-semibold text-gray-900">
            chat-app
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm">
          <ChannelSection title="パブリック" channels={publicChannels} />
          <ChannelSection title="プライベート" channels={privateChannels} />

          <div className="mt-4 px-2">
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
  channels,
}: {
  title: string;
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
                # {c.name}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
