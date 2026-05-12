"use client";

import { useState, useTransition } from "react";
import { updateNotificationSetting, type NotificationSetting } from "./actions";

const OPTIONS: { value: NotificationSetting; label: string; icon: string }[] = [
  { value: "all", label: "すべての通知", icon: "🔔" },
  { value: "mentions", label: "メンションのみ", icon: "@" },
  { value: "none", label: "ミュート", icon: "🔕" },
];

export function NotificationSelector({
  channelId,
  initial,
}: {
  channelId: string;
  initial: NotificationSetting;
}) {
  const [setting, setSetting] = useState<NotificationSetting>(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = OPTIONS.find((o) => o.value === setting) ?? OPTIONS[0];

  function pick(next: NotificationSetting) {
    if (next === setting || pending) {
      setOpen(false);
      return;
    }
    const prev = setting;
    setSetting(next);
    setOpen(false);
    startTransition(async () => {
      const result = await updateNotificationSetting(channelId, next);
      if (!result.ok) {
        setSetting(prev);
        console.error("[notification] update failed:", result.error);
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        title="通知設定"
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                o.value === setting ? "bg-blue-50 text-blue-900" : "text-gray-800 hover:bg-gray-50"
              }`}
            >
              <span>{o.icon}</span>
              <span className="flex-1">{o.label}</span>
              {o.value === setting && <span className="text-blue-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
