"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SyncResult = {
  ok: true;
  account: {
    cash: number;
    equity: number;
    buying_power: number;
    portfolio_value: number;
    status: string;
  };
  positions: {
    symbol: string;
    qty: number;
    side: string;
    entry_price: number;
    current_price: number;
    market_value: number;
    unrealized_pl: number;
    unrealized_plpc: number;
  }[];
};

type EvaluateResult = {
  ok: boolean;
  marketOpen?: boolean;
  evaluated?: number;
  decisions?: {
    symbol: string;
    action: string;
    confidence: number;
    reasoning: string;
    order_id?: string;
    fill_price?: number;
    error?: string;
  }[];
  error?: string;
  message?: string;
};

export function AgentActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [evalResult, setEvalResult] = useState<EvaluateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSync = () => {
    setError(null);
    setEvalResult(null);
    setSyncResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/alpaca/sync", { method: "POST" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || `Sync failed (${res.status})`);
        }
        const j = (await res.json()) as SyncResult;
        setSyncResult(j);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const runEvaluate = () => {
    setError(null);
    setSyncResult(null);
    setEvalResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/cron/evaluate", { method: "POST" });
        const j = (await res.json()) as EvaluateResult;
        if (!res.ok) {
          throw new Error(j.message || j.error || `Evaluate failed (${res.status})`);
        }
        setEvalResult(j);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="henry-card p-5 md:p-6">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-1.5 h-1.5 rounded-full live-dot"
          style={{ background: "var(--color-bone)" }}
        />
        <h3
          className="text-bone-white"
          style={{ fontSize: "16px", letterSpacing: "-0.014em" }}
        >
          Manual override
        </h3>
      </div>
      <p
        className="text-ash mb-4"
        style={{ fontSize: "12px", lineHeight: 1.5 }}
      >
        The agent runs on its own — it wakes on stale data, on visit,
        and on the cron. Use these only when you want to force a
        cycle right now.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runEvaluate}
          disabled={pending}
          className="pill-primary disabled:opacity-50"
        >
          {pending ? "Running…" : "Run evaluation cycle"}
        </button>
        <button
          type="button"
          onClick={runSync}
          disabled={pending}
          className="pill-ghost disabled:opacity-50"
        >
          {pending ? "Syncing…" : "Sync from Alpaca"}
        </button>
      </div>

      {error && (
        <p
          className="mt-4 text-[13px]"
          style={{ color: "#f29a8e" }}
        >
          {error}
        </p>
      )}

      {syncResult && (
        <div
          className="mt-4 pt-4"
          style={{ borderTop: "1px solid #1a1a1f" }}
        >
          <p
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Alpaca account
          </p>
          <div
            className="mt-2 text-bone-white"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "13px",
            }}
          >
            <div>status · {syncResult.account.status}</div>
            <div>equity · ${syncResult.account.equity.toFixed(2)}</div>
            <div>cash · ${syncResult.account.cash.toFixed(2)}</div>
            <div>positions · {syncResult.positions.length}</div>
          </div>
        </div>
      )}

      {evalResult?.decisions && (
        <div
          className="mt-4 pt-4"
          style={{ borderTop: "1px solid #1a1a1f" }}
        >
          <p
            className="text-ash mb-2"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Last cycle · {evalResult.evaluated} symbols
            {evalResult.marketOpen === false ? " · market closed" : ""}
          </p>
          <ul className="space-y-2">
            {evalResult.decisions.slice(0, 6).map((d) => (
              <li
                key={d.symbol}
                className="flex items-start gap-3 text-[12px]"
              >
                <span
                  className="w-12 shrink-0 text-bone-white"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                  }}
                >
                  {d.symbol}
                </span>
                <span
                  className="w-16 shrink-0"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    color:
                      d.action === "refuse"
                        ? "#f29a8e"
                        : d.order_id
                          ? "#9fd9b4"
                          : "var(--color-fog)",
                  }}
                >
                  {d.action}
                </span>
                <span
                  className="w-10 shrink-0 text-right"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    color:
                      d.confidence >= 60 ? "#9fd9b4" : "var(--color-fog)",
                  }}
                >
                  {Math.round(d.confidence)}%
                </span>
                <span className="text-fog flex-1 leading-tight">
                  {d.reasoning}
                </span>
                {d.order_id && (
                  <span
                    className="shrink-0"
                    style={{
                      fontFamily: "var(--font-replica-mono)",
                      color: "#9fd9b4",
                      fontSize: "11px",
                    }}
                  >
                    ✓ {d.fill_price ? `$${d.fill_price.toFixed(2)}` : "filled"}
                  </span>
                )}
                {d.error && (
                  <span
                    className="shrink-0"
                    style={{
                      fontFamily: "var(--font-replica-mono)",
                      color: "#f29a8e",
                      fontSize: "11px",
                    }}
                  >
                    ✗ {d.error.slice(0, 32)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
