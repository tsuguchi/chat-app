import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">ようこそ</h1>
        <p className="mt-2 text-sm text-gray-600">ログインに成功しました。</p>

        <dl className="mt-6 space-y-2 rounded-md bg-gray-50 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">メール</dt>
            <dd className="text-gray-900">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">ユーザーID</dt>
            <dd className="font-mono text-xs text-gray-900">{user.id}</dd>
          </div>
        </dl>

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            ログアウト
          </button>
        </form>
      </div>
    </main>
  );
}
