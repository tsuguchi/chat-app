"use client";

import { useMemo, useRef, useState } from "react";

export type MentionableUser = {
  id: string;
  username: string | null;
  display_name: string;
};

type SpecialMention = { kind: "special"; token: "channel" | "here"; label: string };
type UserSuggestion = { kind: "user"; user: MentionableUser };
type Suggestion = SpecialMention | UserSuggestion;

const SPECIAL_MENTIONS: SpecialMention[] = [
  { kind: "special", token: "channel", label: "@channel — チャンネル全員に通知" },
  { kind: "special", token: "here", label: "@here — オンラインの全員に通知" },
];

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  users: MentionableUser[];
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
};

export function MentionTextarea({
  value,
  onChange,
  onSubmit,
  users,
  placeholder,
  rows = 2,
  maxLength = 4000,
  disabled = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [openAtIndex, setOpenAtIndex] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build the suggestion list when the picker is open.
  const suggestions = useMemo<Suggestion[]>(() => {
    if (openAtIndex === null) return [];
    const q = query.toLowerCase();
    const specials = SPECIAL_MENTIONS.filter(
      (s) => !q || s.token.startsWith(q) || s.token.includes(q),
    );
    const matched = users
      .filter((u) => {
        if (!q) return true;
        const dn = u.display_name.toLowerCase();
        const un = (u.username ?? "").toLowerCase();
        return dn.includes(q) || un.includes(q);
      })
      .slice(0, 10)
      .map<UserSuggestion>((u) => ({ kind: "user", user: u }));
    return [...specials, ...matched];
  }, [openAtIndex, query, users]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    detectMention(next, e.target.selectionStart ?? next.length);
  }

  function detectMention(text: string, caret: number) {
    // Walk back from the caret to find a "@" not preceded by a word char.
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        // Make sure it's at start of string or after whitespace.
        const prev = i === 0 ? " " : text[i - 1];
        if (/\s/.test(prev) || i === 0) {
          const segment = text.slice(i + 1, caret);
          // Must match the username character class (no spaces).
          if (/^[A-Za-z0-9_]*$/.test(segment)) {
            setOpenAtIndex(i);
            setQuery(segment);
            setSelectedIndex(0);
            return;
          }
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i--;
    }
    setOpenAtIndex(null);
    setQuery("");
    setSelectedIndex(0);
  }

  function applySuggestion(s: Suggestion) {
    if (openAtIndex === null) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    const handle = s.kind === "special" ? s.token : (s.user.username ?? s.user.display_name);
    const before = value.slice(0, openAtIndex);
    const after = value.slice(caret);
    // Add a trailing space so the next keystroke isn't sucked into the mention.
    const inserted = `@${handle} `;
    const next = before + inserted + after;
    onChange(next);
    setOpenAtIndex(null);
    setQuery("");
    // Restore the caret right after the inserted handle.
    requestAnimationFrame(() => {
      const newPos = openAtIndex + inserted.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (openAtIndex !== null && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpenAtIndex(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative flex-1">
      {openAtIndex !== null && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {suggestions.map((s, idx) => {
            const active = idx === selectedIndex;
            return (
              <button
                key={s.kind === "special" ? s.token : s.user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  active ? "bg-blue-50 text-blue-900" : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                {s.kind === "special" ? (
                  <span className="font-mono">{s.label}</span>
                ) : (
                  <>
                    <span className="font-medium">{s.user.display_name}</span>
                    {s.user.username && (
                      <span className="text-xs text-gray-500">@{s.user.username}</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpenAtIndex(null)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        className="block w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
      />
    </div>
  );
}
