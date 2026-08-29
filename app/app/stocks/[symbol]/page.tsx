import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getAsset,
  getSnapshot,
  getBars,
  getNews,
  getAccountSummary,
  isMarketOpen,
  type Bar,
} from "@/lib/alpaca/server";
import { Reveal } from "@/app/components/Reveal";
import { CountUp } from "@/app/components/CountUp";
import { StockActions } from "@/app/components/StockActions";

type DecisionRow = {
  id: string;
  action: string;
  refused: boolean;
  confidence: number | null;
  reasoning: string | null;
  sources: { tag: string; text: string }[] | null;
  qty: number | null;
  price: number | null;
  created_at: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function PriceChart({ bars }: { bars: Bar[] }) {
  const W = 800;
  const H = 220;
  if (bars.length === 0) {
    return (
      <div
        className="h-44 flex items-center justify-center text-ash"
        style={{ fontFamily: "var(--font-replica-mono)", fontSize: "12px" }}
      >
        No intraday data available.
      </div>
    );
  }
  const closes = bars.map((b) => b.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const stepX = W / Math.max(bars.length - 1, 1);
  const points = bars.map((b, i) => {
    const x = i * stepX;
    const y = H - ((b.c - min) / range) * (H - 24) - 12;
    return [x, y] as const;
  });
  const pathD = "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");
  const areaD = pathD + ` L ${W},${H} L 0,${H} Z`;
  const first = bars[0].o;
  const last = bars[bars.length - 1].c;
  const up = last >= first;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height="auto"
        style={{ display: "block" }}
        aria-hidden
      >
        <defs>
          <linearGradient id="stock-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "#10b981" : "#f43f5e"} stopOpacity="0.18" />
            <stop offset="100%" stopColor={up ? "#10b981" : "#f43f5e"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#stock-fill)" />
        <path
          d={pathD}
          fill="none"
          stroke={up ? "#9fd9b4" : "#f29a8e"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="flex items-center justify-between mt-2"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "11px",
          color: "var(--color-ash)",
        }}
      >
        <span>{fmtTime(bars[0].t)} ET</span>
        <span>${last.toFixed(2)}</span>
        <span>{fmtTime(bars[bars.length - 1].t)} ET</span>
      </div>
    </div>
  );
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = raw.trim().toUpperCase();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Pull everything in parallel where we can
  const [asset, snap, decisions, watchRow, news, marketOpen, account] =
    await Promise.all([
      getAsset(symbol).catch(() => null),
      getSnapshot(symbol).catch(() => ({} as Awaited<ReturnType<typeof getSnapshot>>)),
      user
        ? supabase
            .from("decisions")
            .select("id, action, refused, confidence, reasoning, sources, qty, price, created_at")
            .eq("user_id", user.id)
            .eq("symbol", symbol)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] as DecisionRow[] }),
      user
        ? supabase
            .from("watchlist")
            .select("source")
            .eq("user_id", user.id)
            .eq("symbol", symbol)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getNews([symbol], 5).catch(() => ({ news: [] as Awaited<ReturnType<typeof getNews>>["news"] })),
      isMarketOpen(),
      getAccountSummary().catch(() => null),
    ]);

  // Intraday 5-min bars
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startISO = startOfDay.toISOString();
  const endISO = new Date().toISOString();
  const intraday = await getBars(symbol, "5Min", startISO, endISO, 200).catch(
    () => ({ bars: [] as Bar[] }),
  );

  const last =
    snap.latestTrade?.p ??
    snap.dailyBar?.c ??
    (snap.latestQuote
      ? (snap.latestQuote.ap + snap.latestQuote.bp) / 2
      : 0);
  const change = snap.dailyBar && last ? last - snap.dailyBar.o : 0;
  const changePct = snap.dailyBar && snap.dailyBar.o ? (change / snap.dailyBar.o) * 100 : 0;
  const dayHigh = snap.dailyBar?.h ?? 0;
  const dayLow = snap.dailyBar?.l ?? 0;
  const dayVol = snap.dailyBar?.v ?? 0;
  const onWatch = watchRow?.data ?? null;
  const decisionsArr: DecisionRow[] = (decisions as { data: DecisionRow[] }).data ?? [];

  return (
    <div className="px-6 md:px-10">
      <Reveal>
        <div className="w-full pt-6 md:pt-8 pb-2 flex items-center justify-between flex-wrap gap-2">
          <span
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Stock detail · {symbol}
          </span>
          <Link
            href="/app/watchlist"
            className="text-fog hover:text-bone-white transition-colors text-[13px]"
          >
            ← Back to watchlist
          </Link>
        </div>
      </Reveal>

      <Reveal>
        <div className="mt-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1
              className="text-bone-white"
              style={{ fontSize: "64px", lineHeight: 1, letterSpacing: "-0.02em" }}
            >
              {symbol}
            </h1>
            <p
              className="text-fog mt-2"
              style={{ fontSize: "16px", lineHeight: 1.4 }}
            >
              {asset?.name ?? "—"} · {asset?.exchange ?? "—"}
            </p>
          </div>
          <div className="text-right">
            <div
              className="text-bone-white"
              style={{ fontSize: "44px", lineHeight: 1, letterSpacing: "-0.014em" }}
            >
              {last ? <CountUp value={last} decimals={2} prefix="$" /> : "—"}
            </div>
            <div
              className="mt-2"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "14px",
                color: change >= 0 ? "#9fd9b4" : "#f29a8e",
              }}
            >
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({changePct.toFixed(2)}%) today
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="mt-4">
          <StockActions
            symbol={symbol}
            onWatch={!!onWatch}
            watchSource={onWatch?.source ?? null}
            marketOpen={marketOpen}
          />
        </div>
      </Reveal>

      <Reveal>
        <div
          className="mt-8 rounded-cards p-5 md:p-6"
          style={{ background: "var(--color-graphite)" }}
        >
          <h3
            className="text-bone-white"
            style={{ fontSize: "18px", letterSpacing: "-0.014em" }}
          >
            Intraday · 5-min bars
          </h3>
          <div className="mt-4">
            <PriceChart bars={intraday.bars ?? []} />
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
            <div className="text-ash" style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Day high
            </div>
            <div className="text-bone-white mt-2" style={{ fontSize: "24px" }}>
              ${dayHigh.toFixed(2)}
            </div>
          </div>
          <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
            <div className="text-ash" style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Day low
            </div>
            <div className="text-bone-white mt-2" style={{ fontSize: "24px" }}>
              ${dayLow.toFixed(2)}
            </div>
          </div>
          <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
            <div className="text-ash" style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Day volume
            </div>
            <div className="text-bone-white mt-2" style={{ fontSize: "24px" }}>
              {dayVol.toLocaleString()}
            </div>
          </div>
          <div className="rounded-cards p-5" style={{ background: "var(--color-graphite)" }}>
            <div className="text-ash" style={{ fontFamily: "var(--font-replica-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Tradeable
            </div>
            <div className="text-bone-white mt-2" style={{ fontSize: "24px" }}>
              {asset?.tradable ? "Yes" : "No"}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <h2
          className="text-bone-white font-normal mt-12"
          style={{ fontSize: "22px", letterSpacing: "-0.014em" }}
        >
          Recent decisions for {symbol}
          <span className="text-fog ml-3" style={{ fontSize: "16px", fontWeight: 400 }}>
            — {decisionsArr.length}
          </span>
        </h2>
      </Reveal>
      {decisionsArr.length === 0 ? (
        <div
          className="rounded-cards p-8 text-center mt-3"
          style={{ background: "var(--color-graphite)" }}
        >
          <p className="text-fog" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            No decisions yet for {symbol}. Hit "Run evaluation" above to grade it now.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-3">
          {decisionsArr.map((d) => (
            <div
              key={d.id}
              className="rounded-cards p-5"
              style={{ background: "var(--color-graphite)" }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="text-bone-white"
                  style={{ fontFamily: "var(--font-replica-mono)", fontSize: "12px" }}
                >
                  {fmtTime(d.created_at)} ET
                </span>
                <span
                  style={{
                    color: d.refused ? "#f29a8e" : "#9fd9b4",
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "12px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {d.action} {d.refused ? "(refused)" : ""}
                </span>
                {d.confidence != null && (
                  <span
                    style={{
                      fontFamily: "var(--font-replica-mono)",
                      fontSize: "12px",
                      color: "var(--color-ash)",
                    }}
                  >
                    {Math.round(d.confidence)}% conf
                  </span>
                )}
              </div>
              <p className="text-fog mt-2" style={{ fontSize: "14px", lineHeight: 1.4 }}>
                {d.reasoning ?? "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      {news.news && news.news.length > 0 && (
        <>
          <Reveal>
            <h2
              className="text-bone-white font-normal mt-12"
              style={{ fontSize: "22px", letterSpacing: "-0.014em" }}
            >
              Recent news
            </h2>
          </Reveal>
          <div className="flex flex-col gap-2 mt-3">
            {news.news.map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-cards p-4 transition-colors"
                style={{ background: "var(--color-graphite)" }}
              >
                <div
                  className="text-bone-white"
                  style={{ fontSize: "15px", lineHeight: 1.3 }}
                >
                  {n.headline}
                </div>
                <div
                  className="text-ash mt-1"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "11px",
                  }}
                >
                  {n.source} · {fmtTime(n.created_at)} ET
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
