import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ q?: string }>;

type SearchHit = {
  id: string;
  body: string;
  created_at: string;
  channel_id: string;
  user_id: string;
  parent_message_id: string | null;
  channel: { id: string; type: string; name: string | null } | null;
  profile: { display_name: string } | null;
};

function dmLabelFallback(): string {
  return "💬 ダイレクトメッセージ";
}

function channelDisplay(channel: SearchHit["channel"]): string {
  if (!channel) return "(不明)";
  if (channel.type === "public" || channel.type === "private") {
    return `# ${channel.name ?? ""}`.trim();
  }
  return dmLabelFallback();
}

function highlight(body: string, query: string): React.ReactNode {
  if (!query) return body;
  const lower = body.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let found = lower.indexOf(q, cursor);
  while (found !== -1) {
    if (found > cursor) parts.push(body.slice(cursor, found));
    parts.push(
      <mark key={`${found}-${q}`} className="rounded bg-yellow-200 px-0.5 text-gray-900">
        {body.slice(found, found + q.length)}
      </mark>,
    );
    cursor = found + q.length;
    found = lower.indexOf(q, cursor);
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  return parts;
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let hits: SearchHit[] = [];
  if (query.length >= 2) {
    // RLS limits this to messages in channels the caller can see. pg_bigm's
    // GIN index accelerates the ILIKE substring scan.
    const escapedQuery = query.replace(/[%_]/g, (m) => `\\${m}`);
    const { data } = await supabase
      .from("messages")
      .select(
        `
        id, body, created_at, channel_id, user_id, parent_message_id,
        channel:channels!inner(id, type, name),
        profile:profiles!user_id(display_name)
      `,
      )
      .ilike("body", `%${escapedQuery}%`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    hits = ((data ?? []) as unknown as SearchHit[]).map((h) => ({
      ...h,
      channel: Array.isArray(h.channel) ? h.channel[0] : h.channel,
      profile: Array.isArray(h.profile) ? h.profile[0] : h.profile,
    }));
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">メッセージ検索</h1>
        <form action="/search" method="get" className="mt-3">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="2文字以上で検索"
            className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </form>
      </header>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4">
        {query.length < 2 ? (
          <p className="text-sm text-gray-500">2文字以上を入力してください。</p>
        ) : hits.length === 0 ? (
          <p className="text-sm text-gray-500">
            「{query}」に一致するメッセージは見つかりませんでした。
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-500">{hits.length} 件（最新 50 件まで）</p>
            <ul className="space-y-2">
              {hits.map((h) => (
                <li
                  key={h.id}
                  className="rounded-md border border-gray-200 bg-white p-3 text-sm shadow-sm"
                >
                  <div className="flex items-baseline gap-2">
                    <Link
                      href={`/channels/${h.channel_id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {channelDisplay(h.channel)}
                    </Link>
                    <span className="text-xs text-gray-500">
                      {h.profile?.display_name ?? "Unknown"}
                    </span>
                    <time className="text-xs text-gray-400" dateTime={h.created_at}>
                      {new Date(h.created_at).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {h.parent_message_id && (
                      <span className="text-xs text-gray-400">（スレッド返信）</span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-gray-800">
                    {highlight(h.body, query)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
