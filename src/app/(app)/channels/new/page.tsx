import Link from "next/link";
import { createChannel } from "./actions";

type SearchParams = Promise<{ error?: string }>;

const ERROR_LABELS: Record<string, string> = {
  missing_name: "チャンネル名を入力してください。",
  name_too_long: "チャンネル名は64文字以内にしてください。",
};

export default async function NewChannelPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const errorLabel = error ? (ERROR_LABELS[error] ?? error) : null;

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">チャンネルを作成</h1>
        <p className="mt-2 text-sm text-gray-600">
          作成したチャンネルでは、あなたが自動的にオーナーになります。
        </p>

        <form action={createChannel} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              チャンネル名
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={64}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="general"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              説明（任意）
            </label>
            <input
              id="description"
              name="description"
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700">公開設定</legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="type" value="public" defaultChecked className="mt-0.5" />
                <span>
                  <span className="block font-medium text-gray-900">パブリック</span>
                  <span className="block text-xs text-gray-500">全員が閲覧・参加できます。</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="type" value="private" className="mt-0.5" />
                <span>
                  <span className="block font-medium text-gray-900">プライベート</span>
                  <span className="block text-xs text-gray-500">招待されたメンバーのみ。</span>
                </span>
              </label>
            </div>
          </fieldset>

          {errorLabel && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {errorLabel}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link
              href="/"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
