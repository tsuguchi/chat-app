import { sendMagicLink } from "./actions";

type SearchParams = Promise<{ sent?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { sent, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">ログイン</h1>
        <p className="mt-2 text-sm text-gray-600">
          メールアドレスを入力してください。ログイン用のリンクをお送りします。
        </p>

        {sent ? (
          <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            メールを送信しました。受信トレイをご確認ください。
          </div>
        ) : (
          <form action={sendMagicLink} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error === "missing_email" ? "メールアドレスを入力してください。" : error}
              </div>
            )}
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              マジックリンクを送信
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
