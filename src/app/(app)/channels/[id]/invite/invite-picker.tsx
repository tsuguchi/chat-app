"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { OnlineDot } from "../../../presence-provider";
import { inviteMembers } from "./actions";

export type InvitableUser = {
  id: string;
  display_name: string;
  username: string | null;
};

export function InvitePicker({ channelId, users }: { channelId: string; users: InvitableUser[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        (u.username && u.username.toLowerCase().includes(q)),
    );
  }, [users, query]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedIds.size === 0 || pending) return;
    startTransition(() => {
      inviteMembers(channelId, Array.from(selectedIds));
    });
  }

  const count = selectedIds.size;

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で検索"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3">
        {users.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            招待可能なユーザーはいません。
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">該当するユーザーがいません。</div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((u) => {
              const checked = selectedIds.has(u.id);
              return (
                <li key={u.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                      checked ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(u.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="relative flex-none">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                        {u.display_name.slice(0, 1).toUpperCase()}
                      </div>
                      <OnlineDot userId={u.id} className="absolute bottom-0 right-0" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{u.display_name}</p>
                      {u.username && (
                        <p className="truncate text-xs text-gray-500">@{u.username}</p>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3">
        <p className="text-sm text-gray-600">
          {count > 0 ? `${count} 人選択中` : "招待するユーザーを選択してください"}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/channels/${channelId}`}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            disabled={count === 0 || pending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {pending ? "招待中..." : "招待する"}
          </button>
        </div>
      </div>
    </form>
  );
}
