import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth is enforced by the parent layout; user is non-null here.
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">ようこそ</h1>
        <p className="mt-2 text-sm text-gray-600">
          左のサイドバーからチャンネルを開くか、新しいチャンネルを作成してください。
        </p>

        <dl className="mt-6 space-y-2 rounded-md bg-gray-50 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">メール</dt>
            <dd className="text-gray-900">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">ユーザーID</dt>
            <dd className="font-mono text-xs text-gray-900">{user?.id}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
