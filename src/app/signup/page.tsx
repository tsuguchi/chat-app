import Link from "next/link";
import { signUp } from "../login/actions";

type SearchParams = Promise<{ error?: string }>;

const ERROR_LABELS: Record<string, string> = {
  missing_fields: "ユーザー名とパスワードを入力してください。",
  invalid_username: "ユーザー名は半角英数字とアンダースコアのみ、32文字以内で入力してください。",
  password_too_short: "パスワードは 8 文字以上にしてください。",
  display_name_too_long: "表示名は 64 文字以内にしてください。",
  username_taken: "このユーザー名はすでに使われています。",
};

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const errorLabel = error ? (ERROR_LABELS[error] ?? error) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">新規登録</h1>
        <p className="mt-2 text-sm text-gray-600">
          ユーザー名・表示名・パスワードを設定してください。
        </p>

        <form action={signUp} className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              ユーザー名（半角英数字・アンダースコア / 32文字以内）
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              minLength={1}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="username"
            />
            <p className="mt-1 text-xs text-gray-500">@メンションで使われます。</p>
          </div>
          <div>
            <label htmlFor="display_name" className="block text-sm font-medium text-gray-700">
              表示名（任意 / 64文字以内）
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              maxLength={64}
              autoComplete="name"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="例: 津口 雄作"
            />
            <p className="mt-1 text-xs text-gray-500">
              空欄の場合はユーザー名がそのまま表示名になります。
            </p>
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              パスワード（8文字以上）
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {errorLabel && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {errorLabel}
            </div>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            アカウントを作成
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          すでにアカウントをお持ちの方は{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
