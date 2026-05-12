"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteChannel } from "./actions";

type Props = {
  channelId: string;
  channelLabel: string;
};

// Channel deletion is destructive and cascades to all messages, so we
// require an explicit text-typed confirmation matching the channel name.
// On success we hard-navigate to "/" so the sidebar refetches the
// channel list instead of leaving a phantom entry.
export function DeleteChannelButton({ channelId, channelLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (pending) return;
    if (typed !== channelLabel) {
      setError("チャンネル名が一致しません。");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteChannel(channelId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTyped("");
          setError(null);
        }}
        className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        title="チャンネルを削除"
      >
        🗑 削除
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">チャンネルを削除</h2>
            <p className="mt-2 text-sm text-gray-700">
              <span className="font-semibold">{channelLabel}</span>{" "}
              を削除します。チャンネル内のすべてのメッセージ・リアクション・添付ファイルも合わせて削除されます。
              <span className="mt-1 block font-semibold text-red-700">この操作は取り消せません。</span>
            </p>
            <div className="mt-4">
              <label htmlFor="confirm-name" className="block text-sm font-medium text-gray-700">
                確認のため、チャンネル名「<span className="font-mono">{channelLabel}</span>
                」を入力してください
              </label>
              <input
                id="confirm-name"
                type="text"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setError(null);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder={channelLabel}
                autoFocus
              />
              {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending || typed !== channelLabel}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending ? "削除中…" : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
