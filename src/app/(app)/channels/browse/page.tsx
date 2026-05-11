import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { joinChannel } from "./actions";

type SearchParams = Promise<{ error?: string }>;

export default async function BrowseChannelsPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: publicChannels } = await supabase
    .from("channels")
    .select("id, name, description, created_by")
    .eq("type", "public")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  const { data: myMemberships } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", user.id);

  const joinedIds = new Set((myMemberships ?? []).map((m) => m.channel_id));

  const channels = publicChannels ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">チャンネルを探す</h1>
        <p className="mt-1 text-sm text-gray-600">
          パブリックチャンネルの一覧です。クリックして参加できます。
        </p>
      </header>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {channels.length === 0 ? (
          <div className="text-center text-sm text-gray-500">
            パブリックチャンネルはまだありません。
            <Link href="/channels/new" className="ml-1 text-blue-600 hover:underline">
              新しいチャンネルを作成
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {channels.map((c) => {
              const isJoined = joinedIds.has(c.id);
              return (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-4 rounded-md border border-gray-200 bg-white p-4"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/channels/${c.id}`}
                      className="text-base font-semibold text-gray-900 hover:underline"
                    >
                      # {c.name}
                    </Link>
                    {c.description && <p className="mt-1 text-sm text-gray-600">{c.description}</p>}
                  </div>
                  <div className="flex-none">
                    {isJoined ? (
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
                        参加済み
                      </span>
                    ) : (
                      <form action={joinChannel.bind(null, c.id)}>
                        <button
                          type="submit"
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          参加する
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
