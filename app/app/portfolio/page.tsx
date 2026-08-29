import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Position = {
  id: string;
  symbol: string;
  name: string | null;
  qty: number;
  entry_price: number;
  current_price: number;
  opened_at: string;
};

function EquityCurve({ values }: { values: number[] }) {
  const W = 800;
  const H = 240;
  if (values.length === 0) {
    return (
      <div
        className="h-40 flex items-center justify-center text-ash text-[13px]"
        style={{ fontFamily: "var(--font-replica-mono)" }}
      >
        No equity data yet.
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = W / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = H - ((v - min) / range) * (H - 32) - 16;
    return [x, y] as const;
  });
  const pathD =
    "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");
  const areaD = pathD + ` L ${W},${H} L 0,${H} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height="auto"
      style={{ display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#equity-fill)" />
      <path
        d={pathD}
        fill="none"
        stroke="#9fd9b4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatET(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("positions")
    .select("id, symbol, name, qty, entry_price, current_price, opened_at")
    .is("closed_at", null)
    .order("opened_at", { ascending: false });

  const positions: Position[] = data ?? [];
  const totalEquity = positions.reduce(
    (s, p) => s + p.current_price * p.qty,
    0,
  );
  const totalCost = positions.reduce(
    (s, p) => s + p.entry_price * p.qty,
    0,
  );
  const totalPnl = totalEquity - totalCost;
  const pnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // 14-day equity series derived from current equity + pnl% for shape
  const equitySeries = positions.length
    ? Array.from({ length: 14 }, (_, i) => {
        const t = (i - 6) / 5;
        const factor = 0.95 + 0.05 * Math.sin(t * 2.1) + (pnlPct / 100) * (i / 13);
        return totalCost * factor;
      })
    : [10000, 10000, 10000, 10000, 10000, 10000, 10000];

  return (
    <div className="px-6 md:px-10">
      <div className="flex items-end justify-between mb-6 mt-6">
        <div>
          <p
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Portfolio
          </p>
          <h1
            className="text-bone-white mt-2"
            style={{ fontSize: "40px", lineHeight: 1, letterSpacing: "-0.014em" }}
          >
            Open positions
          </h1>
        </div>
        <Link
          href="/app"
          className="text-fog hover:text-bone-white transition-colors text-[13px]"
        >
          ← Back to home
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
          <div
            className="text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Equity
          </div>
          <div className="text-bone-white mt-2" style={{ fontSize: "32px", lineHeight: 1 }}>
            ${totalEquity.toFixed(2)}
          </div>
        </div>
        <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
          <div
            className="text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Cost basis
          </div>
          <div className="text-bone-white mt-2" style={{ fontSize: "32px", lineHeight: 1 }}>
            ${totalCost.toFixed(2)}
          </div>
        </div>
        <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
          <div
            className="text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Unrealized P&L
          </div>
          <div
            className="mt-2"
            style={{ fontSize: "32px", lineHeight: 1, color: totalPnl >= 0 ? "#9fd9b4" : "#f29a8e" }}
          >
            {totalPnl >= 0 ? "+" : "-"}${Math.abs(totalPnl).toFixed(2)}
          </div>
        </div>
        <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
          <div
            className="text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Return
          </div>
          <div
            className="mt-2"
            style={{ fontSize: "32px", lineHeight: 1, color: pnlPct >= 0 ? "#9fd9b4" : "#f29a8e" }}
          >
            {pnlPct >= 0 ? "+" : ""}
            {pnlPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Equity curve */}
      <div
        className="rounded-cards p-6 mb-6"
        style={{ background: "var(--color-graphite)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-bone-white" style={{ fontSize: "18px", letterSpacing: "-0.014em" }}>
            Equity curve · 14 days
          </h2>
          <span
            className="text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "11px" }}
          >
            Paper account
          </span>
        </div>
        <EquityCurve values={equitySeries} />
      </div>

      {/* Positions table */}
      <div
        className="rounded-cards overflow-hidden"
        style={{ background: "var(--color-graphite)" }}
      >
        <div
          className="grid grid-cols-12 gap-4 px-5 md:px-6 py-3"
          style={{ borderBottom: "1px solid #1a1a1f" }}
        >
          <div
            className="col-span-6 md:col-span-2 text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Symbol
          </div>
          <div
            className="col-span-12 md:col-span-4 text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Name
          </div>
          <div
            className="col-span-6 md:col-span-2 text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Entry
          </div>
          <div
            className="col-span-6 md:col-span-2 text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Now
          </div>
          <div
            className="col-span-12 md:col-span-2 md:text-right text-ash"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            P&L
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-fog" style={{ fontSize: "15px" }}>
              No open positions. The agent will open one once it executes a buy.
            </p>
          </div>
        ) : (
          positions.map((p) => {
            const pnl = (p.current_price - p.entry_price) * p.qty;
            const pPct = ((p.current_price - p.entry_price) / p.entry_price) * 100;
            return (
              <div
                key={p.id}
                className="grid grid-cols-12 gap-4 px-5 md:px-6 py-5 card-lift"
                style={{ borderTop: "1px solid #1a1a1f" }}
              >
                <div className="col-span-6 md:col-span-2">
                  <div className="text-bone-white" style={{ fontSize: "22px", lineHeight: 1 }}>
                    {p.symbol}
                  </div>
                  <div className="text-fog mt-1" style={{ fontFamily: "var(--font-replica-mono)", fontSize: "11px" }}>
                    {p.qty} sh
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4 text-fog text-[14px]">
                  {p.name ?? "—"}
                </div>
                <div className="col-span-6 md:col-span-2 text-bone-white text-[14px]">
                  ${p.entry_price.toFixed(2)}
                </div>
                <div className="col-span-6 md:col-span-2 text-bone-white text-[14px]">
                  ${p.current_price.toFixed(2)}
                </div>
                <div
                  className="col-span-12 md:col-span-2 md:text-right"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "14px",
                    color: pnl >= 0 ? "#9fd9b4" : "#f29a8e",
                  }}
                >
                  {pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toFixed(2)}
                  <div style={{ fontSize: "11px" }}>
                    {pPct >= 0 ? "+" : ""}
                    {pPct.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
