"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type Session = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

function formatRel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByDay(sessions: Session[]) {
  const today: Session[] = [];
  const yesterday: Session[] = [];
  const earlier: Session[] = [];
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday); startYesterday.setDate(startToday.getDate() - 1);

  for (const s of sessions) {
    const d = new Date(s.updated_at);
    if (d >= startToday) today.push(s);
    else if (d >= startYesterday) yesterday.push(s);
    else earlier.push(s);
  }
  return { today, yesterday, earlier };
}

export function ChatSidebar({ activeId }: { activeId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const r = await fetch("/api/chat");
      const j = await r.json();
      if (!cancelled) {
        setSessions(j.sessions ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [pathname, activeId]);

  const filtered = query.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : sessions;
  const groups = groupByDay(filtered);

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 h-full"
      style={{
        width: "220px",
        background: "var(--color-obsidian)",
        borderRight: "1px solid rgba(212, 208, 201, 0.08)",
      }}
    >
      {/* Brand */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-2">
        <Link
          href="/app"
          className="text-bone"
          style={{ fontSize: "18px", fontWeight: 500, letterSpacing: "-0.02em" }}
        >
          vermilion
        </Link>
        <span
          className="ml-auto text-ash"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          chat
        </span>
      </div>

      {/* New chat */}
      <div className="px-3">
        <button
          type="button"
          onClick={() => router.push("/app/chat")}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-cards transition-all cursor-pointer"
          style={{
            background: "var(--color-bone)",
            color: "var(--color-obsidian)",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1, marginTop: "-2px" }}>+</span>
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 mt-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-cards"
          style={{
            background: "transparent",
            border: "1px solid var(--color-smoke)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-ash)" }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="flex-1 bg-transparent outline-none"
            style={{
              color: "var(--color-bone)",
              fontSize: "13px",
              letterSpacing: "-0.01em",
              border: "none",
            }}
          />
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto mt-4 pb-4">
        {loading && (
          <div className="px-4 py-3 text-ash" style={{ fontSize: "12px" }}>
            Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-3 text-ash" style={{ fontSize: "12px" }}>
            {query ? "No matches." : "No chats yet. Start a new one ↑"}
          </div>
        )}
        {(["today", "yesterday", "earlier"] as const).map((bucket) => {
          const list = groups[bucket];
          if (list.length === 0) return null;
          const label =
            bucket === "today" ? "Today" : bucket === "yesterday" ? "Yesterday" : "Earlier";
          return (
            <div key={bucket} className="mb-3">
              <div
                className="px-4 mb-1.5"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--color-smoke)",
                }}
              >
                {label}
              </div>
              {list.map((s) => {
                const active = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => router.push(`/app/chat/${s.id}`)}
                    className="w-full text-left px-4 py-2 transition-colors cursor-pointer"
                    style={{
                      background: active ? "var(--color-carbon)" : "transparent",
                      borderLeft: active ? "2px solid var(--color-bone)" : "2px solid transparent",
                      color: active ? "var(--color-bone)" : "var(--color-ash)",
                      fontSize: "13px",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    <div className="truncate" style={{ lineHeight: 1.35 }}>
                      {s.title}
                    </div>
                    <div
                      className="mt-0.5"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "10px",
                        color: "var(--color-smoke)",
                      }}
                    >
                      {formatRel(s.updated_at)}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer link back to dashboard */}
      <div
        className="px-3 py-3"
        style={{ borderTop: "1px solid rgba(212, 208, 201, 0.08)" }}
      >
        <Link
          href="/app"
          className="flex items-center gap-2 px-3 py-2 rounded-cards"
          style={{
            color: "var(--color-ash)",
            fontSize: "12px",
            letterSpacing: "-0.01em",
            border: "1px solid var(--color-smoke)",
          }}
        >
          <span>←</span>
          <span>Back to dashboard</span>
        </Link>
      </div>
    </aside>
  );
}
