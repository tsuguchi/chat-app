"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SidebarSearchInput() {
  const [q, setQ] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = q.trim();
    if (value.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <form onSubmit={submit} className="px-4 pb-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔎 メッセージを検索"
        className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </form>
  );
}
