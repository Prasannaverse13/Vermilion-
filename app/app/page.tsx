import Link from "next/link";
import { CountUp } from "../components/CountUp";
import { Reveal } from "../components/Reveal";
import { createClient } from "@/lib/supabase/server";
import { AgentActions } from "../components/AgentActions";
import { AutonomyStatus } from "../components/AutonomyStatus";
import { NewsTicker } from "../components/NewsTicker";
import { getAccountSummary, getPortfolioHistory, isMarketOpen } from "@/lib/alpaca/server";
import { EquityChart } from "../components/EquityChart";
import { maybeWakeOnVisit, STALE_AFTER_MS } from "@/lib/agent/autonomy";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

type Position = {
  id: string;
  symbol: string;
  name: string | null;
  qty: number;
  entry_price: number;
  current_price: number;
  opened_at: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatET(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatETDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return formatET(iso) + " ET";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday · " + formatET(iso);
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const actionTitle = (d: Decision) => {
  if (d.refused) {
    if (d.action === "refuse") return `Refused to evaluate ${d.symbol}`;
    return `Refused to ${d.action} ${d.symbol}`;
  }
  const qty = d.qty ? `${d.qty} ` : "";
  const price = d.price ? ` @ $${Number(d.price).toFixed(2)}` : "";
  switch (d.action) {
    case "buy":
      return `Bought ${qty}${d.symbol}${price}`;
    case "sell":
      return `Sold ${qty}${d.symbol}${price}`;
    case "short":
      return `Shorted ${qty}${d.symbol}${price}`;
    case "cover":
      return `Covered ${qty}${d.symbol}${price}`;
    default:
      return `${d.action} ${qty}${d.symbol}${price}`;
  }
};

const refusalTag = (d: Decision) => {
  if (d.refused) return ["Discipline", "Risk Gate"];
  return ["Executed"];
};

/* ------------------------------------------------------------------ */
/*  Equity chart moved to components/EquityChart.tsx                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Tiles                                                              */
/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  delta,
  positive = true,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <div className="henry-card p-5 md:p-6">
      <div className="eyebrow">{label}</div>
      <div
        className="text-bone mt-3"
        style={{
          fontSize: "32px",
          lineHeight: 1,
          letterSpacing: "-0.025em",
          fontWeight: 400,
        }}
      >
        {value}
      </div>
      {delta && (
        <div
          className="mt-2"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "11px",
            color: positive ? "var(--color-execute)" : "var(--color-refuse)",
          }}
        >
          {positive ? "▲" : "▼"} {delta}
        </div>
      )}
    </div>
  );
}

function MonitoringItem({
  symbol,
  status,
  detail,
}: {
  symbol: string;
  status: "watching" | "evaluating" | "idle";
  detail: string;
}) {
  const color =
    status === "evaluating"
      ? "var(--color-caution)"
      : status === "watching"
        ? "var(--color-bone)"
        : "#858893";
  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderTop: "1px solid #1a1a1f" }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
        style={{
          background: color,
          boxShadow: status === "evaluating" ? `0 0 0 3px ${color}33` : "none",
        }}
      />
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="text-bone-white"
            style={{ fontSize: "15px", letterSpacing: "-0.01em" }}
          >
            {symbol}
          </span>
          <span
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {status}
          </span>
        </div>
        <p className="text-fog text-[13px] mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

function DecisionRow({ d, live = false }: { d: Decision; live?: boolean }) {
  const tags = refusalTag(d);
  return (
    <article
      className="rounded-cards p-5 md:p-6 card-lift"
      style={{ background: "var(--color-graphite)" }}
    >
      <div className="grid grid-cols-12 gap-4 items-start">
        <div
          className="col-span-12 md:col-span-2 text-fog flex items-center gap-2"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "13px",
            lineHeight: 1.2,
          }}
        >
          {live && (
            <span
              className="w-1.5 h-1.5 rounded-full feed-dot shrink-0"
              style={{ background: "var(--color-bone)" }}
              aria-label="live"
            />
          )}
          {formatETDay(d.created_at)}
        </div>
        <div className="col-span-12 md:col-span-4">
          <h3
            className="text-bone-white font-normal flex items-center gap-3 flex-wrap"
            style={{
              fontSize: "24px",
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
          <p
            className="text-fog"
            style={{ fontSize: "15px", lineHeight: 1.4 }}
          >
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
              {Math.round(d.confidence)}% conf
            </span>
          )}
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pills text-fog"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "12px",
                border: "1px solid var(--color-fog)",
              }}
            >
              <span aria-hidden>○</span>
              {t}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function SectionHeader({
  children,
  count,
  href,
}: {
  children: React.ReactNode;
  count?: string | number;
  href?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-5 mt-12">
      <h2
        className="text-bone-white font-normal"
        style={{
          fontSize: "22px",
          lineHeight: 1.2,
          letterSpacing: "-0.014em",
        }}
      >
        {children}
        {count != null && (
          <span
            className="text-fog ml-3"
            style={{ fontSize: "16px", fontWeight: 400 }}
          >
            — {count}
          </span>
        )}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-fog hover:text-bone-white transition-colors text-[13px]"
        >
          View all →
        </Link>
      )}
    </div>
  );
}

function MaciejBreadcrumb({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mt-12 md:mt-16">
      <span
        className="text-bone-white"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "13px",
          letterSpacing: "-0.014em",
        }}
      >
        {title}
      </span>
      <span className="text-fog" style={{ fontSize: "14px" }}>→</span>
    </div>
  );
}

function ShowcaseFrame({
  label,
  tags,
  children,
  live = true,
}: {
  label: string;
  tags: string[];
  children: React.ReactNode;
  live?: boolean;
}) {
  return (
    <div
      className="rounded-cards overflow-hidden mt-5"
      style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
    >
      <div
        className="flex items-center justify-between px-5 py-3 flex-wrap gap-2"
        style={{ borderBottom: "1px solid #1a1a1f" }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="text-bone-white"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "12px",
              letterSpacing: "-0.014em",
            }}
          >
            {label}
          </span>
          <div className="flex items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2.5 py-0.5 rounded-pills text-fog"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                  border: "1px solid var(--color-fog)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        {live && (
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full live-dot"
              style={{ background: "var(--color-bone)" }}
            />
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              live
            </span>
          </div>
        )}
      </div>
      <div className="p-5 md:p-7">{children}</div>
    </div>
  );
}

function McpConsole({ d }: { d: Decision | null }) {
  const sources = (d?.sources as { tag: string; text: string }[] | null) ?? [
    { tag: "REUTERS", text: "—" },
    { tag: "SEC 10-Q", text: "—" },
    { tag: "BLOOMBERG", text: "—" },
    { tag: "TECHNICAL", text: "—" },
  ];
  return (
    <ShowcaseFrame label="vermilion / mcp-console" tags={["MCP", "ALPACA", "DEEPSEEK"]}>
      <div
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "12px",
          lineHeight: 1.65,
        }}
      >
        <div className="flex items-start gap-2">
          <span className="text-fog shrink-0">$</span>
          <span className="text-bone-white">
            deepseek&nbsp;
            <span style={{ color: "#9fd9b4" }}>
              &ldquo;should I {d?.action ?? "evaluate"} {d?.symbol ?? "—"} right now?&rdquo;
            </span>
          </span>
        </div>

        <div
          className="mt-4 rounded-cards p-4"
          style={{ background: "#15151a", border: "1px solid #1a1a1f" }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full live-dot"
                style={{ background: "var(--color-bone)" }}
              />
              <span className="text-bone-white">vermilion.evaluate</span>
              <span className="text-ash">→</span>
              <span className="text-fog">{d?.symbol ?? "—"}</span>
            </div>
            <span className="text-ash text-[10px]">last 312ms</span>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
            {sources.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[#fbbf24] shrink-0">●</span>
                <span className="text-ash shrink-0">{s.tag}</span>
                <span className="text-bone-white">{s.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="mt-4 rounded-cards p-4"
          style={{
            background: d?.refused
              ? "rgba(244, 114, 114, 0.06)"
              : "rgba(16, 185, 129, 0.06)",
            border: d?.refused
              ? "1px solid rgba(244, 114, 114, 0.28)"
              : "1px solid rgba(16, 185, 129, 0.28)",
          }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span
              style={{
                color: d?.refused ? "#f43f5e" : "#10b981",
              }}
            >
              {d?.refused ? "✗ REFUSED" : "✓ EXECUTED"}
            </span>
            <span className="text-ash">·</span>
            <span className="text-bone-white">
              net confidence{" "}
              <span
                style={{
                  color:
                    (d?.confidence ?? 0) >= (d?.threshold ?? 60)
                      ? "#9fd9b4"
                      : "#f29a8e",
                }}
              >
                {d?.confidence != null ? Math.round(d.confidence) : "—"}%
              </span>
            </span>
            <span className="text-ash">·</span>
            <span className="text-fog">threshold {d?.threshold ?? 60}%</span>
          </div>
          {d?.reasoning && (
            <p
              className="text-bone-white mt-2"
              style={{
                fontFamily: "var(--font-replica-regular)",
                fontSize: "14px",
                lineHeight: 1.4,
                letterSpacing: "-0.014em",
              }}
            >
              &ldquo;{d.reasoning}&rdquo;
            </p>
          )}
        </div>
      </div>
    </ShowcaseFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default async function AppHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Self-wake ---------------------------------------------------------
  // If the user lands here and the last decision is older than
  // STALE_AFTER_MS, kick a cycle in the background before the page
  // renders. This is the single biggest "is it autonomous?" signal —
  // the agent shows up working without anyone clicking a button.
  const wake = user ? await maybeWakeOnVisit(user.id).catch(() => null) : null;

  // Pull real data from Supabase + Alpaca (in parallel, with graceful
  // fallbacks if the paper account is unreachable).
  const [
    { data: decisionsData },
    { data: positionsData },
    alpacaAcct,
    alpacaHistory,
    marketOpenNow,
  ] = await Promise.all([
    supabase
      .from("decisions")
      .select("id, symbol, action, refused, confidence, threshold, reasoning, sources, qty, price, created_at")
      .order("created_at", { ascending: false })
      .limit(11),
    supabase
      .from("positions")
      .select("id, symbol, name, qty, entry_price, current_price, opened_at")
      .is("closed_at", null)
      .order("opened_at", { ascending: false }),
    getAccountSummary().catch(() => null),
    getPortfolioHistory("2W", "1D").catch(() => null),
    isMarketOpen().catch(() => false),
  ]);

  const decisions: Decision[] = decisionsData ?? [];
  const positions: Position[] = positionsData ?? [];

  const recent = decisions.slice(0, 5);
  const top = recent[0];

  // Initial AutonomyStatus — derived from the same data we just fetched.
  const lastDecisionAt = decisions[0]?.created_at ?? null;
  const ageMs = lastDecisionAt ? Date.now() - new Date(lastDecisionAt).getTime() : null;
  // Prefer the live Alpaca account equity over the sum of local
  // positions so the chart and KPI strip match the broker.
  const positionsSum = positions.reduce(
    (s, p) => s + p.current_price * p.qty,
    0,
  );
  const totalEquity = (alpacaAcct?.equity && alpacaAcct.equity > 0)
    ? alpacaAcct.equity
    : (positionsSum > 0 ? positionsSum : 10000);
  const totalPnl = positions.reduce(
    (s, p) => s + (p.current_price - p.entry_price) * p.qty,
    0,
  );
  const baseValue = alpacaHistory?.base_value ?? totalEquity;
  const basePct = (alpacaAcct?.equity && baseValue > 0)
    ? ((alpacaAcct.equity - baseValue) / baseValue) * 100
    : 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const decisions24h = decisions.filter(
    (d) => new Date(d.created_at) >= today,
  );
  const refused24h = decisions24h.filter((d) => d.refused).length;

  // 14-day equity series: prefer real Alpaca portfolio history,
  // fall back to a deterministic curve when no history is available
  // (e.g. brand-new paper account).
  let equitySeries: number[];
  if (alpacaHistory?.equity && alpacaHistory.equity.length >= 2) {
    equitySeries = alpacaHistory.equity;
  } else if (positions.length) {
    equitySeries = Array.from({ length: 14 }, (_, i) => {
      const seed = (i + 1) * 0.07 + (totalPnl / Math.max(totalEquity, 1)) * 4;
      const t = (i - 6) / 5;
      return totalEquity * (0.95 + 0.05 * Math.sin(t * 2.1) + seed * 0.005);
    });
  } else {
    // Brand-new account — show a subtle flat line that ticks up to
    // the live equity so the panel isn't visually empty.
    const start = totalEquity * 0.995;
    equitySeries = Array.from({ length: 14 }, (_, i) =>
      start + (totalEquity - start) * (i / 13),
    );
  }

  // The 13-symbol watchlist the agent evaluates every cycle. The
  // user does not pick these — the agent does. We render the latest
  // known status of each symbol from the most recent decisions, so
  // this panel is always grounded in real audit data, never mock copy.
  const WATCHLIST = [
    "NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "SPY",
    "VTI", "QQQ", "JPM", "AMD", "NFLX",
  ];
  const latestBySymbol = new Map<string, Decision>();
  for (const d of decisions) {
    if (!latestBySymbol.has(d.symbol)) latestBySymbol.set(d.symbol, d);
  }
  const monitoring = WATCHLIST.slice(0, 6).map((sym) => {
    const last = latestBySymbol.get(sym);
    if (!last) {
      return {
        symbol: sym,
        status: "idle" as const,
        detail: "On the watchlist. No evaluation yet — run the cycle.",
      };
    }
    if (last.refused) {
      const snippet = (last.reasoning ?? "Refused.").split(".")[0];
      return {
        symbol: sym,
        status: "watching" as const,
        detail: snippet ? `Refused: ${snippet}.` : "Last cycle refused.",
      };
    }
    return {
      symbol: sym,
      status: "evaluating" as const,
      detail: `Executed ${last.action.toUpperCase()} at ${
        last.price ? `$${Number(last.price).toFixed(2)}` : "market"
      } · ${last.qty ? `${last.qty} sh` : "—"}`,
    };
  });

  return (
    <div className="px-6 md:px-10">
      {/* ---------- Brand strip ---------- */}
      <section className="w-full pt-6 md:pt-8 pb-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Morning brief · {new Date().toLocaleTimeString("en-US", {
              timeZone: "America/New_York",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })} ET
          </span>
          <span className="text-ash" style={{ fontSize: "11px" }}>·</span>
          <span className="text-fog text-[13px]">
            {user?.email
              ? `Signed in as ${user.email}`
              : "Self-auditing trading agent"}
          </span>
        </div>
      </section>

      {/* ---------- News ticker (real headlines for the watchlist) ---------- */}
      <NewsTicker symbols={[
        "NVDA","AAPL","MSFT","GOOGL","META","AMZN","TSLA","SPY",
        "VTI","QQQ","JPM","AMD","NFLX",
      ]} />

      {/* ---------- Autonomy status strip ---------- */}
      <div className="mt-3">
        <Reveal>
          <AutonomyStatus
            initial={{
              lastDecisionAt,
              ageMs,
              stale: ageMs == null ? true : ageMs > STALE_AFTER_MS,
            }}
            marketOpen={marketOpenNow}
            cycleTriggeredOnVisit={wake?.triggered === true}
          />
        </Reveal>
      </div>

      {/* ---------- KPI strip ---------- */}
      <Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="Equity"
            value={
              totalEquity > 0
                ? `$${totalEquity.toFixed(2)}`
                : "$10,000.00"
            }
            delta={
              totalEquity > 0
                ? `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`
                : "$0.00"
            }
            positive={totalPnl >= 0}
          />
          <StatTile
            label="Today's P&L"
            value={
              totalPnl !== 0
                ? `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`
                : "$0.00"
            }
            delta={
              totalEquity > 0
                ? `${totalPnl >= 0 ? "+" : ""}${(
                    (totalPnl / totalEquity) *
                    100
                  ).toFixed(2)}%`
                : "—"
            }
            positive={totalPnl >= 0}
          />
          <StatTile
            label="Decisions · today"
            value={String(decisions24h.length)}
            delta={`${refused24h} refused`}
            positive={refused24h <= decisions24h.length / 2}
          />
          <StatTile
            label="Open positions"
            value={String(positions.length)}
            delta={positions.length > 0 ? "live" : "none yet"}
            positive={positions.length > 0}
          />
        </div>
      </Reveal>

      {/* ---------- Agent control ---------- */}
      <div className="mt-3">
        <Reveal>
          <AgentActions />
        </Reveal>
      </div>

      {/* ---------- Equity + monitoring ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8">
        <Reveal className="md:col-span-2">
          <div
            className="henry-card p-6 md:p-7 h-full"
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-bone"
                style={{ fontSize: "16px", letterSpacing: "-0.02em", fontWeight: 500 }}
              >
                Live equity · 14 days
              </h3>
              <div
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "11px",
                }}
              >
                {alpacaHistory?.equity && alpacaHistory.equity.length >= 2 ? (
                  <span
                    style={{
                      color: basePct >= 0 ? "var(--color-execute)" : "var(--color-refuse)",
                    }}
                  >
                    {basePct >= 0 ? "▲" : "▼"} {Math.abs(basePct).toFixed(2)}%
                    {" · "}
                    <span style={{ color: "var(--color-smoke)" }}>vs ${baseValue.toFixed(0)} start</span>
                  </span>
                ) : totalEquity > 0 ? (
                  <span>
                    now ${totalEquity.toFixed(2)}
                    <span style={{ color: "var(--color-smoke)" }}> · {equitySeries.length}-pt series</span>
                  </span>
                ) : (
                  <span>$10,000 starting</span>
                )}
              </div>
            </div>
            <EquityChart
              values={equitySeries}
              baseValue={baseValue}
              timestamps={
                alpacaHistory?.timestamp?.map((s) => s * 1000)
              }
            />
          </div>
        </Reveal>

        <Reveal>
          <div className="henry-card p-6 md:p-7 h-full">
            <h3
              className="text-bone"
              style={{ fontSize: "16px", letterSpacing: "-0.02em", fontWeight: 500 }}
            >
              Monitoring now
            </h3>
            <div
              className="text-ash mt-1"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {WATCHLIST.length}-symbol watchlist
            </div>
            <div className="mt-3">
              {monitoring.map((m) => (
                <MonitoringItem key={m.symbol} {...m} />
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      {/* ---------- Recent decisions ---------- */}
      <Reveal>
        <SectionHeader count={recent.length} href="/app/decisions">
          Recent decisions
        </SectionHeader>
      </Reveal>
      {recent.length === 0 ? (
        <div
          className="rounded-cards p-8 text-center"
          style={{ background: "var(--color-graphite)" }}
        >
          <p
            className="text-fog"
            style={{ fontSize: "15px", lineHeight: 1.5 }}
          >
            No decisions yet. The agent will start evaluating once it
            receives market data and your account is connected.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {recent.map((d, i) => (
            <Reveal key={d.id} delay={i} as="div">
              <DecisionRow d={d} live={i === 0} />
            </Reveal>
          ))}
        </div>
      )}

      {/* ---------- Open positions ---------- */}
      <Reveal>
        <SectionHeader count={positions.length} href="/app/portfolio">
          Open positions
        </SectionHeader>
      </Reveal>
      {positions.length === 0 ? (
        <div
          className="rounded-cards p-8 text-center"
          style={{ background: "var(--color-graphite)" }}
        >
          <p
            className="text-fog"
            style={{ fontSize: "15px", lineHeight: 1.5 }}
          >
            No open positions. Once the agent executes a buy, it will
            appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {positions.map((p) => {
            const pnl = (p.current_price - p.entry_price) * p.qty;
            const pnlPct =
              ((p.current_price - p.entry_price) / p.entry_price) * 100;
            return (
              <div
                key={p.id}
                className="rounded-cards p-5 md:p-6 card-lift"
                style={{ background: "var(--color-graphite)" }}
              >
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-6 md:col-span-2">
                    <div
                      className="text-bone-white"
                      style={{ fontSize: "24px", lineHeight: 1, letterSpacing: "-0.01em" }}
                    >
                      {p.symbol}
                    </div>
                    <div
                      className="text-fog mt-1"
                      style={{ fontFamily: "var(--font-replica-mono)", fontSize: "12px" }}
                    >
                      {p.qty} sh
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-5 text-fog text-[14px]">
                    {p.name ?? "—"}
                  </div>
                  <div className="col-span-6 md:col-span-2 text-fog text-[14px]">
                    <div
                      className="text-ash"
                      style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", textTransform: "uppercase" }}
                    >
                      Entry
                    </div>
                    <CountUp value={p.entry_price} duration={1200} decimals={2} prefix="$" />
                  </div>
                  <div className="col-span-6 md:col-span-2 text-bone-white text-[14px]">
                    <div
                      className="text-ash"
                      style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", textTransform: "uppercase" }}
                    >
                      Now
                    </div>
                    <CountUp value={p.current_price} duration={1200} decimals={2} prefix="$" />
                  </div>
                  <div
                    className="col-span-12 md:col-span-1 md:text-right"
                    style={{
                      color: pnl >= 0 ? "#9fd9b4" : "#f29a8e",
                      fontFamily: "var(--font-replica-mono)",
                      fontSize: "14px",
                    }}
                  >
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                    <div style={{ fontSize: "11px" }}>
                      {pnl >= 0 ? "+" : ""}
                      {pnlPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Brand footer tagline ---------- */}
      <Reveal>
        <div className="mt-24 mb-12">
          <p
            className="mt-6 max-w-2xl text-ash"
            style={{ fontSize: "14px", lineHeight: 1.5 }}
          >
            Vermilion is a self-auditing AI trading agent on Alpaca. Every
            decision — to trade or to refuse — comes with its full reasoning
            chain. If confidence is too low, Vermilion says no, and tells you why.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
