"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatSidebar } from "./ChatSidebar";
import { ChatBox } from "./ChatBox";
import { ChatSourcesPanel } from "./ChatSourcesPanel";

type Meta = null | {
  symbol?: string;
  action?: "buy" | "sell" | "short" | "cover";
  qty?: number;
  confidence?: number;
  reasoning?: string;
  sources?: { tag: string; text: string }[];
  lastPrice?: number;
  order_id?: string;
  fill_price?: number;
};

type Msg = {
  id: string;
  role: "user" | "assistant" | "proposal";
  content: string;
  meta: Meta;
  created_at: string;
};

export function ChatFrame({
  sessionId,
  initialMessages,
  title,
}: {
  sessionId: string | null;
  initialMessages: Msg[];
  title: string;
}) {
  const router = useRouter();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId);
  const [sources, setSources] = useState<{ tag: string; text: string }[]>([]);
  const [account, setAccount] = useState<{ equity: number; cash: number; buying_power: number } | null>(null);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<{ symbol: string; last: number | null } | null>(null);

  // Pull static context once (account + watchlist size) for the right panel
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [acct, wl] = await Promise.all([
          fetch("/api/alpaca/account").then((r) => r.json()).catch(() => null),
          fetch("/api/watchlist").then((r) => r.json()).catch(() => null),
        ]);
        if (cancelled) return;
        if (acct && typeof acct.equity === "number") {
          setAccount({ equity: acct.equity, cash: acct.cash, buying_power: acct.buying_power });
        }
        if (wl && Array.isArray(wl.symbols)) setWatchlistCount(wl.symbols.length);
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // When sources include ALPACA, pin a live snapshot
  useEffect(() => {
    const alpaca = sources.find((s) => s.tag === "ALPACA");
    if (!alpaca) {
      setLiveSnapshot(null);
      return;
    }
    const m = alpaca.text.match(/^([A-Z]{1,5})\s+@\s+\$([0-9.]+)/);
    if (!m) return;
    setLiveSnapshot({ symbol: m[1], last: Number(m[2]) });
  }, [sources]);

  const handleSessionCreated = (id: string) => {
    setActiveSessionId(id);
    // Navigate so the URL reflects the new session
    router.replace(`/app/chat/${id}`);
  };

  return (
    <div className="flex w-full h-full" style={{ minHeight: 0 }}>
      <ChatSidebar activeId={activeSessionId ?? undefined} />
      <main className="flex-1 min-w-0 h-full flex flex-col">
        <ChatBox
          initial={initialMessages}
          sessionId={activeSessionId}
          onSessionCreated={handleSessionCreated}
          onSources={setSources}
        />
      </main>
      <ChatSourcesPanel
        liveSnapshot={liveSnapshot}
        account={account}
        watchlistCount={watchlistCount ?? undefined}
      />
    </div>
  );
}
