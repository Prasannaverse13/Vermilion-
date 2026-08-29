"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type OptionContract = {
  id: string;
  symbol: string;
  type: "call" | "put";
  strike_price: string;
  expiration_date: string;
  close_price?: string;
  tradeable: boolean;
};

type OptionSnapshot = {
  symbol: string;
  latestQuote?: { ap: number; bp: number };
  greeks?: { delta: number; gamma: number; theta: number; vega: number };
  impliedVolatility?: number;
};

type StrategyKind = "covered_call" | "protective_put" | "bull_call_spread" | "bear_put_spread";

const STRATEGY_LABEL: Record<StrategyKind, string> = {
  covered_call: "Covered call",
  protective_put: "Protective put",
  bull_call_spread: "Bull call spread",
  bear_put_spread: "Bear put spread",
};

const STRATEGY_BLURB: Record<StrategyKind, string> = {
  covered_call: "Sell 1 call per 100 shares you hold. Caps upside, collects premium.",
  protective_put: "Buy 1 put per 100 shares. Floors the loss, costs the premium.",
  bull_call_spread: "Buy a lower call, sell a higher call. Defined risk, defined reward.",
  bear_put_spread: "Buy a higher put, sell a lower put. Profits if underlying drops.",
};

export function OptionsWorkbench({
  initialSymbol,
  initialExpiry,
}: {
  initialSymbol?: string;
  initialExpiry?: string;
}) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(initialSymbol ?? "AAPL");
  const [expirations, setExpirations] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<string | undefined>(initialExpiry);
  const [contracts, setContracts] = useState<OptionContract[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, OptionSnapshot>>({});
  const [strategy, setStrategy] = useState<StrategyKind>("covered_call");
  const [strikeOffset, setStrikeOffset] = useState(2); // %
  const [longOffset, setLongOffset] = useState(2);
  const [shortOffset, setShortOffset] = useState(5);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [result, setResult] = useState<{ legs: { symbol: string; qty: number; side: string }[]; notes: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadExpirations = async (s: string) => {
    setExpirations([]);
    setExpiry(undefined);
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/alpaca/options?action=expirations&underlying=${encodeURIComponent(s)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "expirations_failed");
      setExpirations(j.expirations ?? []);
      // Pick the nearest expiry ≥ today
      const today = new Date().toISOString().slice(0, 10);
      const first = (j.expirations ?? []).find((e: string) => e >= today) ?? (j.expirations ?? [])[0];
      if (first) setExpiry(first);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadChain = async (s: string, e: string | undefined) => {
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: "chain", underlying: s });
      if (e) params.set("expiration", e);
      const r = await fetch(`/api/alpaca/options?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "chain_failed");
      const all = j.contracts ?? [];
      setContracts(all);
      // Fetch snapshots for the at-the-money strikes
      const strikes = Array.from(new Set(all.map((c: OptionContract) => Number(c.strike_price)))).sort(
        (a, b) => Number(a) - Number(b),
      ) as number[];
      if (strikes.length > 0) {
        const midIdx = Math.floor(strikes.length / 2);
        const nearAtm = strikes.slice(Math.max(0, midIdx - 5), Math.min(strikes.length, midIdx + 5));
        const syms = all
          .filter((c: OptionContract) => nearAtm.includes(Number(c.strike_price)))
          .map((c: OptionContract) => c.symbol);
        if (syms.length > 0) {
          const sr = await fetch(`/api/alpaca/options?action=quote&symbols=${syms.join(",")}`);
          const sj = await sr.json();
          if (sr.ok) setSnapshots(sj.snapshots ?? {});
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadExpirations(symbol); }, []);
  useEffect(() => { if (expiry) loadChain(symbol, expiry); }, [expiry, symbol]);

  const compose = async () => {
    if (!expiry) {
      setError("Pick an expiry first");
      return;
    }
    setComposing(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        kind: strategy,
        underlying: symbol,
        qty,
        expiry,
        ...(strategy === "covered_call" || strategy === "protective_put"
          ? { strike_offset_pct: strikeOffset }
          : { long_strike_offset_pct: longOffset, short_strike_offset_pct: shortOffset }),
      };
      const r = await fetch("/api/alpaca/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: payload }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "compose_failed");
      setResult(j);
      // The route already pushes legs into the queue; refresh to surface them.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setComposing(false);
    }
  };

  const calls = contracts.filter((c) => c.type === "call");
  const puts = contracts.filter((c) => c.type === "put");
  const strikes = Array.from(new Set(contracts.map((c) => Number(c.strike_price)))).sort(
    (a, b) => a - b,
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* LEFT: Symbol + Expiry + Chain */}
      <section
        className="rounded-cards p-5 md:p-6 lg:col-span-2"
        style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Underlying
            </span>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onBlur={() => loadExpirations(symbol)}
              className="px-3 py-2 outline-none"
              style={{
                background: "var(--color-graphite)",
                border: "1px solid var(--color-smoke)",
                borderRadius: 6,
                fontSize: "14px",
                color: "var(--color-bone)",
                fontFamily: "var(--font-replica-mono)",
              }}
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Expiration
            </span>
            <select
              value={expiry ?? ""}
              onChange={(e) => setExpiry(e.target.value || undefined)}
              className="px-3 py-2 outline-none"
              style={{
                background: "var(--color-graphite)",
                border: "1px solid var(--color-smoke)",
                borderRadius: 6,
                fontSize: "13px",
                color: "var(--color-bone)",
                fontFamily: "var(--font-replica-mono)",
              }}
            >
              <option value="">—</option>
              {expirations.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => loadExpirations(symbol)}
            disabled={loading}
            className="pill-ghost disabled:opacity-50"
            style={{ fontSize: "12px", padding: "8px 16px" }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && (
          <p
            className="mt-3"
            style={{ color: "var(--color-refuse)", fontSize: "12px" }}
          >
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <h3
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Calls
            </h3>
            <div className="mt-2 max-h-[360px] overflow-auto rounded-cards" style={{ background: "var(--color-graphite)" }}>
              <table className="w-full text-[11px]" style={{ fontFamily: "var(--font-replica-mono)" }}>
                <thead>
                  <tr style={{ color: "var(--color-ash)" }}>
                    <th className="text-left p-1.5">Strike</th>
                    <th className="text-right p-1.5">Bid</th>
                    <th className="text-right p-1.5">Ask</th>
                    <th className="text-right p-1.5">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => {
                    const s = snapshots[c.symbol];
                    return (
                      <tr key={c.symbol} style={{ borderTop: "1px solid #1a1a1f" }}>
                        <td className="p-1.5 text-bone-white">${c.strike_price}</td>
                        <td className="p-1.5 text-right text-fog">{s?.latestQuote?.bp?.toFixed(2) ?? "—"}</td>
                        <td className="p-1.5 text-right text-fog">{s?.latestQuote?.ap?.toFixed(2) ?? "—"}</td>
                        <td className="p-1.5 text-right text-fog">{s?.greeks?.delta?.toFixed(2) ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Puts
            </h3>
            <div className="mt-2 max-h-[360px] overflow-auto rounded-cards" style={{ background: "var(--color-graphite)" }}>
              <table className="w-full text-[11px]" style={{ fontFamily: "var(--font-replica-mono)" }}>
                <thead>
                  <tr style={{ color: "var(--color-ash)" }}>
                    <th className="text-left p-1.5">Strike</th>
                    <th className="text-right p-1.5">Bid</th>
                    <th className="text-right p-1.5">Ask</th>
                    <th className="text-right p-1.5">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {puts.map((c) => {
                    const s = snapshots[c.symbol];
                    return (
                      <tr key={c.symbol} style={{ borderTop: "1px solid #1a1a1f" }}>
                        <td className="p-1.5 text-bone-white">${c.strike_price}</td>
                        <td className="p-1.5 text-right text-fog">{s?.latestQuote?.bp?.toFixed(2) ?? "—"}</td>
                        <td className="p-1.5 text-right text-fog">{s?.latestQuote?.ap?.toFixed(2) ?? "—"}</td>
                        <td className="p-1.5 text-right text-fog">{s?.greeks?.delta?.toFixed(2) ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT: Strategy composer */}
      <section
        className="rounded-cards p-5 md:p-6"
        style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
      >
        <h3
          className="text-bone-white"
          style={{ fontSize: "16px", fontWeight: 500 }}
        >
          Strategy composer
        </h3>
        <p
          className="text-ash mt-1"
          style={{ fontSize: "12px", lineHeight: 1.5 }}
        >
          Pick a strategy. Vermilion composes the legs and parks them
          in your queue for sign-off.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(Object.keys(STRATEGY_LABEL) as StrategyKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStrategy(k)}
              className="rounded-cards p-3 text-left"
              style={{
                background: strategy === k ? "rgba(31, 226, 116, 0.06)" : "var(--color-graphite)",
                border: strategy === k ? "1px solid rgba(31, 226, 116, 0.4)" : "1px solid #1a1a1f",
                cursor: "pointer",
              }}
            >
              <p className="text-bone-white" style={{ fontSize: "13px", fontWeight: 500 }}>
                {STRATEGY_LABEL[k]}
              </p>
              <p
                className="text-fog mt-1"
                style={{ fontSize: "11px", lineHeight: 1.4 }}
              >
                {STRATEGY_BLURB[k]}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          <label className="flex flex-col gap-1">
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Contracts
            </span>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
              className="px-3 py-2 outline-none"
              style={{
                background: "var(--color-graphite)",
                border: "1px solid var(--color-smoke)",
                borderRadius: 6,
                fontSize: "14px",
                color: "var(--color-bone)",
                fontFamily: "var(--font-replica-mono)",
              }}
            />
          </label>
          {strategy === "covered_call" || strategy === "protective_put" ? (
            <label className="flex flex-col gap-1">
              <span
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Strike offset (% {strategy === "covered_call" ? "OTM" : "ITM"})
              </span>
              <input
                type="number"
                step={0.5}
                value={strikeOffset}
                onChange={(e) => setStrikeOffset(Number(e.target.value))}
                className="px-3 py-2 outline-none"
                style={{
                  background: "var(--color-graphite)",
                  border: "1px solid var(--color-smoke)",
                  borderRadius: 6,
                  fontSize: "14px",
                  color: "var(--color-bone)",
                  fontFamily: "var(--font-replica-mono)",
                }}
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span
                  className="text-ash"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Long offset %
                </span>
                <input
                  type="number"
                  step={0.5}
                  value={longOffset}
                  onChange={(e) => setLongOffset(Number(e.target.value))}
                  className="px-3 py-2 outline-none"
                  style={{
                    background: "var(--color-graphite)",
                    border: "1px solid var(--color-smoke)",
                    borderRadius: 6,
                    fontSize: "13px",
                    color: "var(--color-bone)",
                    fontFamily: "var(--font-replica-mono)",
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span
                  className="text-ash"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Short offset %
                </span>
                <input
                  type="number"
                  step={0.5}
                  value={shortOffset}
                  onChange={(e) => setShortOffset(Number(e.target.value))}
                  className="px-3 py-2 outline-none"
                  style={{
                    background: "var(--color-graphite)",
                    border: "1px solid var(--color-smoke)",
                    borderRadius: 6,
                    fontSize: "13px",
                    color: "var(--color-bone)",
                    fontFamily: "var(--font-replica-mono)",
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={compose}
          disabled={composing || !expiry}
          className="pill-primary disabled:opacity-50 w-full mt-5"
          style={{ padding: "12px 20px", fontSize: "13px" }}
        >
          {composing ? "Composing…" : "Compose + queue for sign-off"}
        </button>

        {result && (
          <div
            className="mt-4 rounded-cards p-3"
            style={{ background: "var(--color-graphite)", border: "1px solid #1a1a1f" }}
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
              {result.legs.length} leg{result.legs.length === 1 ? "" : "s"} queued
            </p>
            <ul className="mt-1 space-y-1" style={{ fontFamily: "var(--font-replica-mono)", fontSize: "12px" }}>
              {result.legs.map((l, i) => (
                <li key={i} className="text-bone-white">
                  {l.side.toUpperCase()} {l.qty} {l.symbol}
                </li>
              ))}
            </ul>
            <p className="text-fog mt-2" style={{ fontSize: "11px", lineHeight: 1.5 }}>
              {result.notes}
            </p>
            <a
              href="/app/queue"
              className="text-bone-white mt-2 inline-block"
              style={{ fontSize: "12px", textDecoration: "underline" }}
            >
              Open the queue →
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
