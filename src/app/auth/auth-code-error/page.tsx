import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-gray-900">認証に失敗しました</h1>
        <p className="mt-3 text-sm text-gray-600">
          マジックリンクの有効期限が切れているか、すでに使用された可能性があります。もう一度お試しください。
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          ログイン画面へ
        </Link>
      </div>
    </main>
  );
}
