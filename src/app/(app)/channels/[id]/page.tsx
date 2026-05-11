import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export default async function ChannelDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("id, type, name, description")
    .eq("id", id)
    .maybeSingle();

  if (!channel) {
    notFound();
  }

  const typeLabel = channel.type === "private" ? "プライベート" : "パブリック";

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-gray-900"># {channel.name}</h1>
          <span className="text-xs text-gray-500">{typeLabel}</span>
        </div>
        {channel.description && <p className="mt-1 text-sm text-gray-600">{channel.description}</p>}
      </header>
      <div className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center text-sm text-gray-500">
        メッセージ機能は次の PR で実装予定です。
      </div>
    </div>
  );
}
