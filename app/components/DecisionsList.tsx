"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Decision = {
  id: string;
  symbol: string;
  action: string;
  refused: boolean;
  confidence: number | null;
  threshold: number;
  reasoning: string | null;
  sources: { tag: string; text: string }[] | null;
  qty: number | null;
  price: number | null;
  created_at: string;
};

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "executed", label: "Executed" },
  { id: "refused", label: "Refused" },
];

const actionTitle = (d: Decision) => {
  if (d.refused) {
    if (d.action === "refuse") return `Refused to evaluate ${d.symbol}`;
    return `Refused to ${d.action} ${d.symbol}`;
  }
  const qty = d.qty ? `${d.qty} ` : "";
  const price = d.price ? ` @ $${Number(d.price).toFixed(2)}` : "";
  switch (d.action) {
    case "buy": return `Bought ${qty}${d.symbol}${price}`;
    case "sell": return `Sold ${qty}${d.symbol}${price}`;
    case "short": return `Shorted ${qty}${d.symbol}${price}`;
    case "cover": return `Covered ${qty}${d.symbol}${price}`;
    default: return `${d.action} ${qty}${d.symbol}${price}`;
  }
};

const formatET = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function DecisionsList({
  decisions,
  symbols,
  activeFilter,
  activeSymbol,
}: {
  decisions: Decision[];
  symbols: string[];
  activeFilter: string;
  activeSymbol: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  const open = openId ? decisions.find((d) => d.id === openId) ?? null : null;

  const navigate = (filter: string, symbol: string) => {
    const params = new URLSearchParams();
    if (filter && filter !== "all") params.set("filter", filter);
    if (symbol) params.set("symbol", symbol);
    const qs = params.toString();
    router.push(qs ? `/app/decisions?${qs}` : "/app/decisions");
  };

  return (
    <>
      <div
        className="rounded-cards p-4 mt-6 flex items-center gap-3 flex-wrap"
        style={{ background: "var(--color-graphite)" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => navigate(f.id, activeSymbol)}
              className="px-3 py-1.5 rounded-pills text-[12px] transition-colors"
              style={{
                fontFamily: "var(--font-replica-mono)",
                border: "1px solid " + (activeFilter === f.id ? "var(--color-indigo-dusk)" : "var(--color-fog)"),
                color: activeFilter === f.id ? "var(--color-bone-white)" : "var(--color-fog)",
                background: activeFilter === f.id ? "rgba(139, 154, 255, 0.1)" : "transparent",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {symbols.length > 0 && (
          <>
            <span className="text-ash">·</span>
            <div className="flex items-center gap-2 flex-wrap">
              {activeSymbol && (
                <button
                  type="button"
                  onClick={() => navigate(activeFilter, "")}
                  className="px-3 py-1.5 rounded-pills text-[12px] text-bone-white transition-colors"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    background: "rgba(244, 114, 114, 0.18)",
                    border: "1px solid rgba(244, 114, 114, 0.32)",
                  }}
                >
                  clear filter ×
                </button>
              )}
              {symbols.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    navigate(activeFilter, activeSymbol === s ? "" : s)
                  }
                  className="px-2.5 py-1 rounded-pills text-[12px] transition-colors"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    border: "1px solid " + (activeSymbol === s ? "#9fd9b4" : "var(--color-fog)"),
                    color: activeSymbol === s ? "#9fd9b4" : "var(--color-fog)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {decisions.length === 0 ? (
        <div
          className="rounded-cards p-8 mt-3 text-center"
          style={{ background: "var(--color-graphite)" }}
        >
          <p className="text-fog" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            No decisions match the current filter. Run the agent to populate
            this log.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {decisions.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setOpenId(d.id)}
              className="text-left rounded-cards p-5 md:p-6 card-lift"
              style={{ background: "var(--color-graphite)" }}
            >
              <div className="grid grid-cols-12 gap-4 items-start">
                <div
                  className="col-span-12 md:col-span-2 text-fog"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "13px",
                    lineHeight: 1.2,
                  }}
                >
                  {formatET(d.created_at)} ET
                </div>
                <div className="col-span-12 md:col-span-4">
                  <h3
                    className="text-bone-white font-normal flex items-center gap-3 flex-wrap"
                    style={{
                      fontSize: "22px",
                      lineHeight: 1.15,
                      letterSpacing: "-0.014em",
                    }}
                  >
                    <span>{actionTitle(d)}</span>
                    {d.refused && (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-pills text-[11px] refused-pulse"
                        style={{
                          fontFamily: "var(--font-replica-mono)",
                          color: "var(--color-bone-white)",
                          background: "rgba(244, 114, 114, 0.18)",
                          border: "1px solid rgba(244, 114, 114, 0.32)",
                        }}
                      >
                        REFUSED
                      </span>
                    )}
                  </h3>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <p className="text-fog" style={{ fontSize: "15px", lineHeight: 1.4 }}>
                    {d.reasoning ?? "—"}
                  </p>
                </div>
                <div className="col-span-12 md:col-span-2 flex md:justify-end flex-wrap gap-2">
                  {d.confidence != null && (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pills"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "12px",
                        color:
                          d.confidence >= d.threshold
                            ? "#9fd9b4"
                            : d.refused
                              ? "#f29a8e"
                              : "var(--color-bone-white)",
                        background:
                          d.confidence >= d.threshold
                            ? "rgba(16, 185, 129, 0.12)"
                            : d.refused
                              ? "rgba(244, 114, 114, 0.12)"
                              : "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {Math.round(d.confidence)}%
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Side panel for full decision detail */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setOpenId(null)}
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.6)" }}
          />
          <div
            className="relative w-full max-w-md h-full overflow-y-auto p-6"
            style={{ background: "var(--color-graphite)", borderLeft: "1px solid #1a1a1f" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="text-fog hover:text-bone-white text-[14px] mb-4"
            >
              × Close
            </button>
            <div
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {formatET(open.created_at)} ET
            </div>
            <h2
              className="text-bone-white mt-2"
              style={{ fontSize: "28px", lineHeight: 1.1, letterSpacing: "-0.014em" }}
            >
              {actionTitle(open)}
            </h2>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {open.refused && (
                <span
                  className="px-2.5 py-0.5 rounded-pills text-[11px]"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    color: "var(--color-bone-white)",
                    background: "rgba(244, 114, 114, 0.18)",
                    border: "1px solid rgba(244, 114, 114, 0.32)",
                  }}
                >
                  REFUSED
                </span>
              )}
              {open.confidence != null && (
                <span
                  className="px-2.5 py-0.5 rounded-pills"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "12px",
                    color: open.confidence >= open.threshold ? "#9fd9b4" : "var(--color-ash)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {Math.round(open.confidence)}% conf · threshold {open.threshold}%
                </span>
              )}
            </div>
            <div className="mt-5">
              <div
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Reasoning
              </div>
              <p
                className="text-bone-white mt-2"
                style={{ fontSize: "15px", lineHeight: 1.5 }}
              >
                {open.reasoning ?? "—"}
              </p>
            </div>
            {open.sources && open.sources.length > 0 && (
              <div className="mt-5">
                <div
                  className="text-ash"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Sources
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {open.sources.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2"
                      style={{ fontSize: "13px", lineHeight: 1.4 }}
                    >
                      <span className="text-[#fbbf24] shrink-0">●</span>
                      <span className="text-ash shrink-0" style={{ fontFamily: "var(--font-replica-mono)" }}>
                        {s.tag}
                      </span>
                      <span className="text-bone-white">{s.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link
              href={`/app/stocks/${open.symbol}`}
              className="inline-block mt-6 text-fog hover:text-bone-white text-[13px] transition-colors"
            >
              Open {open.symbol} detail page →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
