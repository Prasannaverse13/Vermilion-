"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  symbol: string;
  source: "agent" | "user";
  added_at: string;
};

const SUGGESTIONS = [
  "TSLA", "NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "SPY",
  "QQQ", "VTI", "JPM", "AMD", "NFLX", "DIS", "BABA", "ORCL", "CRM",
  "INTC", "PYPL", "SHOP", "UBER", "SQ", "COIN", "PLTR",
];

export function WatchlistManager({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const symbols = new Set(items.map((i) => i.symbol));
  const suggestions = SUGGESTIONS.filter((s) => !symbols.has(s)).slice(0, 8);

  const add = (sym: string) => {
    setError(null);
    const clean = sym.trim().toUpperCase();
    if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(clean)) {
      setError("Symbol must be 1–6 letters (e.g. AAPL, BRK.B).");
      return;
    }
    if (symbols.has(clean)) {
      setError(`${clean} is already on your watchlist.`);
      return;
    }
    if (items.length >= 20) {
      setError("Watchlist cap is 20 symbols.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: clean }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Add failed");
        setItems((prev) => {
          // If it was an agent default, swap the source to user
          const exists = prev.find((p) => p.symbol === clean);
          if (exists) {
            return prev.map((p) =>
              p.symbol === clean ? { ...p, source: "user" } : p,
            );
          }
          return [...prev, j.item];
        });
        setDraft("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const remove = (sym: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/watchlist?sym=${encodeURIComponent(sym)}`, {
          method: "DELETE",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Remove failed");
        setItems((prev) => prev.filter((p) => p.symbol !== sym));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim()) add(draft);
  };

  return (
    <div
      className="rounded-cards p-5 md:p-6"
      style={{ background: "var(--color-graphite)" }}
    >
      <form onSubmit={onSubmit} className="flex items-center gap-3 flex-wrap">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add symbol (e.g. AAPL)"
          maxLength={8}
          className="px-4 py-3 rounded-buttons text-bone-white outline-none focus:ring-1 transition-all w-56"
          style={{
            background: "rgba(212, 208, 201, 0.1)",
            border: "1px solid #2a2a32",
            fontFamily: "var(--font-replica-mono)",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-3 rounded-buttons text-[14px] transition-all disabled:opacity-50"
          style={{
            background: "var(--color-bone)",
            color: "var(--color-obsidian)",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {pending ? "Adding…" : "Add to watchlist"}
        </button>
        {error && (
          <span style={{ color: "#f29a8e", fontSize: "13px" }}>{error}</span>
        )}
      </form>

      {suggestions.length > 0 && (
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Suggestions
          </span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              disabled={pending}
              className="px-2.5 py-1 rounded-pills text-[12px] text-fog transition-colors hover:text-bone-white disabled:opacity-50"
              style={{
                fontFamily: "var(--font-replica-mono)",
                border: "1px solid var(--color-fog)",
              }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-buttons"
            style={{ background: "rgba(212, 208, 201, 0.1)", border: "1px solid #2a2a32" }}
          >
            <Link
              href={`/app/stocks/${encodeURIComponent(it.symbol)}`}
              className="text-bone-white hover:underline"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "14px",
              }}
            >
              {it.symbol}
            </Link>
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "9px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: it.source === "agent" ? "var(--color-bone)" : "#9fd9b4",
                }}
                title={it.source === "agent" ? "Agent default" : "Your pick"}
              >
                {it.source}
              </span>
              {it.source === "user" && (
                <button
                  type="button"
                  onClick={() => remove(it.symbol)}
                  disabled={pending}
                  className="text-ash hover:text-bone-white transition-colors text-[14px] disabled:opacity-50"
                  aria-label={`Remove ${it.symbol}`}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div
            className="col-span-full text-center py-8 text-fog"
            style={{ fontSize: "14px" }}
          >
            Empty watchlist. Add a symbol above to get started.
          </div>
        )}
      </div>
    </div>
  );
}
