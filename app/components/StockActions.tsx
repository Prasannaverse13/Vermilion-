"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  symbol: string;
  onWatch: boolean;
  watchSource: "agent" | "user" | null;
  marketOpen: boolean;
};

export function StockActions({ symbol, onWatch, watchSource, marketOpen }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const toggleWatch = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        if (onWatch && watchSource === "user") {
          const res = await fetch(`/api/watchlist?sym=${encodeURIComponent(symbol)}`, {
            method: "DELETE",
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "Remove failed");
          setMsg("Removed from your watchlist.");
        } else {
          const res = await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "Add failed");
          setMsg("Added to your watchlist.");
        }
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const runEval = () => {
    setMsg("Opening chat — ask Vermilion to evaluate this symbol.");
    setTimeout(() => {
      router.push(`/app/chat?prefill=${encodeURIComponent(`Should I trade ${symbol} right now?`)}`);
    }, 600);
  };

  return (
    <div
      className="rounded-cards p-4 md:p-5 flex items-center gap-3 flex-wrap"
      style={{ background: "var(--color-graphite)" }}
    >
      <button
        type="button"
        onClick={toggleWatch}
        disabled={pending}
        className="px-4 py-2.5 rounded-buttons text-[14px] transition-colors disabled:opacity-50"
        style={{
          border: "1px solid var(--color-bone)",
          background: "var(--color-bone)",
          color: "var(--color-obsidian)",
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        {onWatch
          ? watchSource === "user"
            ? "Remove from watchlist"
            : "Promote to your pick"
          : "Add to watchlist"}
      </button>
      <button
        type="button"
        onClick={runEval}
        className="px-4 py-2.5 rounded-buttons text-[14px] text-bone-white transition-all"
        style={{ background: "var(--color-indigo-dusk)" }}
      >
        Evaluate {symbol} in chat
      </button>
      <span
        className="text-ash"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "11px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {marketOpen ? "● market open" : "○ market closed"}
      </span>
      {msg && (
        <span className="text-fog" style={{ fontSize: "13px" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
